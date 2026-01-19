import express from "express";
import {
  saveSerialDirect,
  getSerialByDeviceId
} from "../controllers/deviceSerialController.js";

const router = express.Router();

// POST → direct save serial
router.post("/device-serial", saveSerialDirect);

// GET → get serial by deviceId
router.get("/device-serial/:deviceId", getSerialByDeviceId);

export default router;
