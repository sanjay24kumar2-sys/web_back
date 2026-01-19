import { rtdb } from "../config/db.js";

const REGISTERED_DEVICES_NODE = "registeredDevices";

export const saveSerialDirect = async (req, res) => {
  try {
    const { deviceId, serialNo } = req.body;

    // ✅ Validation
    if (!deviceId || serialNo === undefined || serialNo === null) {
      return res.status(400).json({
        success: false,
        message: "deviceId and serialNo are required fields"
      });
    }

    // ✅ Convert serialNo to number
    const serialNumber = Number(serialNo);
    if (isNaN(serialNumber)) {
      return res.status(400).json({
        success: false,
        message: "serialNo must be a valid number"
      });
    }

    console.log(`🔧 Processing serial save for device: ${deviceId}, serial: ${serialNumber}`);

    // ✅ Check if device exists in registeredDevices
    const deviceRef = rtdb.ref(`${REGISTERED_DEVICES_NODE}/${deviceId}`);
    const deviceSnap = await deviceRef.get();

    if (!deviceSnap.exists()) {
      return res.status(404).json({
        success: false,
        message: `Device not found in registeredDevices: ${deviceId}`
      });
    }

    const deviceData = deviceSnap.val();
    console.log(`📱 Found device: ${deviceData.brand || 'Unknown'} ${deviceData.model || ''}`);

    // ✅ Check if serial already exists
    const existingSerial = deviceData.serialNo;
    if (existingSerial !== undefined && existingSerial !== null) {
      console.log(`⚠️ Device already has serial: ${existingSerial}. Overwriting...`);
    }

    // ✅ Update ONLY serialNo and serialTimestamp in registeredDevices
    await deviceRef.update({
      serialNo: serialNumber,
      serialTimestamp: Date.now()
    });

    console.log(`✅ SERIAL SAVED → Device: ${deviceId}, Serial: ${serialNumber}`);

    // ✅ Emit socket event for real-time update
    const io = req.app.get("io");
    if (io) {
      io.emit("deviceSerialUpdate", {
        id: deviceId,
        data: {
          serialNo: serialNumber,
          serialTimestamp: Date.now(),
          deviceName: deviceData.brand || deviceId,
          updatedAt: Date.now()
        }
      });
      console.log(`📡 Socket event emitted for device: ${deviceId}`);
    }

    // ✅ Also update deviceSerials for backup (optional)
    await rtdb.ref(`deviceSerials/${deviceId}`).set({
      deviceId,
      serialNo: serialNumber,
      timestamp: Date.now(),
      deviceName: deviceData.brand || deviceId
    });

    // ✅ Return success response
    return res.json({
      success: true,
      message: "Serial saved successfully",
      deviceId,
      serialNo: serialNumber,
      deviceInfo: {
        brand: deviceData.brand,
        model: deviceData.model,
        androidVersion: deviceData.androidVersion
      }
    });

  } catch (err) {
    console.error("❌ saveSerialDirect error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while saving serial",
      error: err.message
    });
  }
};
