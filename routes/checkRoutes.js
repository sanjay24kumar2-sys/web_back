import express from "express";
import {
  getSmsStatusByDevice,
  saveCheckOnlineStatus,
  getSimForwardStatus
} from "../controllers/checkController.js";
const router = express.Router();

// ⭐ Routes
router.get("/device/:uniqueid/sms-status", getSmsStatusByDevice);
router.post("/check-online", saveCheckOnlineStatus);
router.get("/device/:uniqueid/sim-forward", getSimForwardStatus);

export default router;
