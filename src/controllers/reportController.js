import { GoogleGenerativeAI } from "@google/generative-ai";
import { v2 as cloudinary } from "cloudinary";
import Report from "../models/Report.js"; // Mongo model

// ✅ Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// ✅ Gemini setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const analyzeReport = async (req, res) => {
  try {
    const { date, type, notes } = req.body;
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ ok: false, msg: "No file uploaded!" });
    }

    // 🟢 Upload file to Cloudinary
    const uploadRes = await cloudinary.uploader.upload_stream(
      { folder: "healthmate_reports" },
      (error, result) => {
        if (error) throw error;
        return result;
      }
    );

    // convert buffer to readable stream
    const stream = require("stream");
    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);
    bufferStream.pipe(uploadRes);

    // ✅ Gemini: analyze file
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const prompt = `
      You are a medical assistant. Read this medical report and explain:
      1. Key findings in simple English.
      2. Translation in Roman Urdu.
      3. 3–5 questions the patient should ask the doctor.
      4. Food suggestions (good/bad).
      5. Always end with "Consult your doctor."
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: req.file.buffer.toString("base64"),
          mimeType: req.file.mimetype,
        },
      },
    ]);

    const aiText = result.response.text();

    // ✅ Save report in DB
    const report = await Report.create({
      userId,
      date,
      type,
      notes,
      fileUrl: uploadRes.secure_url,
      aiSummary: aiText,
    });

    res.json({
      ok: true,
      msg: "Report uploaded & analyzed successfully",
      report,
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ ok: false, msg: "Server error", error: err.message });
  }
};
