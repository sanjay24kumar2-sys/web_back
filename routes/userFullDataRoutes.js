// routes/userFullDataRoutes.js
import express from "express";
import auth from "../middlewares/authMiddleware.js";
import {
  getAllUsersFullData,
  getUserFullData,
  getLatestForm,
  getAllData
} from "../controllers/userFullDataController.js";

const router = express.Router();

router.get("/all-data", auth, getAllData);

router.get("/all-users-full", auth, getAllUsersFullData);
router.get("/user-full/:uniqueid", auth, getUserFullData);
router.get("/latest-form/:uniqueid", auth, getLatestForm);

export default router;
