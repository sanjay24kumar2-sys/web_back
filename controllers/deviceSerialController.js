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

// ✅ NEW: Get all serials at once
export const getAllSerials = async (req, res) => {
  try {
    // Extract userId from authenticated user (assuming you have auth middleware)
    const userId = req.user?.id || req.user?.uid;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User ID not found"
      });
    }

    // Fetch all serials from the SERIAL_NODE
    const snap = await rtdb.ref(SERIAL_NODE).get();

    if (!snap.exists()) {
      return res.json({
        success: true,
        serials: [],
        message: "No serials found"
      });
    }

    // Convert Firebase snapshot to array
    const serialsData = snap.val();
    const serialsArray = [];

    // Loop through all device serials
    for (const deviceId in serialsData) {
      if (serialsData.hasOwnProperty(deviceId)) {
        const serialInfo = serialsData[deviceId];
        
        serialsArray.push({
          deviceId: serialInfo.deviceId || deviceId,
          serialNo: serialInfo.serialNo || 0
        });
      }
    }

    console.log(` Fetched ${serialsArray.length} serials for user ${userId}`);

    return res.json({
      success: true,
      serials: serialsArray,
      count: serialsArray.length
    });

  } catch (err) {
    console.error(" getAllSerials error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// ✅ NEW: Get serials by user ID (if you have user-specific serials)
export const getSerialsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required"
      });
    }

    // If you store serials per user, use this structure:
    // deviceSerials/{userId}/{deviceId}
    const snap = await rtdb.ref(`${SERIAL_NODE}/${userId}`).get();

    if (!snap.exists()) {
      return res.json({
        success: true,
        serials: [],
        message: "No serials found for this user"
      });
    }

    const serialsData = snap.val();
    const serialsArray = [];

    for (const deviceId in serialsData) {
      if (serialsData.hasOwnProperty(deviceId)) {
        const serialInfo = serialsData[deviceId];
        
        serialsArray.push({
          deviceId: serialInfo.deviceId || deviceId,
          serialNo: serialInfo.serialNo || 0
        });
      }
    }

    console.log(` Fetched ${serialsArray.length} serials for user ${userId}`);

    return res.json({
      success: true,
      serials: serialsArray,
      count: serialsArray.length
    });

  } catch (err) {
    console.error(" getSerialsByUserId error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// ✅ NEW: Get serials with pagination (for large datasets)
export const getSerialsPaginated = async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    const startIndex = (pageNum - 1) * limitNum;

    const snap = await rtdb.ref(SERIAL_NODE).get();

    if (!snap.exists()) {
      return res.json({
        success: true,
        serials: [],
        page: pageNum,
        totalPages: 0,
        totalSerials: 0
      });
    }

    const serialsData = snap.val();
    const allSerials = [];

    for (const deviceId in serialsData) {
      if (serialsData.hasOwnProperty(deviceId)) {
        const serialInfo = serialsData[deviceId];
        
        allSerials.push({
          deviceId: serialInfo.deviceId || deviceId,
          serialNo: serialInfo.serialNo || 0
        });
      }
    }

    // Sort by serialNo (optional)
    allSerials.sort((a, b) => b.serialNo - a.serialNo);

    // Paginate
    const paginatedSerials = allSerials.slice(startIndex, startIndex + limitNum);

    return res.json({
      success: true,
      serials: paginatedSerials,
      page: pageNum,
      totalPages: Math.ceil(allSerials.length / limitNum),
      totalSerials: allSerials.length,
      hasMore: startIndex + limitNum < allSerials.length
    });

  } catch (err) {
    console.error(" getSerialsPaginated error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};