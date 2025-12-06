// controllers/notificationController.js
import { rtdb } from "../config/db.js";

const SMS_NODE = "smsLogs";

function normalizeSmsListForUid(uid, rawNode) {
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
        list.push({
          id: k1,
          uniqueid: uid,
          ...v1,
        });
      } else {
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

/* ======================================================
      GET ALL SMS (FLATTENED LIST)
====================================================== */
export async function getAllSmsLogs(req, res) {
  try {
    const snap = await rtdb.ref(SMS_NODE).get();
    if (!snap.exists()) return res.json({ success: true, data: [] });

    const raw = snap.val() || {};
    let final = [];

    Object.entries(raw).forEach(([uid, node]) => {
      final = final.concat(normalizeSmsListForUid(uid, node));
    });

    final.sort(
      (a, b) => Number(b.timestamp || b.date || 0) - Number(a.timestamp || a.date || 0)
    );

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
    if (!snap.exists()) return res.json({ success: true, data: [] });

    const raw = snap.val() || {};
    const final = normalizeSmsListForUid(uid, raw);

    final.sort(
      (a, b) => Number(b.timestamp || b.date || 0) - Number(a.timestamp || a.date || 0)
    );

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

    const snap = await rtdb.ref(`${SMS_NODE}/${uid}`).get();
    if (!snap.exists()) return res.json({ success: true, data: null });

    const raw = snap.val() || {};
    const list = normalizeSmsListForUid(uid, raw);

    if (!list.length) return res.json({ success: true, data: null });

    list.sort(
      (a, b) => Number(b.timestamp || b.date || 0) - Number(a.timestamp || a.date || 0)
    );

    return res.json({ success: true, data: list[0] });
  } catch (err) {
    console.error("❌ getLatestSmsByDevice ERROR:", err.message);
    res.status(500).json({ success: false });
  }
}
