import express from "express";
import {
  saveSerialDirect,
  getSerialByDeviceId,
  getAllSerials,           // ✅ NEW
  getSerialsByUserId,      // ✅ NEW
  getSerialsPaginated      // ✅ NEW
} from "../controllers/deviceSerialController.js";

// Import your auth middleware if needed
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// POST → direct save serial
router.post("/device-serial", authMiddleware, saveSerialDirect);

// GET → get serial by deviceId
router.get("/device-serial/:deviceId", authMiddleware, getSerialByDeviceId);

// ✅ NEW: Get all serials at once (main endpoint for frontend)
router.get("/all-device-serials", authMiddleware, getAllSerials);

// ✅ NEW: Get serials by user ID
router.get("/user-serials/:userId", authMiddleware, getSerialsByUserId);

// ✅ NEW: Get serials with pagination
router.get("/serials-paginated", authMiddleware, getSerialsPaginated);

export default router;