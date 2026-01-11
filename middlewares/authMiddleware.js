import jwt from "jsonwebtoken";
import { rtdb } from "../config/db.js";

export default async function auth(req, res, next) {
  try {
    if (req.path === "/api") {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, message: "Authorization token missing" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ success: false, message: "Authorization token missing" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { userId, sessionId } = decoded;

    const snap = await rtdb.ref(`sessions/${userId}/${sessionId}`).get();
    if (!snap.exists() || !snap.val().isActive) {
      return res.status(401).json({ success: false, message: "Session expired" });
    }

    req.userId = userId;
    req.sessionId = sessionId;

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}
