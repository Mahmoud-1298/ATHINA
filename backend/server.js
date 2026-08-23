import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { orchestrate } from "./src/orchestrator.js";
import {
  getProposalValidatorContext,
  getProposalValidatorDebug,
  validateProposalUpload,
} from "./src/proposalValidator.js";
import { callOpenRouter, DEFAULT_MODEL } from "./src/utils/llmClient.js";
import {
  getHistory,
  saveTurn,
  saveAuditLog,
} from "./src/memory/supabaseMemory.js";
import {
  fetchWithTimeout,
  normalizeUrl,
  escapeHtml,
} from "./src/utils/helpers.js";
import {
  buildGoogleConnectUrl,
  exchangeGoogleCode,
  getGoogleAuthStatus,
} from "./src/utils/googleWorkspace.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";

const allowedOrigins =
  FRONTEND_ORIGIN === "*"
    ? []
    : FRONTEND_ORIGIN.split(",")
        .map((origin) => origin.trim().replace(/\/$/, ""))
        .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || FRONTEND_ORIGIN === "*") {
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/$/, "");
      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      console.warn("[CORS] Blocked origin:", normalizedOrigin);
      return callback(new Error(`CORS origin not allowed: ${normalizedOrigin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  })
);

app.use(express.json({ limit: "25mb" }));

const AUDIT_LOGS_ENABLED = process.env.AUDIT_LOGS_ENABLED !== "false";
const AUDIT_SUPABASE_ENABLED = process.env.AUDIT_SUPABASE_ENABLED !== "false";

const clip = (value, max = 180) => {
  const text = String(value || "");
  return text.length <= max ? text : `${text.slice(0, max)}...`;
};

const redactText = (input) =>
  String(input || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted-token]")
    .replace(/\b(sk|or|sb)_[A-Za-z0-9_-]{8,}\b/g, "[redacted-secret]");

const hashText = (input) =>
  crypto
    .createHash("sha256")
    .update(String(input || ""))
    .digest("hex")
    .slice(0, 16);

const summarizeBody = (body) => {
  if (!body || typeof body !== "object") return null;

  const summary = { keys: Object.keys(body).slice(0, 20) };
  if (body.sessionId) summary.sessionId = String(body.sessionId);

  if (body.message) {
    summary.messageHash = hashText(body.message);
    summary.messagePreview = clip(redactText(body.message), 120);
    summary.messageLength = String(body.message).length;
  }

  if (body.text) {
    summary.textHash = hashText(body.text);
    summary.textPreview = clip(redactText(body.text), 120);
  }

  if (body.audioBase64) summary.audioBase64Length = String(body.audioBase64).length;
  if (Array.isArray(body.files)) summary.filesCount = body.files.length;
  if (body.query) summary.query = clip(redactText(body.query), 120);

  return summary;
};

const logStructured = (entry) => {
  if (!AUDIT_LOGS_ENABLED) return;
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }));
};

const persistAudit = async (event) => {
  if (!AUDIT_SUPABASE_ENABLED) return;
  try {
    await saveAuditLog(event);
  } catch (error) {
    console.error("audit.persist error:", error?.message || error);
  }
};

const emitAudit = async (event) => {
  logStructured({
    type: "audit",
    requestId: event.requestId || null,
    sessionId: event.sessionId || null,
    actorId: event.actorId || null,
    endpoint: event.endpoint || null,
    eventType: event.eventType || "event",
    status: event.status || null,
    latencyMs: event.latencyMs || null,
    metadata: event.metadata || {},
  });
  await persistAudit(event);
};

app.use((req, res, next) => {
  const requestId = req.get("x-request-id") || crypto.randomUUID();
  const startAt = Date.now();
  req.audit = { requestId, startAt };
  res.setHeader("X-Request-Id", requestId);

  void emitAudit({
    requestId,
    endpoint: req.originalUrl,
    eventType: "request.start",
    status: "started",
    metadata: {
      method: req.method,
      ip: req.ip,
      userAgent: clip(req.get("user-agent") || "", 160),
      body: summarizeBody(req.body),
    },
  });

  res.on("finish", () => {
    void emitAudit({
      requestId,
      endpoint: req.originalUrl,
      eventType: "request.finish",
      status: res.statusCode < 400 ? "success" : "error",
      latencyMs: Date.now() - startAt,
      metadata: { method: req.method, statusCode: res.statusCode },
    });
  });

  next();
});

const toPreviewHtml = (targetUrl, rawHtml) => {
  const safeTitle = escapeHtml(targetUrl);
  const body = String(rawHtml || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<meta[^>]+http-equiv=["']content-security-policy["'][^>]*>/gi, "")
    .replace(/<meta[^>]+http-equiv=["']x-frame-options["'][^>]*>/gi, "");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ATHINA Preview</title>
  <base href="${escapeHtml(targetUrl)}" />
  <style>
    body{margin:0;font-family:system-ui,sans-serif;background:#0b1120;color:#e2e8f0;}
    .athina-preview-top{position:sticky;top:0;z-index:10;padding:10px 12px;background:#020617;border-bottom:1px solid #1f2937;font-size:12px;color:#93c5fd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  </style>
</head>
<body>
  <div class="athina-preview-top">ATHINA preview: ${safeTitle}</div>
  ${body}
</body>
</html>`;
};

const getElevenLabsConfig = () => {
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  const elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID || "lxYfHSkYm1EzQzGhdbfc";
  const elevenLabsModelId = process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5";
  const elevenLabsLatencyMode = Number(process.env.ELEVENLABS_LATENCY_MODE || 3);

  return {
    elevenLabsKey,
    elevenLabsVoiceId,
    elevenLabsModelId,
    elevenLabsLatencyMode,
  };
};

const requestElevenLabsSpeech = async (text, modelId) => {
  const {
    elevenLabsKey,
    elevenLabsVoiceId,
    elevenLabsLatencyMode,
  } = getElevenLabsConfig();

  const outputFormat =
    process.env.ELEVENLABS_OUTPUT_FORMAT ||
    (modelId === "eleven_v3" ? "mp3_44100_128" : "mp3_22050_32");

  const ttsResponse = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}/stream?optimize_streaming_latency=${encodeURIComponent(elevenLabsLatencyMode)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": elevenLabsKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        output_format: outputFormat,
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.75,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!ttsResponse.ok) {
    const error = await ttsResponse.text();
    const failure = new Error(`ElevenLabs error ${ttsResponse.status}: ${error}`);
    failure.status = ttsResponse.status;
    throw failure;
  }

  return ttsResponse;
};

const synthesizeSpeech = async (text) => {
  const {
    elevenLabsKey,
    elevenLabsModelId,
  } = getElevenLabsConfig();

  if (!elevenLabsKey) {
    console.error("[TTS] ELEVENLABS_API_KEY is not set");
    return null;
  }

  const normalizedText = String(text || "").trim();
  if (!normalizedText) return null;

  console.log(
    "[TTS] Synthesizing:",
    normalizedText.slice(0, 80),
    "| model:",
    elevenLabsModelId,
    "| voice:",
    getElevenLabsConfig().elevenLabsVoiceId
  );

  let ttsResponse;
  try {
    ttsResponse = await requestElevenLabsSpeech(
      normalizedText,
      elevenLabsModelId
    );
  } catch (error) {
    if (elevenLabsModelId === "eleven_v3" && error?.status === 400) {
      console.warn(
        "[TTS] eleven_v3 rejected the request; retrying with eleven_flash_v2_5."
      );
      ttsResponse = await requestElevenLabsSpeech(
        normalizedText,
        "eleven_flash_v2_5"
      );
    } else {
      throw error;
    }
  }

  return Buffer.from(await ttsResponse.arrayBuffer()).toString("base64");
};

const streamSpeech = async (text, res) => {
  const {
    elevenLabsKey,
    elevenLabsModelId,
  } = getElevenLabsConfig();

  if (!elevenLabsKey) {
    throw new Error("ELEVENLABS_API_KEY is not set");
  }

  let ttsResponse;
  try {
    ttsResponse = await requestElevenLabsSpeech(
      String(text || "").trim(),
      elevenLabsModelId
    );
  } catch (error) {
    if (elevenLabsModelId !== "eleven_flash_v2_5" && error?.status === 400) {
      console.warn(
        "[TTS] Streaming model rejected the request; retrying with eleven_flash_v2_5."
      );
      ttsResponse = await requestElevenLabsSpeech(
        String(text || "").trim(),
        "eleven_flash_v2_5"
      );
    } else {
      throw error;
    }
  }

  res.status(200);
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Transfer-Encoding", "chunked");

  if (!ttsResponse.body) {
    res.end(Buffer.from(await ttsResponse.arrayBuffer()));
    return;
  }

  for await (const chunk of ttsResponse.body) {
    if (res.destroyed) break;
    res.write(chunk);
  }
  res.end();
};

const parseAudioInput = (audioBase64) => {
  const input = String(audioBase64 || "").trim();
  if (!input) return null;

  const dataUrlMatch = input.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    return { mimeType: dataUrlMatch[1], base64: dataUrlMatch[2] };
  }

  return { mimeType: "audio/webm", base64: input };
};

const transcribeSpeech = async (audioBase64) => {
  const parsed = parseAudioInput(audioBase64);
  if (!parsed) return null;

  const transcriptionApiKey = process.env.OPENAI_API_KEY;
  if (!transcriptionApiKey) {
    console.warn("[STT] OPENAI_API_KEY is not configured");
    return null;
  }

  const transcriptionUrl =
    process.env.OPENAI_TRANSCRIPTION_URL ||
    "https://api.openai.com/v1/audio/transcriptions";
  const transcriptionModel = process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1";
  const audioBuffer = Buffer.from(parsed.base64, "base64");
  const audioFile = new Blob([audioBuffer], { type: parsed.mimeType });
  const formData = new FormData();
  const extension = parsed.mimeType.includes("wav")
    ? "wav"
    : parsed.mimeType.includes("mp3")
      ? "mp3"
      : "webm";

  formData.append("model", transcriptionModel);
  formData.append("file", audioFile, `voice.${extension}`);

  const response = await fetch(transcriptionUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${transcriptionApiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Speech transcription failed ${response.status}: ${errorText}`);
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
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "ATHINA-Agent",
  "X-GitHub-Api-Version": "2022-11-28",
});

const toBase64Utf8 = (value) =>
  Buffer.from(String(value || ""), "utf8").toString("base64");

const fetchGitHubRepoDetails = async () => {
  const { token, owner, repo } = getGitHubConfig();
  if (!token) throw new Error("GITHUB_TOKEN is not configured");

  const headers = getGitHubHeaders(token);
  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });

  if (!repoRes.ok) {
    const errText = await repoRes.text();
    throw new Error(`GitHub API error: ${repoRes.status} ${errText}`);
  }

  const repoData = await repoRes.json();
  const [commitsRes, langsRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=5`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/languages`, { headers }),
  ]);

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
    commits: (commitsData || []).map((commit) => ({
      sha: commit.sha,
      message: commit.commit?.message,
      author: commit.commit?.author?.name,
      date: commit.commit?.author?.date,
    })),
  };
};

const syncFilesToGitHub = async (files) => {
  const { token, owner, repo, branch } = getGitHubConfig();
  if (!token) throw new Error("GITHUB_TOKEN is not configured");

  const headers = getGitHubHeaders(token);
  const results = [];

  for (const file of files) {
    const { path: filePath, content, message } = file || {};
    if (!filePath) {
      results.push({ path: null, success: false, error: "Missing file path" });
      continue;
    }

    try {
      const encodedPath = filePath
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");

      const checkRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
        { headers }
      );

      let sha = null;
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        sha = checkData.sha;
      }

      const pushRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`,
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
      results.push({ path: filePath, success: false, error: error?.message || String(error) });
    }
  }

  const succeeded = results.filter((result) => result.success).length;
  const failed = results.length - succeeded;
  return {
    success: failed === 0,
    summary: `${succeeded} synced, ${failed} failed`,
    results,
  };
};

const extractVisibleTextFromSseChunk = (chunkText) => {
  let text = "";

  for (const line of String(chunkText || "").split("\n")) {
    if (!line.startsWith("data:")) continue;
    const jsonText = line.slice(5).trim();
    if (!jsonText || jsonText === "[DONE]") continue;

    try {
      const parsed = JSON.parse(jsonText);
      text += parsed?.choices?.[0]?.delta?.content || parsed?.token || "";
    } catch {
      // Ignore incomplete SSE lines here; upstream stream is still forwarded.
    }
  }

  return text;
};

const pipeOpenRouterStream = async ({ response, res, onChunk }) => {
  if (!response?.body) throw new Error("OpenRouter returned no response body");

  if (typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunkText = decoder.decode(value, { stream: true });
      res.write(chunkText);
      onChunk(chunkText);
    }

    return;
  }

  if (typeof response.body.on === "function") {
    await new Promise((resolve, reject) => {
      response.body.on("data", (chunk) => {
        const chunkText = chunk.toString();
        res.write(chunkText);
        onChunk(chunkText);
      });
      response.body.on("end", resolve);
      response.body.on("error", reject);
    });

    return;
  }

  throw new Error("Unsupported OpenRouter response stream");
};

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "ATHINA backend",
    architecture: "orchestrator + planner + memory + rule engine + execution engine + tools",
    endpoints: [
      "/health",
      "/api/agent",
      "/api/chat",
      "/api/speak",
      "/api/voice",
      "/api/preview",
    ],
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/api/history/:sessionId", async (req, res) => {
  try {
    const sessionId = String(req.params.sessionId || "default");
    const userId = req.query.userId ? String(req.query.userId) : null;
    const history = await getHistory(sessionId, 20, userId);
    return res.json({ success: true, sessionId, messages: history });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to load history",
      details: error?.message || "Unknown error",
    });
  }
});

app.get("/api/google/connect-url", async (req, res) => {
  try {
    const sessionId = String(req.query.sessionId || "default");
    const userId = req.query.userId ? String(req.query.userId) : null;
    const result = await buildGoogleConnectUrl({ sessionId, userId });
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to generate Google connect URL",
    });
  }
});

app.get("/api/google/oauth", async (req, res) => {
  try {
    const sessionId = String(req.query.sessionId || "default");
    const userId = req.query.userId ? String(req.query.userId) : null;
    const result = await buildGoogleConnectUrl({ sessionId, userId });
    return res.redirect(result.url);
  } catch (error) {
    return res.status(500).type("text/html").send(
      `<html><body style="font-family:system-ui;padding:24px;background:#020617;color:#fecaca"><h2>ATHINA Google connection failed</h2><p>${escapeHtml(error?.message || "unknown error")}</p></body></html>`
    );
  }
});

app.get("/api/google/status", async (req, res) => {
  try {
    const sessionId = String(req.query.sessionId || "default");
    const userId = req.query.userId ? String(req.query.userId) : null;
    const status = await getGoogleAuthStatus({ sessionId, userId });
    return res.json({ success: true, ...status });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to get Google auth status",
    });
  }
});

app.get("/api/google/oauth/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const state = req.query.state ? String(req.query.state) : "";
    const result = await exchangeGoogleCode({ code, state });
    return res.type("text/html").send(
      `<html><body style="font-family:system-ui;padding:24px;background:#020617;color:#e2e8f0"><h2>ATHINA Google connection successful</h2><p>Your Google account is now connected for this ATHINA session/user.</p><pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre></body></html>`
    );
  } catch (error) {
    return res.status(500).type("text/html").send(
      `<html><body style="font-family:system-ui;padding:24px;background:#020617;color:#fecaca"><h2>ATHINA Google connection failed</h2><p>${escapeHtml(error?.message || "unknown error")}</p></body></html>`
    );
  }
});

app.post("/api/functions/:functionName", async (req, res) => {
  try {
    const functionName = String(req.params.functionName || "");
    const requestId = req.audit?.requestId || null;

    if (functionName === "athinaAgent") {
      const {
        message = "",
        sessionId = "default",
        userId = null,
        locationContext = null,
      } = req.body || {};

      if (!String(message).trim()) {
        return res.status(400).json({ error: "Missing message" });
      }

      const result = await orchestrate({
        message,
        sessionId,
        userId,
        mode: "text",
        locationContext,
      });

      await emitAudit({
        requestId,
        sessionId,
        actorId: userId || null,
        endpoint: req.originalUrl,
        eventType: "agent.result",
        status: result.success ? "success" : "error",
        metadata: {
          mode: "text",
          via: "functions.athinaAgent",
          tasksCount: Array.isArray(result.tasks) ? result.tasks.length : 0,
          actionsCount: Array.isArray(result.actions) ? result.actions.length : 0,
        },
      });

      return res.json(result);
    }

    if (functionName === "proposalValidatorContext") {
      return res.json(await getProposalValidatorContext());
    }

    if (functionName === "googleConnectUrl") {
      const { sessionId = "default", userId = null } = req.body || {};
      return res.json({
        success: true,
        ...(await buildGoogleConnectUrl({ sessionId, userId })),
      });
    }

    if (functionName === "googleAuthStatus") {
      const { sessionId = "default", userId = null } = req.body || {};
      return res.json({
        success: true,
        ...(await getGoogleAuthStatus({ sessionId, userId })),
      });
    }

    if (functionName === "proposalValidatorDebug") {
      return res.json(await getProposalValidatorDebug());
    }

    if (functionName === "validateProposal") {
      const {
        fileName = "",
        mimeType = "application/octet-stream",
        contentBase64 = "",
        sessionId = "default",
        userId = null,
      } = req.body || {};

      const result = await validateProposalUpload({
        fileName,
        mimeType,
        contentBase64,
        sessionId,
        userId,
      });

      await emitAudit({
        requestId,
        sessionId,
        actorId: userId || null,
        endpoint: req.originalUrl,
        eventType: "proposal.validation",
        status: result.success ? "success" : "error",
        metadata: {
          fileName: clip(fileName, 120),
          reportId: result.reportId || null,
          overallScore: result.result?.overallScore || null,
        },
      });

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
        headers: {
          "User-Agent": "ATHINA-Agent/1.0",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        return res.status(502).json({
          error: `Geocoding failed with status ${response.status}`,
        });
      }

      const results = await response.json();
      return res.json({
        results: (results || []).map((result) => ({
          name: result.display_name,
          lat: Number(result.lat),
          lng: Number(result.lon),
          type: result.type,
          category: result.category,
        })),
      });
    }

    if (functionName === "voiceSynthesis") {
      const { text } = req.body || {};
      if (!String(text || "").trim()) {
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
      const agentId =
        process.env.ELEVENLABS_AGENT_ID || "agent_3301kt6djmwmet7tp8n2jjs9f3f5";

      if (!apiKey) {
        return res.status(500).json({ error: "ElevenLabs API key not configured" });
      }

      const response = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
        { method: "GET", headers: { "xi-api-key": apiKey } }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(502).json({
          error: `ElevenLabs error ${response.status}: ${errorText}`,
        });
      }

      const data = await response.json();
      return res.json({ signed_url: data.signed_url });
    }

    if (functionName === "githubRepo") {
      return res.json({ repo: await fetchGitHubRepoDetails() });
    }

    if (functionName === "syncToGithub") {
      const { files } = req.body || {};
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: "Missing files array" });
      }

      const result = await syncFilesToGitHub(files);
      await emitAudit({
        requestId,
        endpoint: req.originalUrl,
        eventType: "github.sync",
        status: result.success ? "success" : "error",
        metadata: { filesCount: files.length, summary: result.summary },
      });
      return res.json(result);
    }

    return res.status(404).json({ error: `Unknown function: ${functionName}` });
  } catch (error) {
    await emitAudit({
      requestId: req.audit?.requestId || null,
      endpoint: req.originalUrl,
      eventType: "function.error",
      status: "error",
      metadata: { error: clip(redactText(error?.message || "unknown"), 300) },
    });
    return res.status(500).json({
      error: error?.message || "Function call failed",
    });
  }
});

app.post("/api/agent", async (req, res) => {
  try {
    const {
      message = "",
      sessionId = "default",
      userId = null,
      mode = "text",
      locationContext = null,
    } = req.body || {};

    if (!String(message).trim()) {
      return res.status(400).json({ error: "Missing message" });
    }

    const result = await orchestrate({
      message: String(message).trim(),
      sessionId,
      userId,
      mode,
      locationContext,
    });

    const audioBase64 =
      mode === "voice" && result.reply
        ? await synthesizeSpeech(result.reply)
        : null;

    await emitAudit({
      requestId: req.audit?.requestId || null,
      sessionId,
      actorId: userId || null,
      endpoint: req.originalUrl,
      eventType: "agent.result",
      status: result.success ? "success" : "error",
      metadata: {
        mode,
        tasksCount: Array.isArray(result.tasks) ? result.tasks.length : 0,
        actionsCount: Array.isArray(result.actions) ? result.actions.length : 0,
        voiceReplyIncluded: Boolean(audioBase64),
      },
    });

    return res.json({ ...result, audioBase64 });
  } catch (error) {
    return res.status(500).json({
      error: "Agent processing failed",
      details: error?.message || "Unknown error",
    });
  }
});

app.get("/api/preview", async (req, res) => {
  try {
    const target = normalizeUrl(String(req.query.url || ""));
    if (!target) return res.status(400).send("Invalid preview URL");

    const response = await fetchWithTimeout(target, {
      headers: {
        "User-Agent": "ATHINA-Agent/1.0",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
    });

    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch ${target}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text")) {
      return res
        .status(400)
        .send(`<pre>Non-HTML content type: ${escapeHtml(contentType)}</pre>`);
    }

    return res.type("text/html").send(toPreviewHtml(target, await response.text()));
  } catch (error) {
    return res.status(500).send(`Preview failed: ${escapeHtml(error?.message || "unknown error")}`);
  }
});

app.post("/api/speak", async (req, res) => {
  try {
    const { text = "" } = req.body || {};
    if (!String(text).trim()) {
      return res.status(400).json({ error: "Missing text" });
    }

    return res.json({
      success: true,
      audioBase64: await synthesizeSpeech(text),
    });
  } catch (error) {
    console.error("[TTS] Speech synthesis failed:", error?.message || error);
    return res.status(500).json({
      success: false,
      error: "Speech synthesis failed",
      details: error?.message || "Unknown error",
    });
  }
});

app.post("/api/speak/stream", async (req, res) => {
  try {
    const { text = "" } = req.body || {};
    const normalizedText = String(text).trim();

    if (!normalizedText) {
      return res.status(400).json({
        success: false,
        error: "Missing text",
      });
    }

    await streamSpeech(normalizedText, res);
  } catch (error) {
    console.error("[TTS] Streaming speech failed:", error?.message || error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: "Streaming speech synthesis failed",
        details: error?.message || "Unknown error",
      });
    }
    res.destroy(error);
  }
});

const chatCompletionsHandler = async (req, res) => {
  try {
    const body = req.body || {};
    const requestId = req.audit?.requestId || null;
    let messages;
    let model;
    let stream;
    let sessionId = "default";
    let userMessage = "";
    let mode;

    if (Array.isArray(body.messages)) {
      mode = "openai";
      messages = body.messages;
      model = body.model || DEFAULT_MODEL;
      stream = body.stream !== undefined ? Boolean(body.stream) : true;
    } else {
      mode = "athina";
      sessionId = body.sessionId || "default";
      userMessage = body.message || "";
      const history = await getHistory(sessionId, 6);
      messages = [
        {
          role: "system",
          content:
            "You are ATHINA, an autonomous executive AI agent. Be concise, professional, and intelligent.",
        },
        ...history,
        { role: "user", content: userMessage },
      ];
      model = DEFAULT_MODEL;
      stream = body.stream !== undefined ? Boolean(body.stream) : true;
    }

    const response = await callOpenRouter({
      ...body,
      model,
      messages,
      stream,
    });

    if (!response.ok) {
      const upstreamError = await response.text();
      return res.status(response.status).json({
        error: "OpenRouter request failed",
        details: upstreamError,
      });
    }

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");

      let fullText = "";
      await pipeOpenRouterStream({
        response,
        res,
        onChunk(chunkText) {
          fullText += extractVisibleTextFromSseChunk(chunkText);
        },
      });

      if (mode === "athina" && userMessage) {
        void saveTurn(sessionId, userMessage, fullText).catch(console.error);
      }

      await emitAudit({
        requestId,
        sessionId: mode === "athina" ? sessionId : null,
        endpoint: req.originalUrl,
        eventType: "chat.stream.complete",
        status: "success",
        metadata: { mode, model, stream: true, outputLength: fullText.length },
      });

      res.write("data: [DONE]\n\n");
      return res.end();
    }

    const data = await response.json();
    if (mode === "athina" && userMessage) {
      const content = data?.choices?.[0]?.message?.content || "";
      await saveTurn(sessionId, userMessage, content);
    }

    await emitAudit({
      requestId,
      sessionId: mode === "athina" ? sessionId : null,
      endpoint: req.originalUrl,
      eventType: "chat.complete",
      status: "success",
      metadata: { mode, model, stream: false },
    });

    return res.json(data);
  } catch (error) {
    console.error("chatCompletionsHandler error:", error?.message || error);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: "Stream processing failed" })}\n\n`);
      return res.end();
    }

    return res.status(500).json({
      error: "Chat processing failed",
      details: error?.message || "Unknown error",
    });
  }
};

app.post("/v1/chat/completions", chatCompletionsHandler);
app.post("/chat/completions", chatCompletionsHandler);

app.post("/api/chat", async (req, res) => {
  const requestId = req.audit?.requestId || crypto.randomUUID();

  try {
    const {
      message = "",
      sessionId = "default",
      userId = null,
      locationContext = null,
    } = req.body || {};

    const normalizedMessage = String(message).trim();
    if (!normalizedMessage) {
      return res.status(400).json({
        success: false,
        error: "Missing message",
        reply: "Please enter a request.",
        actions: [],
        sessionId,
        requestId,
      });
    }

    console.log("[ATHINA][/api/chat] Agent request received:", {
      requestId,
      sessionId,
      userId,
      messageLength: normalizedMessage.length,
    });

    const result = await orchestrate({
      message: normalizedMessage,
      sessionId,
      userId,
      mode: "text",
      locationContext,
    });

    await emitAudit({
      requestId,
      sessionId,
      actorId: userId,
      endpoint: req.originalUrl,
      eventType: "agent.chat.result",
      status: result.success ? "success" : "error",
      metadata: {
        tasksCount: Array.isArray(result.tasks) ? result.tasks.length : 0,
        actionsCount: Array.isArray(result.actions) ? result.actions.length : 0,
        directAction: Boolean(result.directAction),
        quickReply: Boolean(result.quickReply),
        cachedReply: Boolean(result.cachedReply),
        workflowCleared: Boolean(result.workflowCleared),
        planningFailed: Boolean(result.planningFailed),
      },
    });

    return res.status(200).json({ ...result, requestId });
  } catch (error) {
    console.error("[ATHINA][/api/chat] Orchestrator error:", {
      requestId,
      message: error?.message || "Unknown error",
      stack: process.env.NODE_ENV === "development" ? error?.stack : undefined,
    });

    return res.status(500).json({
      success: false,
      error: "Chat processing failed",
      details: error?.message || "Unknown backend error",
      reply: "I couldn't complete that request because the backend encountered an error.",
      actions: [],
      requestId,
    });
  }
});

app.post("/api/voice", async (req, res) => {
  try {
    const {
      audioBase64,
      sessionId = "default",
      userId = null,
      locationContext = null,
    } = req.body || {};

    if (!audioBase64) {
      return res.status(400).json({ success: false, error: "Missing audioBase64" });
    }

    const transcript = await transcribeSpeech(audioBase64);

    if (!transcript) {
      const textResponse =
        "I couldn't transcribe that voice message. Please try again or type your request.";
      return res.json({
        success: false,
        transcript: null,
        text: textResponse,
        audioBase64: await synthesizeSpeech(textResponse),
        sessionId,
        actions: [],
      });
    }

    const result = await orchestrate({
      message: transcript,
      sessionId,
      userId,
      mode: "voice",
      locationContext,
    });

    const audioBase64Response = result.reply
      ? await synthesizeSpeech(result.reply)
      : null;

    await emitAudit({
      requestId: req.audit?.requestId || null,
      sessionId,
      actorId: userId,
      endpoint: req.originalUrl,
      eventType: "voice.result",
      status: result.success ? "success" : "error",
      metadata: {
        transcriptAvailable: true,
        transcriptHash: hashText(transcript),
        transcriptPreview: clip(redactText(transcript), 120),
        actionsCount: Array.isArray(result.actions) ? result.actions.length : 0,
      },
    });

    return res.json({
      success: result.success,
      transcript,
      text: result.reply,
      audioBase64: audioBase64Response,
      sessionId,
      actions: result.actions || [],
      tasks: result.tasks || [],
      plan: result.plan || null,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Voice processing failed",
      details: error?.message || "Unknown backend error",
    });
  }
});

app.use((error, req, res, _next) => {
  if (error?.message?.startsWith("CORS origin not allowed:")) {
    return res.status(403).json({
      success: false,
      error: "CORS origin not allowed",
      details: error.message,
    });
  }

  console.error("[UNHANDLED]", error);
  return res.status(500).json({
    success: false,
    error: "Internal server error",
    details: process.env.NODE_ENV === "development" ? error?.message : undefined,
  });
});

app.listen(PORT, () => {
  console.log(`ATHINA backend running on port ${PORT}`);
  console.log(
    `AUDIT_LOGS_ENABLED=${AUDIT_LOGS_ENABLED}, AUDIT_SUPABASE_ENABLED=${AUDIT_SUPABASE_ENABLED}`
  );
});
