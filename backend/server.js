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
  const elevenLabsModelId = process.env.ELEVENLABS_MODEL_ID || "eleven_v3";
  if (!elevenLabsKey) {
    console.error("[TTS] ELEVENLABS_API_KEY is not set");
    return null;
  }
  console.log("[TTS] Synthesizing:", text.slice(0, 80), "| model:", elevenLabsModelId, "| voice:", elevenLabsVoiceId);
  const ttsResponse = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + elevenLabsVoiceId, {
    method: "POST",
    headers: { "xi-api-key": elevenLabsKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: elevenLabsModelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, use_speaker_boost: true },
    }),
  });
  if (!ttsResponse.ok) {
    const error = await ttsResponse.text();
    console.error("[TTS] ElevenLabs error", ttsResponse.status, error);
    throw new Error("ElevenLabs error " + ttsResponse.status + ": " + error);
  }
  console.log("[TTS] Success, audio generated");
  return Buffer.from(await ttsResponse.arrayBuffer()).toString("base64");
};

const parseAudioInput = (audioBase64) => {
  const input = String(audioBase64 || "").trim();
  if (!input) return null;

  const dataUrlMatch = input.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1],
      base64: dataUrlMatch[2],
    };
  }

  return {
    mimeType: "audio/webm",
    base64: input,
  };
};

const transcribeSpeech = async (audioBase64) => {
  const parsed = parseAudioInput(audioBase64);
  if (!parsed) return null;

  const transcriptionApiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!transcriptionApiKey) return null;

  const transcriptionUrl = process.env.OPENAI_TRANSCRIPTION_URL || "https://api.openai.com/v1/audio/transcriptions";
  const transcriptionModel = process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1";
  const audioBuffer = Buffer.from(parsed.base64, "base64");
  const audioFile = new Blob([audioBuffer], { type: parsed.mimeType });
  const formData = new FormData();
  formData.append("model", transcriptionModel);
  formData.append("file", audioFile, `voice.${parsed.mimeType.includes("wav") ? "wav" : parsed.mimeType.includes("mp3") ? "mp3" : "webm"}`);

  const response = await fetch(transcriptionUrl, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + transcriptionApiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error("Speech transcription failed " + response.status + ": " + errorText);
  }

  const data = await response.json();
  return String(data.text || "").trim() || null;
};

const getGitHubConfig = () => ({
  token: process.env.GITHUB_TOKEN,
  owner: process.env.GITHUB_OWNER || "Mahmoud-1298",
  repo: process.env.GITHUB_REPO || "ATHINA",
  branch: process.env.GITHUB_BRANCH || "main",
});

const getGitHubHeaders = (token) => ({
  Authorization: "Bearer " + token,
  Accept: "application/vnd.github+json",
  "User-Agent": "ATHINA-Agent",
});

const toBase64Utf8 = (value) => Buffer.from(String(value || ""), "utf8").toString("base64");

const fetchGitHubRepoDetails = async () => {
  const { token, owner, repo } = getGitHubConfig();
  if (!token) {
    throw new Error("GITHUB_TOKEN is not configured");
  }

  const headers = getGitHubHeaders(token);
  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!repoRes.ok) {
    const errText = await repoRes.text();
    throw new Error(`GitHub API error: ${repoRes.status} ${errText}`);
  }

  const repoData = await repoRes.json();
  const commitsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=5`, { headers });
  const langsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/languages`, { headers });

  const commitsData = commitsRes.ok ? await commitsRes.json() : [];
  const langsData = langsRes.ok ? await langsRes.json() : {};

  return {
    id: repoData.id,
    name: repoData.name,
    full_name: repoData.full_name,
    owner: repoData.owner?.login,
    description: repoData.description,
    url: repoData.html_url,
    default_branch: repoData.default_branch,
    language: repoData.language,
    stars: repoData.stargazers_count,
    forks: repoData.forks_count,
    watchers: repoData.watchers_count,
    open_issues: repoData.open_issues_count,
    private: repoData.private,
    created_at: repoData.created_at,
    updated_at: repoData.updated_at,
    pushed_at: repoData.pushed_at,
    size: repoData.size,
    topics: repoData.topics || [],
    license: repoData.license?.name || null,
    homepage: repoData.homepage,
    languages: langsData,
    commits: (commitsData || []).map((c) => ({
      sha: c.sha,
      message: c.commit?.message,
      author: c.commit?.author?.name,
      date: c.commit?.author?.date,
    })),
  };
};

const syncFilesToGitHub = async (files) => {
  const { token, owner, repo, branch } = getGitHubConfig();
  if (!token) {
    throw new Error("GITHUB_TOKEN is not configured");
  }

  const headers = getGitHubHeaders(token);
  const results = [];

  for (const file of files) {
    const { path: filePath, content, message } = file || {};
    if (!filePath) {
      results.push({ path: null, success: false, error: "Missing file path" });
      continue;
    }

    try {
      const checkRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
        { headers }
      );

      let sha = null;
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        sha = checkData.sha;
      }

      const pushRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
        {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: message || `Sync ${filePath}`,
            content: toBase64Utf8(content),
            branch,
            ...(sha ? { sha } : {}),
          }),
        }
      );

      if (pushRes.ok) {
        const pushData = await pushRes.json();
        results.push({
          path: filePath,
          success: true,
          sha: pushData.commit?.sha,
          action: sha ? "updated" : "created",
        });
      } else {
        const errData = await pushRes.json().catch(() => ({}));
        results.push({
          path: filePath,
          success: false,
          error: errData.message || `HTTP ${pushRes.status}`,
        });
      }
    } catch (error) {
      results.push({ path: filePath, success: false, error: error.message });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    success: failed === 0,
    summary: `${succeeded} synced, ${failed} failed`,
    results,
  };
};

// --- Routes ---
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "ATHINA backend", architecture: "orchestrator + planner + memory + rule engine + execution engine + tools", endpoints: ["/health", "/api/agent", "/api/chat", "/api/speak", "/api/voice", "/api/preview"] });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/api/history/:sessionId", async (req, res) => {
  try {
    const sessionId = String(req.params.sessionId || "default");
    const history = await getHistory(sessionId);
    res.json({ success: true, sessionId, messages: history });
  } catch (error) {
    console.error("/api/history error:", error.message);
    res.status(500).json({ error: "Failed to load history", details: error.message });
  }
});

// Legacy-compatible function proxy routes for gradual migration.
app.post("/api/functions/:functionName", async (req, res) => {
  try {
    const functionName = String(req.params.functionName || "");

    if (functionName === "athinaAgent") {
      const { message = "", sessionId = "default", locationContext = null } = req.body || {};
      if (!String(message).trim()) return res.status(400).json({ error: "Missing message" });
      const result = await orchestrate({ message, sessionId, mode: "text", locationContext });
      return res.json(result);
    }

    if (functionName === "geocode") {
      const { query } = req.body || {};
      if (!query) return res.status(400).json({ error: "Missing query" });

      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "json");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", "5");
      url.searchParams.set("q", String(query));

      const response = await fetchWithTimeout(url.toString(), {
        headers: { "User-Agent": "ATHINA-Agent/1.0", Accept: "application/json" },
      });

      if (!response.ok) {
        return res.status(502).json({ error: "Geocoding failed with status " + response.status });
      }

      const results = await response.json();
      return res.json({
        results: (results || []).map((r) => ({
          name: r.display_name,
          lat: Number(r.lat),
          lng: Number(r.lon),
          type: r.type,
          category: r.category,
        })),
      });
    }

    if (functionName === "voiceSynthesis") {
      const { text } = req.body || {};
      if (!text || !String(text).trim()) {
        return res.status(400).json({ error: "Missing text" });
      }

      const audio = await synthesizeSpeech(String(text));
      if (!audio) {
        return res.status(500).json({ error: "ElevenLabs API key not configured" });
      }
      return res.json({ audio, format: "mp3" });
    }

    if (functionName === "elevenLabsSignedUrl") {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      const agentId = process.env.ELEVENLABS_AGENT_ID || "agent_3301kt6djmwmet7tp8n2jjs9f3f5";
      if (!apiKey) {
        return res.status(500).json({ error: "ElevenLabs API key not configured" });
      }

      const response = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
        {
          method: "GET",
          headers: { "xi-api-key": apiKey },
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        return res.status(502).json({ error: `ElevenLabs error ${response.status}: ${errText}` });
      }

      const data = await response.json();
      return res.json({ signed_url: data.signed_url });
    }

    if (functionName === "githubRepo") {
      const repo = await fetchGitHubRepoDetails();
      return res.json({ repo });
    }

    if (functionName === "syncToGithub") {
      const { files } = req.body || {};
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: "Missing files array" });
      }
      const result = await syncFilesToGitHub(files);
      return res.json(result);
    }

    return res.status(404).json({ error: `Unknown function: ${functionName}` });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Function call failed" });
  }
});

// Main orchestrator endpoint Ã¢ÂÂ autonomous agent flow
app.post("/api/agent", async (req, res) => {
  try {
    const { message = "", sessionId = "default", mode = "text", locationContext = null } = req.body;
    if (!message.trim()) return res.status(400).json({ error: "Missing message" });
    const result = await orchestrate({ message, sessionId, mode, locationContext });
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
      const history = await getHistory(sessionId, 6);
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
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunkStr = decoder.decode(value, { stream: true });
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
        }
      } catch (streamError) {
        console.error("Stream error:", streamError.message);
        res.write("data: " + JSON.stringify({ error: "Stream error from OpenRouter" }) + "\n\n");
      }
      if (mode === "athina") saveTurn(sessionId, userMessage, fullText).catch(console.error);
      res.write("data: [DONE]\n\n");
      res.end();
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
    const { audioBase64, sessionId = "default", locationContext = null } = req.body;
    if (!audioBase64) return res.status(400).json({ error: "Missing audioBase64" });
    const transcript = await transcribeSpeech(audioBase64);

    if (!transcript) {
      const history = await getHistory(sessionId, 6);
      const response = await callOpenRouter({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: "You are ATHINA, an autonomous executive AI agent. Reply in short spoken-friendly sentences." },
          ...history,
          { role: "user", content: "The user sent a voice message, but speech-to-text is not configured. Ask them to repeat the request in text or enable a transcription provider." },
        ],
        stream: false,
        temperature: 0.3,
        max_tokens: 300,
      });
      const data = await response.json();
      const textResponse = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "I heard you, but transcription is not configured yet.";
      await saveTurn(sessionId, "[Voice message received]", textResponse);
      const audioBase64Response = await synthesizeSpeech(textResponse);
      res.json({ success: true, transcript: null, text: textResponse, audioBase64: audioBase64Response, sessionId });
      return;
    }

    const result = await orchestrate({ message: transcript, sessionId, mode: "voice", locationContext });
    const audioBase64Response = await synthesizeSpeech(result.reply);
    res.json({ success: true, transcript, text: result.reply, audioBase64: audioBase64Response, sessionId, actions: result.actions || [] });
  } catch (error) {
    console.error("/api/voice error:", error.message);
    res.status(500).json({ error: "Voice processing failed", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log("ATHINA backend running on port " + PORT);
});