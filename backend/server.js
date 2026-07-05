import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { orchestrate } from "./src/orchestrator.js";
import { callOpenRouter, DEFAULT_MODEL } from "./src/utils/llmClient.js";
import { getHistory, saveTurn } from "./src/memory/supabaseMemory.js";
import { fetchWithTimeout, normalizeUrl, escapeHtml } from "./src/utils/helpers.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";

app.use(cors({
  origin: FRONTEND_ORIGIN === "*" ? true : FRONTEND_ORIGIN.split(","),
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "15mb" }));

// --- Preview helper ---
const toPreviewHtml = (targetUrl, rawHtml) => {
  const safeTitle = escapeHtml(targetUrl);
  const body = rawHtml
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<meta[^>]+http-equiv=["''"]content-security-policy["''"][^>]*>/gi, "")
    .replace(/<meta[^>]+http-equiv=["''"]x-frame-options["''"][^>]*>/gi, "");
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"UTF-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" /><title>ATHINA Preview</title><base href=\"" + escapeHtml(targetUrl) + "\" /><style>body{margin:0;font-family:system-ui,sans-serif;background:#0b1120;color:#e2e8f0;}.athina-preview-top{position:sticky;top:0;z-index:10;padding:10px 12px;background:#020617;border-bottom:1px solid #1f2937;font-size:12px;color:#93c5fd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}</style></head><body><div class=\"athina-preview-top\">ATHINA preview: " + safeTitle + "</div>" + body + "</body></html>";
};

// --- TTS ---
const synthesizeSpeech = async (text) => {
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  const elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID || "lxYfHSkYm1EzQzGhdbfc";
  if (!elevenLabsKey) return null;
  const ttsResponse = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + elevenLabsVoiceId, {
    method: "POST",
    headers: { "xi-api-key": elevenLabsKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_monolingual_v1",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!ttsResponse.ok) {
    const error = await ttsResponse.text();
    throw new Error("ElevenLabs error " + ttsResponse.status + ": " + error);
  }
  return Buffer.from(await ttsResponse.arrayBuffer()).toString("base64");
};

// --- Routes ---
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "ATHINA backend", architecture: "orchestrator + planner + memory + rule engine + execution engine + tools", endpoints: ["/health", "/api/agent", "/api/chat", "/api/speak", "/api/voice", "/api/preview"] });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Main orchestrator endpoint — autonomous agent flow
app.post("/api/agent", async (req, res) => {
  try {
    const { message = "", sessionId = "default", mode = "text" } = req.body;
    if (!message.trim()) return res.status(400).json({ error: "Missing message" });
    const result = await orchestrate({ message, sessionId, mode });
    res.json(result);
  } catch (error) {
    console.error("/api/agent error:", error.message);
    res.status(500).json({ error: "Agent processing failed", details: error.message });
  }
});

// Web page preview proxy
app.get("/api/preview", async (req, res) => {
  try {
    const target = normalizeUrl(String(req.query.url || ""));
    if (!target) return res.status(400).send("Invalid preview URL");
    const response = await fetchWithTimeout(target, {
      headers: { "User-Agent": "ATHINA-Agent/1.0", Accept: "text/html,application/xhtml+xml,text/plain" },
    });
    if (!response.ok) return res.status(response.status).send("Failed to fetch " + target);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text")) return res.status(400).send("<pre>Non-HTML content type: " + escapeHtml(contentType) + "</pre>");
    const html = await response.text();
    res.type("text/html").send(toPreviewHtml(target, html));
  } catch (error) {
    res.status(500).send("Preview failed: " + escapeHtml(error.message || "unknown error"));
  }
});

// TTS endpoint
app.post("/api/speak", async (req, res) => {
  try {
    const { text = "" } = req.body;
    if (!text.trim()) return res.status(400).json({ error: "Missing text" });
    const audioBase64 = await synthesizeSpeech(text);
    res.json({ success: true, audioBase64 });
  } catch (error) {
    console.error("/api/speak error:", error.message);
    res.status(500).json({ error: "Speech synthesis failed", details: error.message });
  }
});

// Chat completions (OpenAI-compatible)
const chatCompletionsHandler = async (req, res) => {
  try {
    const body = req.body;
    let messages, model, stream, sessionId = "default", userMessage = "", mode;
    if (Array.isArray(body && body.messages)) {
      mode = "openai";
      messages = body.messages;
      model = body.model || DEFAULT_MODEL;
      stream = body.stream !== undefined ? body.stream : true;
    } else {
      mode = "athina";
      sessionId = (body && body.sessionId) || "default";
      userMessage = (body && body.message) || "";
      const history = await getHistory(sessionId);
      messages = [
        { role: "system", content: "You are ATHINA, an autonomous executive AI agent. Be concise, professional, and intelligent." },
        ...history,
        { role: "user", content: userMessage },
      ];
      model = DEFAULT_MODEL;
      stream = body && body.stream !== undefined ? body.stream : true;
    }
    const response = await callOpenRouter({ ...body, model, messages, stream: !!stream });
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      let fullText = "";
      response.body.on("data", (chunk) => {
        const chunkStr = chunk.toString();
        res.write(chunkStr);
        for (const line of chunkStr.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const jsonStr = line.replace("data:", "").trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            fullText += (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) || parsed.token || "";
          } catch {}
        }
      });
      response.body.on("end", () => {
        if (mode === "athina") saveTurn(sessionId, userMessage, fullText).catch(console.error);
        res.write("data: [DONE]\n\n");
        res.end();
      });
      response.body.on("error", (error) => {
        console.error("Stream error:", error.message);
        res.write("data: " + JSON.stringify({ error: "Stream error from OpenRouter" }) + "\n\n");
        res.write("data: [DONE]\n\n");
        res.end();
      });
      return;
    }
    const data = await response.json();
    if (mode === "athina") {
      const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
      await saveTurn(sessionId, userMessage, content);
    }
    res.json(data);
  } catch (error) {
    console.error("/api/chat error:", error.message);
    res.status(500).json({ error: "Chat processing failed", details: error.message });
  }
};

app.post("/v1/chat/completions", chatCompletionsHandler);
app.post("/chat/completions", chatCompletionsHandler);
app.post("/api/chat", chatCompletionsHandler);

// Voice endpoint
app.post("/api/voice", async (req, res) => {
  try {
    const { audioBase64, sessionId = "default" } = req.body;
    if (!audioBase64) return res.status(400).json({ error: "Missing audioBase64" });
    const history = await getHistory(sessionId);
    const response = await callOpenRouter({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: "You are ATHINA, an autonomous executive AI agent. Reply in short spoken-friendly sentences." },
        ...history,
        { role: "user", content: "The user sent a voice message. Speech-to-text is not configured yet, so ask them to repeat the request in text or enable a transcription provider." },
      ],
      stream: false,
      temperature: 0.3,
      max_tokens: 300,
    });
    const data = await response.json();
    const textResponse = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "I heard you, but transcription is not configured yet.";
    await saveTurn(sessionId, "[Voice message received]", textResponse);
    const audioBase64Response = await synthesizeSpeech(textResponse);
    res.json({ success: true, text: textResponse, audioBase64: audioBase64Response, sessionId });
  } catch (error) {
    console.error("/api/voice error:", error.message);
    res.status(500).json({ error: "Voice processing failed", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log("ATHINA backend running on port " + PORT);
});