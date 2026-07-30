import { callLLM } from "../utils/llmClient.js";

const ATHINA_SYSTEM = `
You are ATHINA, an autonomous executive AI assistant.
You are calm, intelligent, confident, concise, and natural.
Never mention being an AI.
Never claim that an external action was completed unless a verified tool result says it succeeded.
When summarizing content, return a real summary rather than repeating raw HTML, markup, headers, or source code.
`.trim();

const extractText = async (response) => {
  if (typeof response === "string") return response.trim();

  if (response && typeof response.json === "function") {
    const data = await response.json();
    return String(data?.choices?.[0]?.message?.content || data?.reply || "").trim();
  }

  return String(
    response?.choices?.[0]?.message?.content ||
      response?.content ||
      response?.reply ||
      ""
  ).trim();
};

export const execute = async (params = {}) => {
  const { prompt, systemPrompt } = params;
  if (!String(prompt || "").trim()) {
    return { type: "llm", success: false, error: "Missing prompt parameter." };
  }

  const messages = [
    {
      role: "system",
      content: systemPrompt
        ? `${ATHINA_SYSTEM}\n\n${String(systemPrompt).trim()}`
        : ATHINA_SYSTEM,
    },
    { role: "user", content: String(prompt).trim() },
  ];

  try {
    const response = await callLLM({
      messages,
      temperature: 0.2,
      maxTokens: 800,
      stream: false,
    });

    const text = await extractText(response);
    if (!text) {
      return { type: "llm", success: false, error: "The language model returned no usable text." };
    }

    return {
      type: "llm",
      success: true,
      prompt: String(prompt).trim(),
      response: text,
      text,
    };
  } catch (error) {
    return {
      type: "llm",
      success: false,
      error: error?.message || "LLM execution failed.",
    };
  }
};

export const schema = {
  description: "Reason, analyze, summarize, or generate text. This tool cannot perform external actions.",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      systemPrompt: { type: "string" },
    },
    required: ["prompt"],
  },
};
