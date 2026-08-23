const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const OPENAI_EMBEDDING_URL = process.env.OPENAI_EMBEDDING_URL || "https://api.openai.com/v1/embeddings";
const OPENROUTER_EMBEDDING_URL = process.env.OPENROUTER_EMBEDDING_URL || "https://openrouter.ai/api/v1/embeddings";

const getEmbeddingProvider = () => {
  if (process.env.OPENAI_API_KEY) {
    return {
      url: OPENAI_EMBEDDING_URL,
      apiKey: process.env.OPENAI_API_KEY,
      bearerPrefix: "Bearer ",
    };
  }

  if (process.env.OPENROUTER_API_KEY) {
    return {
      url: OPENROUTER_EMBEDDING_URL,
      apiKey: process.env.OPENROUTER_API_KEY,
      bearerPrefix: "Bearer ",
    };
  }

  return null;
};

export const embeddingsEnabled = () => Boolean(getEmbeddingProvider());

export const getEmbedding = async (text, modelOverride = null) => {
  const provider = getEmbeddingProvider();
  if (!provider) return null;

  const input = String(text || "").trim().slice(0, 12000);
  if (!input) return null;

  const response = await fetch(provider.url, {
    method: "POST",
    headers: {
      Authorization: provider.bearerPrefix + provider.apiKey,
      "Content-Type": "application/json",
      ...(provider.url.includes("openrouter.ai")
        ? {
            "HTTP-Referer": process.env.PUBLIC_APP_URL || "https://athina.ai",
            "X-Title": "ATHINA",
          }
        : {}),
    },
    body: JSON.stringify({
      input,
      model: modelOverride || EMBEDDING_MODEL,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error("Embedding request failed " + response.status + ": " + errorText);
  }

  const data = await response.json();
  const embedding = data?.data?.[0]?.embedding;
  return Array.isArray(embedding) ? embedding : null;
};

export { EMBEDDING_MODEL };