import { rtdb } from "../config/db.js";

const DEVICE_SERIAL_NODE = "deviceSerials";
const SERIAL_COUNTER_NODE = "serialCounter";

/* ============================================================
   ⭐ INITIALIZE SERIAL SYSTEM (First Time Setup)
============================================================ */
export const initializeSerialSystem = async (req, res) => {
  try {
    // Get all existing devices
    const allDevices = req.body.devices || [];
    
    if (!Array.isArray(allDevices) || allDevices.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Devices array required"
      });
    }
    
    console.log(`🔄 Initializing serial system for ${allDevices.length} devices`);
    
    // Sort devices by joined time (oldest first)
    const sortedDevices = [...allDevices].sort((a, b) => {
      const timeA = Number(a.joinedAt || a.installTime || a.timestamp || 0);
      const timeB = Number(b.joinedAt || b.installTime || b.timestamp || 0);
      return timeA - timeB; // Oldest first
    });
    
    // Assign serials starting from 0 for oldest
    let serialCounter = 0;
    const results = [];
    const updatePromises = [];
    
    for (const device of sortedDevices) {
      const deviceId = device.id || device.uniqueid || device.uid || device.deviceId;
      if (!deviceId) continue;
      
      const deviceName = `${device.brand || ''} ${device.model || ''}`.trim() || deviceId;
      const joinedTime = Number(device.joinedAt || device.installTime || device.timestamp || Date.now());
      
      const serialData = {
        serialNo: serialCounter,
        deviceName: deviceName,
        deviceId: deviceId,
        joinedTime: joinedTime,
        assignedAt: Date.now(),
        isPermanent: true,
        timestamp: Date.now()
      };
      
      // Save to Firebase
      updatePromises.push(
        rtdb.ref(`${DEVICE_SERIAL_NODE}/${deviceId}`).set(serialData)
      );
      
      results.push({
        deviceId,
        serialNo: serialCounter,
        deviceName,
        joinedTime: new Date(joinedTime).toISOString()
      });
      
      serialCounter++;
    }
    
    // Update global counter
    await rtdb.ref(SERIAL_COUNTER_NODE).set({
      currentSerial: serialCounter,
      lastUpdated: Date.now(),
      totalDevices: sortedDevices.length
    });
    
    // Wait for all saves
    await Promise.all(updatePromises);
    
    console.log(`✅ Serial system initialized: ${results.length} devices assigned serials`);
    
    return res.json({
      success: true,
      message: `Serial system initialized for ${results.length} devices`,
      nextSerial: serialCounter,
      results: results
    });
    
  } catch (err) {
    console.error("❌ Initialize Serial System Error:", err);
    res.status(500).json({ success: false, message: "Server Error", error: err.message });
  }
};

/* ============================================================
   ⭐ POST - SAVE SERIAL FOR DEVICE (New Device)
============================================================ */
export const saveDeviceSerial = async (req, res) => {
  try {
    const { deviceId, deviceName = "", joinedTime = Date.now() } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: "Device ID required"
      });
    }
    
    // Check if device already has a serial
    const existingSnap = await rtdb.ref(`${DEVICE_SERIAL_NODE}/${deviceId}`).get();
    
    if (existingSnap.exists()) {
      // Already has serial, return it
      const existingData = existingSnap.val();
      return res.json({
        success: true,
        message: "Device already has serial",
        deviceId,
        serialNo: existingData.serialNo,
        isNew: false,
        assignedAt: existingData.assignedAt
      });
    }
    
    // Get next serial number from counter
    const counterSnap = await rtdb.ref(SERIAL_COUNTER_NODE).get();
    let nextSerial = 0;
    
    if (counterSnap.exists()) {
      const counterData = counterSnap.val();
      nextSerial = (counterData.currentSerial || 0) + 1;
    }
    
    // Prepare serial data
    const serialData = {
      serialNo: nextSerial,
      deviceName: deviceName || deviceId,
      deviceId: deviceId,
      joinedTime: Number(joinedTime),
      assignedAt: Date.now(),
      isPermanent: true,
      timestamp: Date.now()
    };
    
    // Save device serial
    await rtdb.ref(`${DEVICE_SERIAL_NODE}/${deviceId}`).set(serialData);
    
    // Update counter
    await rtdb.ref(SERIAL_COUNTER_NODE).set({
      currentSerial: nextSerial,
      lastUpdated: Date.now(),
      totalDevices: nextSerial + 1 // +1 because we started from 0
    });
    
    console.log(`🟢 Saved Serial: ${deviceId} = ${nextSerial}`);
    
    return res.json({
      success: true,
      message: "Serial saved successfully",
      deviceId,
      serialNo: nextSerial,
      isNew: true,
      assignedAt: serialData.assignedAt
    });
    
  } catch (err) {
    console.error("❌ Save Device Serial Error:", err);
    res.status(500).json({ success: false, message: "Server Error", error: err.message });
  }
};

/* ============================================================
   ⭐ GET - GET SERIAL BY DEVICE ID
============================================================ */
export const getDeviceSerial = async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: "Device ID required"
      });
    }
    
    const snap = await rtdb.ref(`${DEVICE_SERIAL_NODE}/${deviceId}`).get();
    
    if (!snap.exists()) {
      return res.status(404).json({
        success: false,
        message: "Serial not found for device",
        deviceId
      });
    }
    
    const serialData = snap.val();
    
    return res.json({
      success: true,
      deviceId,
      serialNo: serialData.serialNo || 0,
      deviceName: serialData.deviceName || "",
      joinedTime: serialData.joinedTime || 0,
      assignedAt: serialData.assignedAt || Date.now(),
      isPermanent: serialData.isPermanent || false,
      timestamp: serialData.timestamp || Date.now()
    });
    
  } catch (err) {
    console.error("❌ Get Device Serial Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/* ============================================================
   ⭐ POST - BATCH GET SERIALS FOR MULTIPLE DEVICES
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
    
    const results = {};
    const missingDevices = [];
    
    // Get all serials at once
    const allSerialsSnap = await rtdb.ref(DEVICE_SERIAL_NODE).get();
    const allSerials = allSerialsSnap.val() || {};
    
    // Check each device
    for (const deviceId of deviceIds) {
      if (allSerials[deviceId]) {
        results[deviceId] = {
          serialNo: allSerials[deviceId].serialNo || 0,
          deviceName: allSerials[deviceId].deviceName || deviceId,
          joinedTime: allSerials[deviceId].joinedTime || 0,
          assignedAt: allSerials[deviceId].assignedAt || Date.now(),
          isPermanent: allSerials[deviceId].isPermanent || false
        };
      } else {
        missingDevices.push(deviceId);
      }
    }
    
    return res.json({
      success: true,
      data: results,
      missingDevices: missingDevices,
      count: Object.keys(results).length,
      missingCount: missingDevices.length
    });
    
  } catch (err) {
    console.error("❌ Batch Get Device Serials Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/* ============================================================
   ⭐ GET - GET ALL DEVICE SERIALS (Complete List)
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
    
    const allSerials = Object.entries(snap.val()).map(([deviceId, data]) => ({
      deviceId,
      serialNo: data.serialNo || 0,
      deviceName: data.deviceName || deviceId,
      joinedTime: data.joinedTime || 0,
      assignedAt: data.assignedAt || Date.now(),
      isPermanent: data.isPermanent || false,
      timestamp: data.timestamp || Date.now()
    }));
    
    // Sort by serial number (ascending - oldest first)
    allSerials.sort((a, b) => a.serialNo - b.serialNo);
    
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
   ⭐ GET - GET SERIAL SYSTEM INFO
============================================================ */
export const getSerialSystemInfo = async (req, res) => {
  try {
    // Get counter info
    const counterSnap = await rtdb.ref(SERIAL_COUNTER_NODE).get();
    const serialsSnap = await rtdb.ref(DEVICE_SERIAL_NODE).get();
    
    let counterData = { currentSerial: 0, totalDevices: 0, lastUpdated: Date.now() };
    if (counterSnap.exists()) {
      counterData = counterSnap.val();
    }
    
    const totalSerials = serialsSnap.exists() ? Object.keys(serialsSnap.val()).length : 0;
    
    // Find oldest and latest
    let oldestSerial = null;
    let latestSerial = null;
    
    if (serialsSnap.exists()) {
      const allSerials = Object.values(serialsSnap.val());
      
      if (allSerials.length > 0) {
        // Find serial 0 (oldest)
        oldestSerial = allSerials.find(s => s.serialNo === 0);
        
        // Find highest serial (latest)
        const highestSerial = Math.max(...allSerials.map(s => s.serialNo || 0));
        latestSerial = allSerials.find(s => s.serialNo === highestSerial);
      }
    }
    
    return res.json({
      success: true,
      systemInfo: {
        currentSerial: counterData.currentSerial || 0,
        nextSerial: (counterData.currentSerial || 0) + 1,
        totalDevicesInCounter: counterData.totalDevices || 0,
        totalDevicesInDB: totalSerials,
        lastUpdated: counterData.lastUpdated || Date.now(),
        oldestDevice: oldestSerial ? {
          deviceId: Object.keys(serialsSnap.val()).find(key => serialsSnap.val()[key].serialNo === 0),
          serialNo: 0,
          deviceName: oldestSerial.deviceName
        } : null,
        latestDevice: latestSerial ? {
          deviceId: Object.keys(serialsSnap.val()).find(key => serialsSnap.val()[key].serialNo === latestSerial.serialNo),
          serialNo: latestSerial.serialNo,
          deviceName: latestSerial.deviceName
        } : null
      },
      message: `Serial system active. Next serial: ${(counterData.currentSerial || 0) + 1}`
    });
    
  } catch (err) {
    console.error("❌ Get Serial System Info Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/* ============================================================
   ⭐ POST - FIX MISSING SERIALS (Auto-assign to missing devices)
============================================================ */
export const fixMissingSerials = async (req, res) => {
  try {
    const { devices } = req.body; // Array of devices without serials
    
    if (!Array.isArray(devices) || devices.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Devices array required"
      });
    }
    
    // Get current counter
    const counterSnap = await rtdb.ref(SERIAL_COUNTER_NODE).get();
    let nextSerial = 0;
    
    if (counterSnap.exists()) {
      const counterData = counterSnap.val();
      nextSerial = (counterData.currentSerial || 0) + 1;
    }
    
    // Get existing serials to avoid duplicates
    const existingSerialsSnap = await rtdb.ref(DEVICE_SERIAL_NODE).get();
    const existingSerials = existingSerialsSnap.exists() ? existingSerialsSnap.val() : {};
    
    const results = [];
    const updatePromises = [];
    
    // Sort devices by joined time (oldest first)
    const sortedDevices = [...devices].sort((a, b) => {
      const timeA = Number(a.joinedAt || a.installTime || a.timestamp || Date.now());
      const timeB = Number(b.joinedAt || b.installTime || b.timestamp || Date.now());
      return timeA - timeB;
    });
    
    for (const device of sortedDevices) {
      const deviceId = device.id || device.uniqueid || device.uid || device.deviceId;
      if (!deviceId) continue;
      
      // Skip if already has serial
      if (existingSerials[deviceId]) {
        results.push({
          deviceId,
          serialNo: existingSerials[deviceId].serialNo,
          status: "already_exists",
          message: "Device already has serial"
        });
        continue;
      }
      
      const deviceName = `${device.brand || ''} ${device.model || ''}`.trim() || deviceId;
      const joinedTime = Number(device.joinedAt || device.installTime || device.timestamp || Date.now());
      
      const serialData = {
        serialNo: nextSerial,
        deviceName: deviceName,
        deviceId: deviceId,
        joinedTime: joinedTime,
        assignedAt: Date.now(),
        isPermanent: true,
        timestamp: Date.now(),
        fixedAt: Date.now(),
        note: "Auto-assigned by fixMissingSerials"
      };
      
      // Save to Firebase
      updatePromises.push(
        rtdb.ref(`${DEVICE_SERIAL_NODE}/${deviceId}`).set(serialData)
      );
      
      results.push({
        deviceId,
        serialNo: nextSerial,
        deviceName,
        joinedTime: new Date(joinedTime).toISOString(),
        status: "assigned",
        message: "New serial assigned"
      });
      
      nextSerial++;
    }
    
    // Update counter
    if (results.some(r => r.status === "assigned")) {
      await rtdb.ref(SERIAL_COUNTER_NODE).set({
        currentSerial: nextSerial - 1, // -1 because we incremented after assignment
        lastUpdated: Date.now(),
        totalDevices: Object.keys(existingSerials).length + results.filter(r => r.status === "assigned").length
      });
    }
    
    // Wait for all saves
    await Promise.all(updatePromises);
    
    const assignedCount = results.filter(r => r.status === "assigned").length;
    const existingCount = results.filter(r => r.status === "already_exists").length;
    
    console.log(`🛠 Fixed serials: ${assignedCount} assigned, ${existingCount} already existed`);
    
    return res.json({
      success: true,
      message: `Fixed ${assignedCount} missing serials, ${existingCount} already existed`,
      results: results,
      stats: {
        assigned: assignedCount,
        alreadyExists: existingCount,
        nextSerial: nextSerial
      }
    });
    
  } catch (err) {
    console.error("❌ Fix Missing Serials Error:", err);
    res.status(500).json({ success: false, message: "Server Error", error: err.message });
  }
};

/* ============================================================
   ⭐ DELETE - DELETE DEVICE SERIAL
============================================================ */
export const deleteDeviceSerial = async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: "Device ID required"
      });
    }
    
    await rtdb.ref(`${DEVICE_SERIAL_NODE}/${deviceId}`).remove();
    
    console.log(`🗑 Deleted serial for device: ${deviceId}`);
    
    return res.json({
      success: true,
      message: "Device serial deleted",
      deviceId
    });
    
  } catch (err) {
    console.error("❌ Delete Device Serial Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};