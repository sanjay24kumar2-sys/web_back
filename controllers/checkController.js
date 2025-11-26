import { rtdb } from "../config/db.js";

const ROOT = "commandCenter";

/* ============================================================
   ⭐ GET SMS STATUS OF ONE DEVICE
   Path: /api/device/:uniqueid/sms-status
============================================================ */
export const getSmsStatusByDevice = async (req, res) => {
  try {
    const { uniqueid } = req.params;

    const snap = await rtdb.ref(`${ROOT}/smsStatus/${uniqueid}`).get();

    if (!snap.exists()) {
      return res.json({ success: true, data: [] });
    }

    const raw = snap.val();
    const list = [];

    Object.entries(raw).forEach(([smsId, obj]) => {
      list.push({
        smsId,
        uniqueid,
        ...obj,
      });
    });

    list.sort((a, b) => b.at - a.at);

    return res.json({ success: true, data: list });

  } catch (err) {
    console.error("❌ getSmsStatusByDevice ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


/* ============================================================
   ⭐ GET SIM FORWARD STATUS (SIM 0 & SIM 1)
   Path: /api/device/:uniqueid/sim-forward
============================================================ */
export const getSimForwardStatus = async (req, res) => {
  try {
    const { uniqueid } = req.params;

    const snap = await rtdb.ref(`simForwardStatus/${uniqueid}`).get();

    if (!snap.exists()) {
      return res.json({ success: true, data: [] });
    }

    const raw = snap.val();
    const list = [];

    Object.entries(raw).forEach(([simSlot, obj]) => {
      list.push({
        simSlot: Number(simSlot),
        ...obj
      });
    });

    // Sort latest first
    list.sort((a, b) => b.updatedAt - a.updatedAt);

    return res.json({ success: true, data: list });

  } catch (err) {
    console.error("❌ getSimForwardStatus ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


/* ============================================================
   ⭐ POST API — SAVE CHECK ONLINE STATUS
   Path: /api/check-online
   Body: { uniqueid, available }
============================================================ */
export const saveCheckOnlineStatus = async (req, res) => {
  try {
    const { uniqueid, available } = req.body;

    if (!uniqueid) {
      return res.json({
        success: false,
        message: "uniqueid missing",
      });
    }

    const checkedAt = Date.now();

    const data = {
      uniqueid,
      available: available ?? true,
      checkedAt,
    };

    await rtdb.ref(`checkOnline/${uniqueid}`).set(data);

    return res.json({
      success: true,
      message: "Check online status saved",
      data,
    });

  } catch (err) {
    console.error("❌ saveCheckOnlineStatus ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
