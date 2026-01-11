import { rtdb } from "../config/db.js";

const DEVICE_NODE = "registeredDevices";
const STATUS_NODE = "status";
const LIKES_NODE = "deviceLikes";
const HEARTBEAT_NODE = "deviceHeartbeat";
const COMMANDS_NODE = "deviceCommands";

export const deleteDevice = async (req, res) => {
  try {
    const { uid } = req.params;
    const userId = req.user?.userId || "admin";

    if (!uid) {
      return res.status(400).json({
        success: false,
        message: "Device UID is required"
      });
    }

    console.log(`🗑️ Deleting device ${uid} by user ${userId}`);

    const deviceSnap = await rtdb.ref(`${DEVICE_NODE}/${uid}`).get();
    
    if (!deviceSnap.exists()) {
      return res.status(404).json({
        success: false,
        message: "Device not found"
      });
    }

    const deviceData = deviceSnap.val();
    const deviceName = deviceData.deviceName || deviceData.model || deviceData.brand || "Unknown";

    // Remove from all related nodes
    const deletePromises = [
      rtdb.ref(`${DEVICE_NODE}/${uid}`).remove(),
      rtdb.ref(`${STATUS_NODE}/${uid}`).remove(),
      rtdb.ref(`${LIKES_NODE}/${uid}`).remove(),
      rtdb.ref(`${HEARTBEAT_NODE}/${uid}`).remove(),
      rtdb.ref(`${COMMANDS_NODE}/${uid}`).remove()
    ];

    await Promise.all(deletePromises);

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("deviceDeleted", {
        uid,
        deletedBy: userId,
        deviceName: deviceName,
        timestamp: Date.now()
      });
    }

    console.log(`✅ Device ${uid} (${deviceName}) deleted successfully by ${userId}`);

    return res.json({
      success: true,
      message: "Device deleted successfully",
      deletedDevice: {
        uid,
        name: deviceName
      }
    });

  } catch (err) {
    console.error("❌ Delete Device Error:", err);
    res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
};