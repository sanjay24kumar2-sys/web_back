import express from "express";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import { rtdb } from "../config/db.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, message: "Password required" });

    const passwordRef = rtdb.ref("config/adminPassword");
    const snap = await passwordRef.get();

    if (!snap.exists()) {
      await passwordRef.set(password);
      console.log(" Password created first time");
    } else {
      const savedPassword = snap.val();
      if (password !== savedPassword) {
        return res.status(401).json({ success: false, message: "Wrong password" });
      }
    }

    const userId = "ADMIN";
    const sessionId = uuidv4();
    const token = jwt.sign({ userId, sessionId }, process.env.JWT_SECRET, { expiresIn: "1d" });

    const sessionRef = rtdb.ref(`sessions/${userId}/${sessionId}`);
    await sessionRef.set({
      isActive: true,
      createdAt: Date.now(),
      ip: req.ip,
      userAgent: req.headers["user-agent"] || "unknown",
    });

    const sessionsSnap = await rtdb.ref(`sessions/${userId}`).get();
    const activeSessions = [];
    if (sessionsSnap.exists()) {
      sessionsSnap.forEach(child => {
        if (child.val().isActive) activeSessions.push({ sessionId: child.key, ...child.val() });
      });
    }

    return res.json({
      success: true,
      message: snap.exists() ? "Login successful" : "Password created and logged in",
      token,
      sessionId,
      activeSessions,
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const { sessionId, allDevices } = req.body;
    const userId = "ADMIN";

    if (allDevices) {
      const sessionsSnap = await rtdb.ref(`sessions/${userId}`).get();
      if (sessionsSnap.exists()) {
        const updates = {};
        sessionsSnap.forEach(child => {
          updates[`${child.key}/isActive`] = false;
        });
        await rtdb.ref(`sessions/${userId}`).update(updates);
      }
      return res.json({ success: true, message: "Logged out from all devices" });
    }

    if (!sessionId) return res.status(400).json({ success: false, message: "Session ID required" });

    const sessionRef = rtdb.ref(`sessions/${userId}/${sessionId}`);
    const snap = await sessionRef.get();
    if (!snap.exists() || !snap.val().isActive) {
      return res.status(400).json({ success: false, message: "Session already inactive or invalid" });
    }
    await sessionRef.update({ isActive: false });

    return res.json({ success: true, message: "Logged out successfully" });

  } catch (err) {
    console.error("LOGOUT ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/sessions", async (req, res) => {
  try {
    const userId = "ADMIN";
    const snap = await rtdb.ref(`sessions/${userId}`).get();

    const activeSessions = [];

    if (snap.exists()) {
      const data = snap.val();

      Object.entries(data).forEach(([sessionId, session]) => {
        if (session.isActive === true) {
          activeSessions.push({ sessionId, ...session });
        }
      });
    }

    return res.json({ success: true, activeSessions });

  } catch (err) {
    console.error("SESSIONS ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});


export default router;