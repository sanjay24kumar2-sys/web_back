import express from "express";
import { saveSerialDirect } from "../controllers/deviceSerialController.js";

const router = express.Router();

router.post("/device-serial", saveSerialDirect);

export default router;