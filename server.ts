import express from "express";
import { createServer as createViteServer } from "vite";
import edge from "edge-tts";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API route for TTS
  app.post("/api/tts", async (req, res) => {
    const { text, voiceName } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    try {
      const tts = new edge.EdgeTTS({
        voice: voiceName || "vi-VN-HoaiMyNeural",
      });
      
      const audioBuffer = await tts.tts(text);
      
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

startServer();
