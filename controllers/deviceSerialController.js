// controllers/deviceSerialController.js
import { rtdb } from "../config/db.js";

const DEVICE_SERIAL_NODE = "deviceSerials"; // RTDB me root node

/* ============================================================
   ⭐ POST DEVICE SERIAL
   - Body: { id, serialNo, time }
============================================================ */
export const postDeviceSerial = async (req, res) => {
  try {
    const { id, serialNo, time } = req.body;

    if (!id || !serialNo || !time) {
      return res.status(400).json({
        success: false,
        message: "id, serialNo aur time required hai"
      });
    }

    const data = { serialNo, time };

    await rtdb.ref(`${DEVICE_SERIAL_NODE}/${id}`).set(data);

    console.log("🟢 Device Serial Saved:", id, data);

    return res.json({
      success: true,
      message: "Device serial saved successfully",
      id,
      data
    });

  } catch (err) {
    console.error("❌ Post Device Serial Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/* ============================================================
   ⭐ GET DEVICE BY ID
============================================================ */
export const getDeviceById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Device ID required"
      });
    }

    const snap = await rtdb.ref(`${DEVICE_SERIAL_NODE}/${id}`).get();

    if (!snap.exists()) {
      return res.status(404).json({
        success: false,
        message: "Device not found"
      });
    }

    return res.json({
      success: true,
      id,
      data: snap.val()
    });

  } catch (err) {
    console.error("❌ Get Device By ID Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/* ============================================================
   ⭐ GET ALL DEVICE SERIALS
============================================================ */
export const getAllDeviceSerials = async (req, res) => {
  try {
    const snap = await rtdb.ref(DEVICE_SERIAL_NODE).get();

    if (!snap.exists()) {
      return res.json({
        success: true,
        count: 0,
        data: []
      });
    }

    const allDevices = Object.entries(snap.val()).map(([id, obj]) => ({
      id,
      ...obj
    }));

    return res.json({
      success: true,
      count: allDevices.length,
      data: allDevices
    });

  } catch (err) {
    console.error("❌ Get All Device Serials Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
