import { rtdb } from "../config/db.js";

const DEVICE_NODE = "registeredDevices";
const LIKES_NODE = "deviceLikes";

export const likeUnlikeDevice = async (req, res) => {
  try {
    const { uid } = req.body;
    const userId = req.user?.userId || "admin";

    if (!uid) {
      return res.status(400).json({
        success: false,
        message: "Device UID is required"
      });
    }

    // Check if device exists
    const deviceSnap = await rtdb.ref(`${DEVICE_NODE}/${uid}`).get();
    if (!deviceSnap.exists()) {
      return res.status(404).json({
        success: false,
        message: "Device not found"
      });
    }

    // Check current like status
    const userLikePath = `${LIKES_NODE}/${uid}/${userId}`;
    const likeSnap = await rtdb.ref(userLikePath).get();
    const isCurrentlyLiked = likeSnap.exists();

    if (isCurrentlyLiked) {
      // Unlike - remove user's like
      await rtdb.ref(userLikePath).remove();
      console.log(`💔 Device ${uid} unliked by ${userId}`);
      
      return res.json({
        success: true,
        liked: false,
        message: "Device unliked successfully"
      });
    } else {
      // Like - add user's like
      await rtdb.ref(userLikePath).set({
        likedAt: Date.now(),
        userId: userId,
        deviceId: uid
      });
      console.log(`❤️ Device ${uid} liked by ${userId}`);
      
      return res.json({
        success: true,
        liked: true,
        message: "Device liked successfully"
      });
    }

  } catch (err) {
    console.error("❌ Like/Unlike Error:", err);
    res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
};

export const getDeviceLikes = async (req, res) => {
  try {
    const { uid } = req.params;
    const userId = req.user?.userId || "admin";

    if (!uid) {
      return res.status(400).json({
        success: false,
        message: "Device UID is required"
      });
    }

    // Get all likes for this device
    const likesSnap = await rtdb.ref(`${LIKES_NODE}/${uid}`).get();
    
    let likedByUser = false;
    let totalLikes = 0;
    let likesData = {};

    if (likesSnap.exists()) {
      likesData = likesSnap.val();
      totalLikes = Object.keys(likesData).length;
      
      // Check if current user has liked this device
      if (likesData[userId]) {
        likedByUser = true;
      }
    }

    return res.json({
      success: true,
      likedByUser,
      totalLikes,
      uid
    });

  } catch (err) {
    console.error("❌ Get Likes Error:", err);
    res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
};