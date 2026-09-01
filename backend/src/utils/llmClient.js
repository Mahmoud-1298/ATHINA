import { safeJsonParse } from "./helpers.js";

/*
 * ATHINA model order
 * 1. OpenRouter GPT-OSS 120B
 * 2. OpenRouter Llama 3.3 70B Instruct
 * 3. Direct Gemini API
 */
const PRIMARY_MODEL =
  process.env.ATHINA_PRIMARY_MODEL ||
  process.env.OPENROUTER_MODEL ||
  "openai/gpt-oss-120b";

const SECONDARY_MODEL =
  process.env.ATHINA_SECONDARY_MODEL ||
  "meta-llama/llama-3.3-70b-instruct";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  process.env.Gemini_API_Model ||
  "gemini-2.5-flash-lite";

const DEFAULT_MODEL = PRIMARY_MODEL;
const FALLBACK_MODEL = SECONDARY_MODEL;
const FALLBACK_MODELS = [SECONDARY_MODEL];

const RESPONSE_CACHE = new Map();
const CACHE_TTL_MS =
  Number(process.env.LLM_CACHE_TTL_MS) || 5 * 60 * 1000;

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.Gemini_API_Key ||
  "";

const OPENROUTER_TIMEOUT_MS =
  Number(process.env.OPENROUTER_TIMEOUT_MS) || 90_000;
const GEMINI_TIMEOUT_MS =
  Number(process.env.GEMINI_TIMEOUT_MS) || 90_000;

const getCacheKey = ({
  model,
  messages,
  temperature,
  maxTokens,
  jsonMode,
}) =>
  JSON.stringify({
    model,
    messages,
    temperature,
    maxTokens,
    jsonMode,
  });

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
  RESPONSE_CACHE.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
};

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

// Embedding-only models can never serve chat/completions requests.
const isEmbeddingOnlyModel = (model) =>
  /embed/i.test(String(model || ""));

const fetchWithTimeout = async (
  url,
  options,
  timeoutMs,
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `LLM request timed out after ${timeoutMs}ms.`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

/*
 * Some models occasionally wrap a valid JSON object in markdown fences or
 * explanatory text. This helper keeps strict parsing first, then safely tries
 * the first complete JSON object/array found in the response.
 */
const extractBalancedJson = (text) => {
  const source = String(text || "").trim();
  if (!source) return null;

  const direct = safeJsonParse(source);
  if (direct) return direct;

  const withoutFences = source
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const unfenced = safeJsonParse(withoutFences);
  if (unfenced) return unfenced;

  const startIndexes = [
    withoutFences.indexOf("{"),
    withoutFences.indexOf("["),
  ].filter((index) => index >= 0);

  if (!startIndexes.length) return null;

  const start = Math.min(...startIndexes);
  const opening = withoutFences[start];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < withoutFences.length; index += 1) {
    const character = withoutFences[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === opening) depth += 1;
    if (character === closing) depth -= 1;

    if (depth === 0) {
      const candidate = withoutFences.slice(start, index + 1);
      return safeJsonParse(candidate);
    }
  }

  return null;
};

const buildGeminiPayload = (
  messages,
  temperature,
  maxTokens,
  jsonMode,
) => {
  const systemText = messages
    .filter((message) => message.role === "system")
    .map((message) => String(message.content || ""))
    .join("\n\n");

  const conversationText = messages
    .filter((message) => message.role !== "system")
    .map((message) => {
      const role =
        message.role === "assistant" ? "Assistant" : "User";
      return `${role}: ${String(message.content || "")}`;
    })
    .join("\n\n");

  const prompt = [
    systemText,
    jsonMode
      ? "CRITICAL: Return ONLY one valid JSON value. Do not use markdown, code fences, analysis, or additional text."
      : "",
    conversationText,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      ...(jsonMode
        ? { responseMimeType: "application/json" }
        : {}),
    },
  };
};

const tryGeminiModel = async (
  model,
  messages,
  temperature,
  maxTokens,
  jsonMode,
) => {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "Missing GEMINI_API_KEY (or Gemini_API_Key) environment variable.",
    );
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent?key=` +
    encodeURIComponent(GEMINI_API_KEY);

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        buildGeminiPayload(
          messages,
          temperature,
          maxTokens,
          jsonMode,
        ),
      ),
    },
    GEMINI_TIMEOUT_MS,
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gemini error ${response.status}: ${errorText}`,
    );
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  const content =
    candidate?.content?.parts
      ?.map((part) => part?.text || "")
      .join("") || "";

  if (!content) {
    const finishReason = candidate?.finishReason || "unknown";
    throw new Error(
      `Empty response from Gemini model ${model} ` +
        `(finishReason=${finishReason})`,
    );
  }

  if (jsonMode) {
    const parsed = extractBalancedJson(content);
    if (!parsed) {
      throw new Error(
        `Failed to parse JSON from Gemini model ${model}`,
      );
    }
    return parsed;
  }

  return content;
};

export const callOpenRouter = async (
  payload,
  maxRetries = 3,
) => {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error(
      "Missing OPENROUTER_API_KEY environment variable.",
    );
  }

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const response = await fetchWithTimeout(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization:
            "Bearer " + process.env.OPENROUTER_API_KEY,
          "Content-Type": "application/json",
          "HTTP-Referer":
            process.env.PUBLIC_APP_URL || "https://athina.ai",
          "X-Title": "ATHINA",
        },
        body: JSON.stringify(payload),
      },
      OPENROUTER_TIMEOUT_MS,
    );

    if (response.status === 429 && attempt < maxRetries) {
      const retryAfter =
        Number(response.headers.get("retry-after")) ||
        Math.pow(2, attempt);
      await sleep(retryAfter * 1000);
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenRouter error ${response.status}: ${errorText}`,
      );
    }

    return response;
  }

  throw new Error(
    "OpenRouter request failed after retries.",
  );
};

const buildOpenRouterPayload = (
  model,
  messages,
  temperature,
  maxTokens,
  jsonMode,
) => {
  let adjustedMessages = messages;

  const useResponseFormat =
    jsonMode &&
    !model.includes(":free") &&
    model !== "openrouter/free";

  if (jsonMode) {
    adjustedMessages = messages.map((message) =>
      message.role === "system"
        ? {
            ...message,
            content:
              String(message.content || "") +
              "\n\nCRITICAL: Return ONLY one valid JSON value. " +
              "Do not use markdown, code fences, analysis, or extra text.",
          }
        : message,
    );

    if (
      !adjustedMessages.some(
        (message) => message.role === "system",
      )
    ) {
      adjustedMessages = [
        {
          role: "system",
          content:
            "CRITICAL: Return ONLY one valid JSON value. " +
            "Do not use markdown, code fences, analysis, or extra text.",
        },
        ...adjustedMessages,
      ];
    }
  }

  const payload = {
    model,
    messages: adjustedMessages,
    stream: false,
    temperature,
    max_tokens: maxTokens,
  };

  if (useResponseFormat) {
    payload.response_format = {
      type: "json_object",
    };
  }

  return payload;
};

const extractMessageContent = (message) => {
  const content = message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
};

const tryOpenRouterModel = async (
  model,
  messages,
  temperature,
  maxTokens,
  jsonMode,
) => {
  const response = await callOpenRouter(
    buildOpenRouterPayload(
      model,
      messages,
      temperature,
      maxTokens,
      jsonMode,
    ),
  );

  const data = await response.json();
  const choice = data?.choices?.[0];
  const content = extractMessageContent(choice?.message);

  if (!content) {
    const finishReason = choice?.finish_reason || "unknown";
    throw new Error(
      `Empty response from model ${model} ` +
        `(finish_reason=${finishReason})`,
    );
  }

  if (jsonMode) {
    const parsed = extractBalancedJson(content);
    if (!parsed) {
      throw new Error(
        `Failed to parse JSON from model ${model}`,
      );
    }
    return parsed;
  }

  return content;
};

const callCachedModel = async ({
  provider,
  model,
  messages,
  temperature,
  maxTokens,
  jsonMode,
}) => {
  const cacheModel = `${provider}:${model}`;
  const cacheKey = getCacheKey({
    model: cacheModel,
    messages,
    temperature,
    maxTokens,
    jsonMode,
  });

  const cached = getCachedResponse(cacheKey);
  if (cached !== null) {
    console.info(`[LLM] Cache hit for ${cacheModel}`);
    return cached;
  }

  const startedAt = Date.now();
  const result =
    provider === "gemini"
      ? await tryGeminiModel(
          model,
          messages,
          temperature,
          maxTokens,
          jsonMode,
        )
      : await tryOpenRouterModel(
          model,
          messages,
          temperature,
          maxTokens,
          jsonMode,
        );

  setCachedResponse(cacheKey, result);

  console.info("[LLM] Model completed", {
    provider,
    model,
    jsonMode,
    durationMs: Date.now() - startedAt,
  });

  return result;
};

/*
 * Real token-by-token streaming for plain-text (non-JSON) completions.
 * Falls back to non-streaming callLLM if the streaming request fails
 * before any tokens were delivered, so callers always get a full reply.
 */
export const streamLLM = async ({
  messages,
  model,
  temperature = 0.3,
  maxTokens = 4000,
  onToken,
}) => {
  const candidateModels = Array.from(
    new Set(
      [model || PRIMARY_MODEL, PRIMARY_MODEL, SECONDARY_MODEL]
        .map((candidate) => String(candidate || "").trim())
        .filter(Boolean)
        .filter((candidate) => !isEmbeddingOnlyModel(candidate)),
    ),
  );

  if (!process.env.OPENROUTER_API_KEY) {
    const fullText = await callLLM({ messages, model, temperature, maxTokens });
    onToken?.(fullText);
    return fullText;
  }

  let lastError = null;

  for (const candidate of candidateModels) {
    let deliveredAny = false;
    let fullText = "";

    try {
      const response = await fetchWithTimeout(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + process.env.OPENROUTER_API_KEY,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.PUBLIC_APP_URL || "https://athina.ai",
            "X-Title": "ATHINA",
          },
          body: JSON.stringify({
            model: candidate,
            messages,
            stream: true,
            temperature,
            max_tokens: maxTokens,
          }),
        },
        OPENROUTER_TIMEOUT_MS,
      );

      if (!response.ok || !response.body) {
        throw new Error(`OpenRouter streaming error ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;

          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          const parsed = safeJsonParse(payload);
          const delta = parsed?.choices?.[0]?.delta?.content || "";
          if (delta) {
            deliveredAny = true;
            fullText += delta;
            onToken?.(delta);
          }
        }
      }

      if (deliveredAny) return fullText;
      throw new Error(`Model ${candidate} produced no streamed tokens.`);
    } catch (error) {
      lastError = error;
      console.warn(
        `[LLM] Streaming model "${candidate}" failed. Trying next model.`,
        error?.message || error,
      );
    }
  }

  console.warn(
    "[LLM] All streaming attempts failed, falling back to non-streaming callLLM:",
    lastError?.message || lastError,
  );
  const fullText = await callLLM({ messages, model, temperature, maxTokens });
  onToken?.(fullText);
  return fullText;
};

export const callLLM = async ({
  messages,
  model,
  temperature = 0.3,
  maxTokens = 4000,
  jsonMode = false,
}) => {
  const requestedPrimary = model || PRIMARY_MODEL;

  // Try requested model first, then configured primary/secondary fallbacks,
  // followed by direct Gemini as the final provider fallback.
  const openRouterModels = Array.from(
    new Set([
      requestedPrimary,
      PRIMARY_MODEL,
      SECONDARY_MODEL,
    ]
      .map((candidate) => String(candidate || "").trim())
      .filter(Boolean)),
  );

  const failures = [];

  for (const candidate of openRouterModels) {
    if (isEmbeddingOnlyModel(candidate)) {
      failures.push(
        `openrouter/${candidate}: embedding-only model, skipped chat/completions call`,
      );
      console.warn(
        `[LLM] Model "${candidate}" is embedding-only. Skipping chat/completions attempt.`,
      );
      continue;
    }

    try {
      return await callCachedModel({
        provider: "openrouter",
        model: candidate,
        messages,
        temperature,
        maxTokens,
        jsonMode,
      });
    } catch (error) {
      failures.push(
        `openrouter/${candidate}: ${error.message}`,
      );
      console.warn(
        `[LLM] OpenRouter model "${candidate}" failed. ` +
          "Trying next model.",
        error.message,
      );
    }
  }

  if (!GEMINI_API_KEY) {
    failures.push(
      "direct-gemini: GEMINI_API_KEY is not configured",
    );
  } else {
    try {
      return await callCachedModel({
        provider: "gemini",
        model: GEMINI_MODEL,
        messages,
        temperature,
        maxTokens,
        jsonMode,
      });
    } catch (error) {
      failures.push(`direct-gemini/${GEMINI_MODEL}: ${error.message}`);
      console.warn(
        `[LLM] Gemini model "${GEMINI_MODEL}" failed.`,
        error.message,
      );
    }
  }

  throw new Error(
    "All configured LLM models failed. " + failures.join(" | "),
  );
};

export {
  PRIMARY_MODEL,
  SECONDARY_MODEL,
  GEMINI_MODEL,
  FALLBACK_MODELS,
  FALLBACK_MODEL,
  DEFAULT_MODEL,
};
