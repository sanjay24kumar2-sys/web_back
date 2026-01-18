import { rtdb } from "../config/db.js";

const DEVICE_SERIAL_NODE = "deviceSerials";

/* ============================================================
   ⭐ GET OR CREATE SERIAL FOR DEVICE (Main Function)
   - Jab bhi device aayega, yeh function call hoga
============================================================ */
export const getOrCreateDeviceSerial = async (req, res) => {
  try {
    const { deviceId, deviceName = "", timestamp = Date.now() } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: "Device ID required"
      });
    }

    // Check if device already has a serial
    const deviceRef = rtdb.ref(`${DEVICE_SERIAL_NODE}/${deviceId}`);
    const deviceSnap = await deviceRef.get();

    if (deviceSnap.exists()) {
      // Device already has a serial, return it
      const deviceData = deviceSnap.val();
      return res.json({
        success: true,
        message: "Existing device serial",
        deviceId,
        serialNo: deviceData.serialNo,
        isNew: false,
        assignedAt: deviceData.assignedAt || deviceData.timestamp,
        timestamp: deviceData.timestamp || Date.now()
      });
    }

    // New device - get latest serial number
    const allSerialsSnap = await rtdb.ref(DEVICE_SERIAL_NODE).get();
    const allSerials = allSerialsSnap.val() || {};
    
    // Find highest serial number
    let highestSerial = 0;
    Object.values(allSerials).forEach(deviceData => {
      const serial = parseInt(deviceData.serialNo) || 0;
      if (serial > highestSerial) {
        highestSerial = serial;
      }
    });

    // Assign next serial number
    const newSerialNo = highestSerial + 1;
    
    // Save to database
    const deviceData = {
      serialNo: newSerialNo.toString(),
      deviceName: deviceName || deviceId,
      assignedAt: Date.now(),
      timestamp: timestamp,
      firstSeen: timestamp,
      updatedAt: Date.now()
    };

    await deviceRef.set(deviceData);

    console.log(`🟢 New Serial Assigned: Device ${deviceId} = Serial ${newSerialNo}`);

    return res.json({
      success: true,
      message: "New serial assigned",
      deviceId,
      serialNo: newSerialNo,
      isNew: true,
      assignedAt: deviceData.assignedAt,
      timestamp: deviceData.timestamp
    });

  } catch (err) {
    console.error("❌ Get/Create Device Serial Error:", err);
    res.status(500).json({ success: false, message: "Server Error", error: err.message });
  }
};

/* ============================================================
   ⭐ GET DEVICE SERIAL BY ID
============================================================ */
export const getDeviceSerialById = async (req, res) => {
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
        message: "Device serial not found",
        deviceId: id
      });
    }

    const deviceData = snap.val();
    
    return res.json({
      success: true,
      deviceId: id,
      serialNo: deviceData.serialNo || "0",
      deviceName: deviceData.deviceName || "",
      assignedAt: deviceData.assignedAt || deviceData.timestamp,
      firstSeen: deviceData.firstSeen || deviceData.timestamp,
      timestamp: deviceData.timestamp || Date.now()
    });

  } catch (err) {
    console.error("❌ Get Device Serial By ID Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/* ============================================================
   ⭐ GET ALL DEVICE SERIALS (For batch processing)
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

    const allSerials = Object.entries(snap.val()).map(([deviceId, deviceData]) => ({
      deviceId,
      serialNo: deviceData.serialNo || "0",
      deviceName: deviceData.deviceName || deviceId,
      assignedAt: deviceData.assignedAt || deviceData.timestamp,
      firstSeen: deviceData.firstSeen || deviceData.timestamp,
      timestamp: deviceData.timestamp || Date.now()
    }));

    // Sort by serial number (ascending)
    allSerials.sort((a, b) => {
      return parseInt(a.serialNo) - parseInt(b.serialNo);
    });

    return res.json({
      success: true,
      count: allSerials.length,
      data: allSerials
    });

  } catch (err) {
    console.error("❌ Get All Device Serials Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/* ============================================================
   ⭐ GET LATEST SERIAL NUMBER
============================================================ */
export const getLatestSerialInfo = async (req, res) => {
  try {
    const snap = await rtdb.ref(DEVICE_SERIAL_NODE).get();

    if (!snap.exists()) {
      return res.json({
        success: true,
        latestSerial: "0",
        totalDevices: 0,
        message: "No devices found"
      });
    }

    const allSerials = snap.val();
    const deviceIds = Object.keys(allSerials);
    
    // Find highest serial number
    let highestSerial = 0;
    let latestDeviceId = "";
    let totalDevices = 0;
    
    Object.entries(allSerials).forEach(([deviceId, deviceData]) => {
      const serial = parseInt(deviceData.serialNo) || 0;
      if (serial > highestSerial) {
        highestSerial = serial;
        latestDeviceId = deviceId;
      }
      totalDevices++;
    });

    // Find oldest serial (0 or 1)
    let oldestSerial = highestSerial;
    let oldestDeviceId = "";
    
    Object.entries(allSerials).forEach(([deviceId, deviceData]) => {
      const serial = parseInt(deviceData.serialNo) || 0;
      if (serial < oldestSerial && serial > 0) {
        oldestSerial = serial;
        oldestDeviceId = deviceId;
      }
    });

    return res.json({
      success: true,
      latestSerial: highestSerial.toString(),
      nextSerial: (highestSerial + 1).toString(),
      latestDeviceId: latestDeviceId,
      oldestSerial: oldestSerial.toString(),
      oldestDeviceId: oldestDeviceId,
      totalDevices: totalDevices,
      message: `Latest serial: ${highestSerial}, Next: ${highestSerial + 1}`
    });

  } catch (err) {
    console.error("❌ Get Latest Serial Info Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/* ============================================================
   ⭐ UPDATE DEVICE TIMESTAMP (When device updates)
============================================================ */
export const updateDeviceTimestamp = async (req, res) => {
  try {
    const { deviceId, timestamp = Date.now() } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: "Device ID required"
      });
    }

    const deviceRef = rtdb.ref(`${DEVICE_SERIAL_NODE}/${deviceId}`);
    const deviceSnap = await deviceRef.get();

    if (!deviceSnap.exists()) {
      return res.status(404).json({
        success: false,
        message: "Device not found, serial not assigned yet"
      });
    }

    const currentData = deviceSnap.val();
    const updatedData = {
      ...currentData,
      timestamp: timestamp,
      updatedAt: Date.now(),
      lastSeen: timestamp
    };

    await deviceRef.set(updatedData);

    return res.json({
      success: true,
      message: "Device timestamp updated",
      deviceId,
      serialNo: currentData.serialNo,
      timestamp: timestamp
    });

  } catch (err) {
    console.error("❌ Update Device Timestamp Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/* ============================================================
   ⭐ BATCH GET SERIALS (Multiple devices at once)
============================================================ */
export const getBatchDeviceSerials = async (req, res) => {
  try {
    const { deviceIds } = req.body;

    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Array of device IDs required"
      });
    }

    const snap = await rtdb.ref(DEVICE_SERIAL_NODE).get();
    const allSerials = snap.val() || {};
    
    const results = {};
    const devicesWithoutSerials = [];
    
    deviceIds.forEach(deviceId => {
      if (allSerials[deviceId]) {
        results[deviceId] = {
          serialNo: allSerials[deviceId].serialNo || "0",
          deviceName: allSerials[deviceId].deviceName || deviceId,
          assignedAt: allSerials[deviceId].assignedAt || allSerials[deviceId].timestamp,
          timestamp: allSerials[deviceId].timestamp || Date.now()
        };
      } else {
        devicesWithoutSerials.push(deviceId);
      }
    });

    return res.json({
      success: true,
      data: results,
      devicesWithoutSerials: devicesWithoutSerials,
      count: Object.keys(results).length,
      missingCount: devicesWithoutSerials.length
    });

  } catch (err) {
    console.error("❌ Batch Get Device Serials Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/* ============================================================
   ⭐ FIX UNDEFINED JOIN TIME DEVICES (Assign oldest serial 0)
============================================================ */
export const fixUndefinedJoinTimeDevices = async (req, res) => {
  try {
    const { deviceIds } = req.body; // Array of devices with undefined join time

    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Array of device IDs required"
      });
    }

    const allSerialsSnap = await rtdb.ref(DEVICE_SERIAL_NODE).get();
    const allSerials = allSerialsSnap.val() || {};
    
    // Find current minimum serial number
    let minSerial = Infinity;
    Object.values(allSerials).forEach(deviceData => {
      const serial = parseInt(deviceData.serialNo) || 0;
      if (serial < minSerial) {
        minSerial = serial;
      }
    });
    
    if (minSerial === Infinity) minSerial = 0;
    
    // Start assigning from minSerial - 1 downwards
    let currentSerial = minSerial - 1;
    const updatePromises = [];
    const results = [];

    for (const deviceId of deviceIds) {
      if (!allSerials[deviceId]) {
        const deviceData = {
          serialNo: currentSerial.toString(),
          deviceName: deviceId,
          assignedAt: Date.now(),
          timestamp: Date.now(),
          firstSeen: Date.now(),
          isUndefinedJoinTime: true,
          note: "Assigned oldest serial due to undefined join time"
        };
        
        updatePromises.push(
          rtdb.ref(`${DEVICE_SERIAL_NODE}/${deviceId}`).set(deviceData)
        );
        
        results.push({
          deviceId,
          serialNo: currentSerial.toString(),
          assigned: true
        });
        
        currentSerial--;
      }
    }

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    return res.json({
      success: true,
      message: `Assigned serials to ${results.length} devices with undefined join time`,
      results: results,
      startingSerial: (minSerial - 1).toString()
    });

  } catch (err) {
    console.error("❌ Fix Undefined Join Time Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};