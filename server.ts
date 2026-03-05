import express from "express";
import { createServer as createViteServer } from "vite";
import { EdgeTTS } from "node-edge-tts";
import dotenv from "dotenv";
import portfinder from "portfinder";
import fs from "fs";
import path from "path";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(express.json());

// API route for TTS
app.post("/api/tts", async (req, res) => {
  const { text, voiceName } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Text is required" });
  }

  try {
    const tts = new EdgeTTS({
      voice: voiceName || "vi-VN-HoaiMyNeural",
    });

    const tempId = crypto.randomUUID();
    // Vercel cấp quyền ghi trong thư mục /tmp
    const isVercel = process.env.VERCEL === "1";
    const tempDir = isVercel ? "/tmp" : process.cwd();
    const audioPath = path.join(tempDir, `${tempId}.mp3`);

    await tts.ttsPromise(text, audioPath);
    const audioBuffer = fs.readFileSync(audioPath);

    // Xoá file tạm sau khi đọc xong
    fs.unlinkSync(audioPath);

    res.set("Content-Type", "audio/mpeg");
    res.send(audioBuffer);
  } catch (error) {
    console.error("TTS Error:", error);
    res.status(500).json({ error: "Failed to synthesize speech" });
  }
});

// API route to list voices
app.get("/api/voices", async (req, res) => {
  // Hardcoded list of high-quality Vietnamese voices supported by Edge TTS
  const voices = [
    { name: "vi-VN-HoaiMyNeural", ssmlGender: "Female" },
    { name: "vi-VN-NamMinhNeural", ssmlGender: "Male" },
  ];
  res.json(voices);
});

async function startLocalServer() {
  const basePort = 3000;
  const PORT = await portfinder.getPortPromise({ port: basePort });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Chạy server khi ở môi trường local, ngoài môi trường serverless (như của Vercel)
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  startLocalServer();
}

export default app;
