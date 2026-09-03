const OPENAI_EMBEDDING_URL = "https://api.openai.com/v1/embeddings";
const OPENROUTER_EMBEDDING_URL = "https://openrouter.ai/api/v1/embeddings";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const OPENROUTER_DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";

const resolveEmbeddingModel = (providerName, configuredModel) => {
  if (
    providerName === "OpenRouter" &&
    ["text-embedding-3-small", "text-embedding-3-large"].includes(configuredModel)
  ) {
    return `openai/${configuredModel}`;
  }

  return configuredModel;
};

const getEmbeddingProvider = () => {
  if (process.env.OPENAI_API_KEY) {
    return {
      name: "OpenAI",
      url: process.env.OPENAI_EMBEDDING_URL || OPENAI_EMBEDDING_URL,
      apiKey: process.env.OPENAI_API_KEY,
      model: resolveEmbeddingModel(
        "OpenAI",
        process.env.EMBEDDING_MODEL ||
          process.env.OPENAI_EMBEDDING_MODEL ||
          DEFAULT_EMBEDDING_MODEL
      ),
    };
  }

  if (process.env.OPENROUTER_API_KEY) {
    return {
      name: "OpenRouter",
      url: process.env.OPENROUTER_EMBEDDING_URL || OPENROUTER_EMBEDDING_URL,
      apiKey: process.env.OPENROUTER_API_KEY,
      model: resolveEmbeddingModel(
        "OpenRouter",
        process.env.EMBEDDING_MODEL ||
          process.env.OPENROUTER_EMBEDDING_MODEL ||
          OPENROUTER_DEFAULT_EMBEDDING_MODEL
      ),
    };
  }

  return null;
};

const validateModel = (provider, model) => {
  if (provider.name === "OpenAI" && !model.startsWith("text-embedding-")) {
    throw new Error(
      `[EMBEDDING] Model/provider mismatch: ${model} is not an OpenAI embedding model.`
    );
  }

  if (
    provider.name === "OpenRouter" &&
    /(^|\/)(gpt|claude|llama|mistral|gemma|qwen|nemotron)([-/]|$)/i.test(model) &&
    !/embed/i.test(model)
  ) {
    throw new Error(
      `[EMBEDDING] Model/provider mismatch: ${model} is a chat model, not an embedding model. Set OPENROUTER_EMBEDDING_MODEL to a model that supports /embeddings.`
    );
  }
};

export const embeddingsEnabled = () => Boolean(getEmbeddingProvider());

export const getEmbedding = async (text, modelOverride = null) => {
  const provider = getEmbeddingProvider();
  if (!provider) {
    console.error(
      "[EMBEDDING] No provider configured. Set OPENAI_API_KEY or OPENROUTER_API_KEY."
    );
    return null;
  }

  const input = String(text || "").trim().slice(0, 12000);
  if (!input) {
    console.error("[EMBEDDING] Cannot create embedding: input text is empty.");
    return null;
  }

  const model = modelOverride || provider.model;
  validateModel(provider, model);

  console.log(
    `[EMBEDDING] Provider: ${provider.name}; model: ${model}; endpoint: ${provider.url}`
  );

  let response;
  try {
    response = await fetch(provider.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
        ...(provider.url.includes("openrouter.ai")
          ? {
              "HTTP-Referer": process.env.PUBLIC_APP_URL || "https://athina.ai",
              "X-Title": "ATHINA",
            }
          : {}),
      },
      body: JSON.stringify({ input, model }),
    });
  } catch (error) {
    throw new Error(
      `[EMBEDDING] Request failed for ${provider.name} at ${provider.url}: ${error.message}`
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `[EMBEDDING] ${provider.name} returned ${response.status} for model ${model}: ${errorText}`
    );
  }

  const data = await response.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error(
      `[EMBEDDING] ${provider.name} returned no embedding for model ${model}. Response did not contain data[0].embedding.`
    );
  }

  return embedding;
};

export const EMBEDDING_MODEL = DEFAULT_EMBEDDING_MODEL;