import express from "express";
import {
  initializeSerialSystem,
  saveDeviceSerial,
  getDeviceSerial,
  getBatchDeviceSerials,
  getAllDeviceSerials,
  getSerialSystemInfo,
  fixMissingSerials,
  deleteDeviceSerial
} from "../controllers/deviceSerialController.js";

const router = express.Router();

router.post("/api/serial-system/initialize", initializeSerialSystem);

router.post("/api/device-serial/save", saveDeviceSerial);

router.get("/api/device-serial/:deviceId", getDeviceSerial);

router.post("/api/device-serials/batch", getBatchDeviceSerials);

router.get("/api/device-serials/all", getAllDeviceSerials);

router.get("/api/serial-system/info", getSerialSystemInfo);

router.post("/api/serial-system/fix-missing", fixMissingSerials);

router.delete("/api/device-serial/:deviceId", deleteDeviceSerial);

export default router;