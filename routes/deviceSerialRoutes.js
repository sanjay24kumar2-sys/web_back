// routes/deviceSerialRoutes.js
import express from "express";
import {
  postDeviceSerial,
  getDeviceById,
  getAllDeviceSerials,
  getLatestDeviceSerials
} from "../controllers/deviceSerialController.js";

const router = express.Router();

router.post("/api/device-serial", postDeviceSerial);
router.get("/api/device-serial/:id", getDeviceById);
router.get("/api/device-serials", getAllDeviceSerials);
router.get("/api/latest-device-serials", getLatestDeviceSerials);

export default router;