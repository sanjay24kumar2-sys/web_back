// routes/smsRoutes.js
import express from "express";
import auth from "../middlewares/authMiddleware.js";
import {
  getAllSmsLogs,
  getSmsByDevice,
  getLatestSmsByDevice,
} from "../controllers/notificationController.js";

const router = express.Router();

router.get("/all", auth, getAllSmsLogs);
router.get("/latest/:uniqueid", auth, getLatestSmsByDevice);
router.get("/:uniqueid", auth, getSmsByDevice);

export default router;
