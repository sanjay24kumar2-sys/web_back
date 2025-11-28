// routes/smsRoutes.js
import express from "express";
import {
  getAllSmsLogs,
  getSmsByDevice,
  getLatestSmsByDevice,
} from "../controllers/notificationController.js";

const router = express.Router();

router.get("/all", getAllSmsLogs);
router.get("/latest/:uniqueid", getLatestSmsByDevice);
router.get("/:uniqueid", getSmsByDevice);

export default router;
