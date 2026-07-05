import { safeJsonParse } from "./helpers.js";

const PRIMARY_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const FALLBACK_MODEL = process.env.OPENROUTER_FALLBACK_MODEL || "openai/gpt-oss-20b";

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

export const callLLM = async ({ messages, model, temperature = 0.3, maxTokens = 1000, jsonMode = false }) => {
  const buildPayload = (m) => {
    const p = { model: m, messages, stream: false, temperature, max_tokens: maxTokens };
    if (jsonMode) p.response_format = { type: "json_object" };
    return p;
  };

  const extractContent = (response) => {
    const data = response.json ? null : null;
    return data;
  };

  const parseResponse = (response) => {
    return response.json();
  };

  const primaryModel = model || PRIMARY_MODEL;

  // Try primary (free) model first
  try {
    const response = await callOpenRouter(buildPayload(primaryModel));
    const data = await parseResponse(response);
    const content = data.choices?.[0]?.message?.content || "";
    if (!content) throw new Error("Empty response from primary model");
    if (jsonMode) return safeJsonParse(content) || { error: "Failed to parse LLM JSON response", raw: content };
    return content;
  } catch (primaryError) {
    // If primary failed and we haven't tried a different model, fall back
    if (primaryModel === FALLBACK_MODEL) throw primaryError;

    console.warn("[LLM] Primary model \"" + primaryModel + "\" failed: " + primaryError.message + ". Falling back to \"" + FALLBACK_MODEL + "\".");

    try {
      const response = await callOpenRouter(buildPayload(FALLBACK_MODEL));
      const data = await parseResponse(response);
      const content = data.choices?.[0]?.message?.content || "";
      if (jsonMode) return safeJsonParse(content) || { error: "Failed to parse LLM JSON response", raw: content };
      return content;
    } catch (fallbackError) {
      throw new Error("Both primary (" + primaryModel + ") and fallback (" + FALLBACK_MODEL + ") models failed. Primary: " + primaryError.message + " | Fallback: " + fallbackError.message);
    }
  }
};

export { PRIMARY_MODEL, FALLBACK_MODEL };
