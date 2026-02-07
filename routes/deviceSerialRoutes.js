import express from "express";
import {
  saveSerialDirect,
  getSerialByDeviceId,
  getAllSerials, 
  getSerialsByUserId, 
  getSerialsPaginated 
} from "../controllers/deviceSerialController.js";

import authMiddleware from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/device-serial", authMiddleware, saveSerialDirect);

router.get("/device-serial/:deviceId", authMiddleware, getSerialByDeviceId);

router.get("/all-device-serials", authMiddleware, getAllSerials);

router.get("/user-serials/:userId", authMiddleware, getSerialsByUserId);

router.get("/serials-paginated", authMiddleware, getSerialsPaginated);

export default router;