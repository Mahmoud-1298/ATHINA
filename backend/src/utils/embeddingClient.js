const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const EMBEDDING_URL = process.env.OPENAI_EMBEDDING_URL || "https://api.openai.com/v1/embeddings";

export const embeddingsEnabled = () => Boolean(process.env.OPENAI_API_KEY);

export const getEmbedding = async (text) => {
  if (!embeddingsEnabled()) return null;

  const input = String(text || "").trim().slice(0, 12000);
  if (!input) return null;

  const response = await fetch(EMBEDDING_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.OPENAI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input,
      model: EMBEDDING_MODEL,
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