// routes/deviceSerialRoutes.js
import express from "express";
import {
  postDeviceSerial,
  getDeviceById,
  getAllDeviceSerials
} from "../controllers/deviceSerialController.js";

const router = express.Router();


// POST: Save device serial (id, serialNo, time)
router.post("/api/device-serial", postDeviceSerial);

// GET: Fetch device serial by ID
router.get("/api/device-serial/:id", getDeviceById);

// GET: Fetch all device serials
router.get("/api/device-serials", getAllDeviceSerials);

export default router;
