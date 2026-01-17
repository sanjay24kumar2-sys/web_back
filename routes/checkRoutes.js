import express from "express";
import {
  getSmsStatusByDevice,
  saveCheckOnlineStatus,
  getSimForwardStatus,
  getBrosReply,
  setRestart,
  getAllBrosReplies,
  getDevicePermissions ,
  getRestart
} from "../controllers/checkController.js";

const router = express.Router();

router.get("/device/:uid/sms-status", getSmsStatusByDevice);
router.get("/device/:uid/sim-forward", getSimForwardStatus);
router.get("/brosreply-all", getAllBrosReplies);
router.get("/brosreply/:uid", getBrosReply);
router.post("/check-online/:uid", saveCheckOnlineStatus);
router.get("/device/:uid/permissions", getDevicePermissions);
router.post("/restart/:uid", setRestart);
router.get("/restart/:uid", getRestart);

export default router;