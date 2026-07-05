import { safeJsonParse } from "./helpers.js";

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b";

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
  const payload = {
    model: model || DEFAULT_MODEL,
    messages,
    stream: false,
    temperature,
    max_tokens: maxTokens,
  };
  if (jsonMode) {
    payload.response_format = { type: "json_object" };
  }
  const response = await callOpenRouter(payload);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  if (jsonMode) {
    return safeJsonParse(content) || { error: "Failed to parse LLM JSON response", raw: content };
  }
  return content;
};

export { DEFAULT_MODEL };
