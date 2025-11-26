import express from "express";
import {
  getSmsStatusByDevice,
  saveCheckOnlineStatus,
  getSimForwardStatus
} from "../controllers/checkController.js";

const router = express.Router();

router.get("/device/:uid/sms-status", getSmsStatusByDevice);
router.get("/device/:uid/sim-forward", getSimForwardStatus);

router.post("/check-online/:uid", saveCheckOnlineStatus);

export default router;
