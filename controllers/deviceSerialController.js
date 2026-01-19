import { rtdb } from "../config/db.js";

const SERIAL_NODE = "deviceSerials";


export const saveSerialDirect = async (req, res) => {
  try {
    const { deviceId, serialNo } = req.body;

    if (!deviceId || serialNo === undefined) {
      return res.status(400).json({
        success: false,
        message: "deviceId and serialNo are required"
      });
    }

    await rtdb.ref(`${SERIAL_NODE}/${deviceId}`).set({
      deviceId,
      serialNo
    });

    console.log(` SAVED → ${deviceId} = ${serialNo}`);

    return res.json({
      success: true,
      deviceId,
      serialNo
    });

  } catch (err) {
    console.error(" saveSerialDirect error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

export const getSerialByDeviceId = async (req, res) => {
  try {
    const { deviceId } = req.params;

    const snap = await rtdb
      .ref(`${SERIAL_NODE}/${deviceId}`)
      .get();

    if (!snap.exists()) {
      return res.status(404).json({
        success: false,
        message: "Serial not found"
      });
    }

    return res.json({
      success: true,
      deviceId,
      serialNo: snap.val().serialNo
    });

  } catch (err) {
    console.error(" getSerialByDeviceId error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};
