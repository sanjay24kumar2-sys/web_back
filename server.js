// ===============================================
//  SERVER.JS — FULL MASTER VERSION (A-TO-Z)
// ===============================================

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

/* ---------------- SOCKET.IO SETUP ---------------- */
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.set("io", io);

const deviceSockets = new Map();
let lastDevicesList = [];

/* ---------------- ID Cleaner ---------------- */
const clean = (id) => id?.toString()?.trim()?.toUpperCase();


/* ======================================================
      HIGH PRIORITY FCM PUSHER
====================================================== */
async function sendFcmHighPriority(token, type, payload = {}) {
  if (!token) {
    console.log("⚠️ Missing FCM Token");
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


/* ======================================================
      BUILD DEVICES LIST
====================================================== */
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
      lastSeen: st.timestamp || null,
    };
  });
}


/* ======================================================
      BROADCAST LIVE DEVICES TO ALL CLIENTS
====================================================== */
async function refreshDevicesLive(reason = "") {
  try {
    const devices = await buildDevicesList();
    lastDevicesList = devices;

    console.log(`📡 devicesLive (${reason}) total=${devices.length}`);

    io.emit("devicesLive", {
      success: true,
      count: devices.length,
      data: devices,
    });

  } catch (err) {
    console.error("❌ refreshDevicesLive ERROR:", err.message);
  }
}


/* ======================================================
      SOCKET.IO CONNECTION HANDLER
====================================================== */
io.on("connection", (socket) => {
  console.log("🔗 Client Connected:", socket.id);

  let currentDeviceId = null;

  // Send initial list
  socket.emit("devicesLive", {
    success: true,
    count: lastDevicesList.length,
    data: lastDevicesList,
  });

  /* ========== DEVICE REGISTRATION ========== */
  socket.on("registerDevice", async (rawId) => {
    const id = clean(rawId);
    if (!id) return;

    deviceSockets.set(id, socket.id);
    currentDeviceId = id;

    console.log("📱 Device Registered:", id);

    await rtdb.ref(`status/${id}`).set({
      connectivity: "Online",
      timestamp: Date.now(),
    });

    io.emit("deviceStatus", { id, connectivity: "Online" });
    refreshDevicesLive(`deviceOnline:${id}`);
  });

  /* ========== DISCONNECT ========== */
  socket.on("disconnect", async () => {
    if (currentDeviceId) {
      await rtdb.ref(`status/${currentDeviceId}`).set({
        connectivity: "Offline",
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



/* ======================================================
      LEGACY /send-command
====================================================== */
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
    console.error("❌ Error send-command:", err.message);
    return res.status(500).json({ success: false });
  }
});



/* ======================================================
      BRO_REPLY LIVE SECTION
====================================================== */
const liveReplyWatchers = new Map();

function stopReplyWatcher(uid) {
  if (liveReplyWatchers.has(uid)) {
    const ref = liveReplyWatchers.get(uid);
    ref.off();
    liveReplyWatchers.delete(uid);
    console.log("🛑 Reply watcher stopped:", uid);
  }
}

function startReplyWatcher(uid) {
  const ref = rtdb.ref(`checkOnline/${uid}`);

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
    console.log("🔥 LIVE brosReply:", uid, data);

    io.emit("brosReplyUpdate", {
      uid,
      success: true,
      data: { uid, ...data },
    });
  });

  liveReplyWatchers.set(uid, ref);
  console.log("🎧 Reply watcher started:", uid);
}


// API: Start live reply listening
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
    console.error("❌ brosreply ERROR:", err.message);
    res.status(500).json({ success: false });
  }
});



// ADMIN UPDATE
rtdb.ref("commandCenter/admin/main").on("value", async (snap) => {
  if (!snap.exists()) return;

  const adminData = snap.val();
  console.log("🔥 Admin updated:", adminData);

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



// DEVICE COMMAND HANDLER
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

rtdb.ref("commandCenter/deviceCommands").on("child_added", handleDeviceCommandChange);
rtdb.ref("commandCenter/deviceCommands").on("child_changed", handleDeviceCommandChange);


/* ======================================================
      CHECK ONLINE + RESET TIMER LOGIC
====================================================== */
// FULL FIXED RESET CLOCK LOGIC
async function handleCheckOnlineChange(snap) {
  if (!snap.exists()) return;

  const uid = snap.key;
  const data = snap.val() || {};

  const now = Date.now();

  // 1) WRITE RESET COLLECTION (fine)
  await rtdb.ref(`resetCollection/${uid}`).set({
    resetAt: now,
    readable: new Date(now).toString(),
  });

  // 2) ⭐ MOST IMPORTANT: UPDATE STATUS NODE
  await rtdb.ref(`status/${uid}`).update({
    connectivity: "Online",
    lastSeen: now,       // ⭐ FRONTEND LIVE TIMER NEEDS THIS
    timestamp: now       // ⭐ fallback for lastSeen
  });

  console.log(`♻️ RESET CLOCK UPDATED for ${uid} → ${now}`);

  // 3) 🔥 Send to frontend
  io.emit("deviceStatus", {
    id: uid,
    connectivity: "Online",
    lastSeen: now
  });

  // 4) OLD CHECK LOGIC (FCM ping)
  const devSnap = await rtdb.ref(`registeredDevices/${uid}`).get();
  const token = devSnap.val()?.fcmToken;
  if (!token) return;

  await sendFcmHighPriority(token, "CHECK_ONLINE", {
    uniqueid: uid,
    available: data.available || "unknown",
    checkedAt: String(data.checkedAt || "")
  });
}

const checkOnlineRef = rtdb.ref("checkOnline");
checkOnlineRef.on("child_added", handleCheckOnlineChange);
checkOnlineRef.on("child_changed", handleCheckOnlineChange);



/* ======================================================
      ⭐⭐ NEW ADDITION — RESTART API
====================================================== */

// POST: Set restart request (Always stored)
app.post("/restart/:uid", async (req, res) => {
  try {
    const uid = clean(req.params.uid);
    const now = Date.now();

    await rtdb.ref(`restart/${uid}`).set({
      restartAt: now,
      readable: new Date(now).toString(),
    });

    return res.json({ success: true, restartAt: now });

  } catch (err) {
    console.error("❌ restart set ERROR:", err.message);
    res.status(500).json({ success: false });
  }
});


// GET: Restart info (BUT ONLY VISIBLE FOR 15 MINUTES)
const RESTART_EXPIRY = 15 * 60 * 1000;

app.get("/restart/:uid", async (req, res) => {
  try {
    const uid = clean(req.params.uid);

    const snap = await rtdb.ref(`restart/${uid}`).get();
    if (!snap.exists()) {
      return res.json({ success: true, data: null });
    }

    const data = snap.val();
    const diff = Date.now() - Number(data.restartAt);

    if (diff > RESTART_EXPIRY) {
      // Auto remove
      await rtdb.ref(`restart/${uid}`).remove();
      return res.json({ success: true, data: null });
    }

    return res.json({
      success: true,
      data: {
        uid,
        restartAt: data.restartAt,
        readable: data.readable,
        age: diff
      }
    });

  } catch (err) {
    console.error("❌ restart get ERROR:", err.message);
    res.status(500).json({ success: false });
  }
});



/* ======================================================
      ⭐⭐ NEW ADDITION — UNLIMITED LAST CHECK API
====================================================== */

function formatAgo(ms) {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec} sec`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr`;
  const day = Math.floor(hr / 24);
  return `${day} days`;
}

app.get("/api/lastcheck/:uid", async (req, res) => {
  try {
    const uid = clean(req.params.uid);
    const snap = await rtdb.ref(`status/${uid}`).get();

    if (!snap.exists()) {
      return res.json({ success: false, message: "No status found" });
    }

    const st = snap.val();

    return res.json({
      success: true,
      uid,
      lastCheckAt: st.timestamp || st.lastSeen || null,
      readable: formatAgo(st.timestamp || st.lastSeen || 0),
    });

  } catch (err) {
    console.error("❌ lastcheck ERROR:", err.message);
    res.status(500).json({ success: false });
  }
});



/* ======================================================
      INITIAL LOAD
====================================================== */
refreshDevicesLive("initial");


/* ======================================================
      ROUTES
====================================================== */
app.use(adminRoutes);
app.use(notificationRoutes);
app.use("/api", checkRoutes);
app.use(commandRoutes);


/* ======================================================
      ROOT
====================================================== */
app.get("/", (_, res) => {
  res.send(" RTDB + Socket.IO Backend Running");
});


/* ======================================================
      START SERVER
====================================================== */
server.listen(PORT, () => {
  console.log(`🚀 Server running on PORT ${PORT}`);
});
