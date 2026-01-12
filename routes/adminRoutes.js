import express from "express";
import auth from "../middlewares/authMiddleware.js";
import {
  getAdminNumber,
  setAdminNumber,
  getAllDevices,
  pingDeviceById,
  getDeviceHeartbeatById,
  setAdminPassword,
  verifyPassword
} from "../controllers/adminController.js";
import {
  likeUnlikeDevice,
  getDeviceLikes
} from "../controllers/likeunlike.js";
import {
  deleteDevice
} from "../controllers/deleteDevice.js";

const router = express.Router();
router.post("/api/admin-password", setAdminPassword);
router.post("/api/admin-password/verify", verifyPassword);

router.use(auth);

router.get("/api/device-heartbeat/:id", getDeviceHeartbeatById);
router.get("/api/admin-number", getAdminNumber);
router.post("/api/admin-number", setAdminNumber);
router.get("/api/devices", getAllDevices);
router.post("/api/ping-device/:id", pingDeviceById);

router.post("/api/likeunlike", likeUnlikeDevice);
router.get("/api/likes/:uid", getDeviceLikes);

router.delete("/api/delete/:uid", deleteDevice);

export default router;