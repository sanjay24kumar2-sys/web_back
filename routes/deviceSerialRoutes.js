import express from "express";
import {
  getOrCreateDeviceSerial,
  getDeviceSerialById,
  getAllDeviceSerials,
  getLatestSerialInfo,
  updateDeviceTimestamp,
  getBatchDeviceSerials,
  fixUndefinedJoinTimeDevices
} from "../controllers/deviceSerialController.js";

const router = express.Router();

// POST: Get or create serial for a device
router.post("/api/device-serial/get-or-create", getOrCreateDeviceSerial);

// GET: Get serial by device ID
router.get("/api/device-serial/:id", getDeviceSerialById);

// GET: Get all device serials
router.get("/api/device-serials/all", getAllDeviceSerials);

// GET: Get latest serial information
router.get("/api/device-serials/latest", getLatestSerialInfo);

// POST: Update device timestamp
router.post("/api/device-serial/update-timestamp", updateDeviceTimestamp);

// POST: Batch get serials for multiple devices
router.post("/api/device-serials/batch", getBatchDeviceSerials);

// POST: Fix devices with undefined join time
router.post("/api/device-serials/fix-undefined", fixUndefinedJoinTimeDevices);

export default router;