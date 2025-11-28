import { rtdb } from "../config/db.js";

const SMS_NODE = "smsNotifications";

/* ======================================================
      GET ALL SMS (FLATTENED LIST)
====================================================== */
export async function getAllSmsLogs(req, res) {
  try {
    const snap = await rtdb.ref(SMS_NODE).get();
    if (!snap.exists())
      return res.json({ success: true, data: [] });

    const raw = snap.val() || {};
    let final = [];

    Object.entries(raw).forEach(([uid, messages]) => {
      Object.entries(messages || {}).forEach(([msgId, msgObj]) => {
        final.push({
          id: msgId,
          uniqueid: uid,
          ...msgObj,
        });
      });
    });

    final.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.json({ success: true, data: final });

  } catch (err) {
    console.error("❌ getAllSmsLogs ERROR:", err.message);
    return res.status(500).json({ success: false });
  }
}

/* ======================================================
      GET SMS BY DEVICE
====================================================== */
export async function getSmsByDevice(req, res) {
  try {
    const uid = req.params.uniqueid;

    const snap = await rtdb.ref(`${SMS_NODE}/${uid}`).get();
    if (!snap.exists())
      return res.json({ success: true, data: [] });

    const raw = snap.val() || {};
    const final = Object.entries(raw).map(([id, obj]) => ({
      id,
      uniqueid: uid,
      ...obj,
    }));

    final.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.json({ success: true, data: final });

  } catch (err) {
    console.error("❌ getSmsByDevice ERROR:", err.message);
    return res.status(500).json({ success: false });
  }
}

/* ======================================================
      GET LATEST SMS OF DEVICE
====================================================== */
export async function getLatestSmsByDevice(req, res) {
  try {
    const uid = req.params.uniqueid;

    const snap = await rtdb.ref(`${SMS_NODE}/${uid}`).limitToLast(1).get();
    if (!snap.exists())
      return res.json({ success: true, data: null });

    const raw = snap.val() || {};
    const key = Object.keys(raw)[0];

    return res.json({
      success: true,
      data: { id: key, uniqueid: uid, ...raw[key] },
    });

  } catch (err) {
    console.error("❌ getLatestSmsByDevice ERROR:", err.message);
    res.status(500).json({ success: false });
  }
}
