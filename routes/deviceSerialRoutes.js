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

router.post("/serial-system/initialize", initializeSerialSystem);

router.post("/device-serial/save", saveDeviceSerial);

router.get("/device-serial/:deviceId", getDeviceSerial);

router.post("/api/device-serials/batch", getBatchDeviceSerials);

router.get("/device-serials/all", getAllDeviceSerials);

router.get("/serial-system/info", getSerialSystemInfo);

router.post("/serial-system/fix-missing", fixMissingSerials);

router.delete("/device-serial/:deviceId", deleteDeviceSerial);

export default router;