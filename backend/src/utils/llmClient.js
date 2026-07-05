import { safeJsonParse } from "./helpers.js";

const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const FALLBACK_MODEL = process.env.OPENROUTER_FALLBACK_MODEL || "openai/gpt-oss-20b";
const DEFAULT_MODEL = PRIMARY_MODEL;
const RESPONSE_CACHE = new Map();
const CACHE_TTL_MS = Number(process.env.LLM_CACHE_TTL_MS) || 5 * 60 * 1000;

const getCacheKey = ({ model, messages, temperature, maxTokens, jsonMode }) =>
  JSON.stringify({ model, messages, temperature, maxTokens, jsonMode });

const getCachedResponse = (key) => {
  const entry = RESPONSE_CACHE.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    RESPONSE_CACHE.delete(key);
    return null;
  }
  return entry.value;
};

const setCachedResponse = (key, value) => {
  RESPONSE_CACHE.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
};

export const callOpenRouter = async (payload, maxRetries = 3) => {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("Missing OPENROUTER_API_KEY environment variable.");
  }
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENROUTER_API_KEY,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.PUBLIC_APP_URL || "https://athina.ai",
        "X-Title": "ATHINA",
      },
      body: JSON.stringify(payload),
    });
    if (response.status === 429 && attempt < maxRetries) {
      const retryAfter = Number(response.headers.get("retry-after")) || Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      continue;
    }
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error("OpenRouter error " + response.status + ": " + errorText);
    }
    return response;
  }
  throw new Error("OpenRouter request failed after retries.");
};

const callGemini = async (model, payload, maxRetries = 3) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY environment variable.");
  }

  const modelName = model.startsWith("models/") ? model : "models/" + model;
  const url =
    "https://generativelanguage.googleapis.com/v1beta/" +
    modelName +
    ":generateContent?key=" +
    encodeURIComponent(process.env.GEMINI_API_KEY);

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 429 && attempt < maxRetries) {
      const retryAfter = Number(response.headers.get("retry-after")) || Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error("Gemini error " + response.status + ": " + errorText);
    }

    return response;
  }

  throw new Error("Gemini request failed after retries.");
};

const buildOpenRouterPayload = (model, messages, temperature, maxTokens, jsonMode) => {
  let adjustedMessages = messages;
  // Some lightweight models may not support response_format; keep JSON constraints in-system either way
  const useResponseFormat = jsonMode && model !== "openrouter/free";
  if (jsonMode) {
    adjustedMessages = messages.map((m) =>
      m.role === "system"
        ? { ...m, content: m.content + "\n\nCRITICAL: Return ONLY valid JSON. No markdown, no code fences, no extra text." }
        : m
    );
    if (!adjustedMessages.some((m) => m.role === "system")) {
      adjustedMessages = [{ role: "system", content: "CRITICAL: Return ONLY valid JSON. No markdown, no code fences, no extra text." }, ...adjustedMessages];
    }
  }
  const payload = { model, messages: adjustedMessages, stream: false, temperature, max_tokens: maxTokens };
  if (useResponseFormat) payload.response_format = { type: "json_object" };
  return payload;
};

const buildGeminiPayload = (messages, temperature, maxTokens, jsonMode) => {
  const systemMessages = [];
  const contents = [];

  for (const message of messages) {
    if (!message?.content) continue;

    if (message.role === "system") {
      systemMessages.push(message.content);
      continue;
    }

    const role = message.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text: String(message.content) }] });
  }

  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "Continue." }] });
  }

  const systemInstructionParts = [...systemMessages];
  if (jsonMode) {
    systemInstructionParts.push("CRITICAL: Return ONLY valid JSON. No markdown, no code fences, no extra text.");
  }

  const payload = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  if (systemInstructionParts.length > 0) {
    payload.systemInstruction = {
      parts: [{ text: systemInstructionParts.join("\n\n") }],
    };
  }

  if (jsonMode) {
    payload.generationConfig.responseMimeType = "application/json";
  }

  return payload;
};

const isGeminiModel = (model) => {
  if (!model) return false;
  return model.startsWith("gemini") || model.startsWith("models/gemini");
};

const tryModel = async (model, messages, temperature, maxTokens, jsonMode) => {
  const response = isGeminiModel(model)
    ? await callGemini(model, buildGeminiPayload(messages, temperature, maxTokens, jsonMode))
    : await callOpenRouter(buildOpenRouterPayload(model, messages, temperature, maxTokens, jsonMode));

  const data = await response.json();

  const content = isGeminiModel(model)
    ? data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || ""
    : data.choices?.[0]?.message?.content || "";

  if (!content) throw new Error("Empty response from model " + model);
  if (jsonMode) {
    const parsed = safeJsonParse(content);
    if (!parsed) throw new Error("Failed to parse JSON from model " + model);
    return parsed;
  }
  return content;
};

export const callLLM = async ({ messages, model, temperature = 0.3, maxTokens = 1000, jsonMode = false }) => {
  const primaryModel = model || PRIMARY_MODEL;
  const cacheKey = getCacheKey({ model: primaryModel, messages, temperature, maxTokens, jsonMode });
  const cached = getCachedResponse(cacheKey);
  if (cached !== null) return cached;

  // Try primary model first
  try {
    const result = await tryModel(primaryModel, messages, temperature, maxTokens, jsonMode);
    setCachedResponse(cacheKey, result);
    return result;
  } catch (primaryError) {
    // If already using fallback model, don't retry
    if (primaryModel === FALLBACK_MODEL) throw primaryError;

    console.warn("[LLM] Primary model \"" + primaryModel + "\" failed: " + primaryError.message + ". Falling back to \"" + FALLBACK_MODEL + "\".");

    // Fall back to reliable model
    try {
      const fallbackCacheKey = getCacheKey({ model: FALLBACK_MODEL, messages, temperature, maxTokens, jsonMode });
      const fallbackCached = getCachedResponse(fallbackCacheKey);
      if (fallbackCached !== null) return fallbackCached;
      const result = await tryModel(FALLBACK_MODEL, messages, temperature, maxTokens, jsonMode);
      setCachedResponse(fallbackCacheKey, result);
      return result;
    } catch (fallbackError) {
      throw new Error("Both primary (" + primaryModel + ") and fallback (" + FALLBACK_MODEL + ") models failed. Primary: " + primaryError.message + " | Fallback: " + fallbackError.message);
    }
  }
};

export { PRIMARY_MODEL, FALLBACK_MODEL, DEFAULT_MODEL };
