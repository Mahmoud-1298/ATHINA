import { callLLM } from "../utils/llmClient.js";

export const execute = async (params) => {
  const { prompt, systemPrompt } = params;
  if (!prompt) return { success: false, error: "Missing prompt parameter" };

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const response = await callLLM({ messages, temperature: 0.4, maxTokens: 600 });

  return {
    type: "llm",
    success: true,
    prompt,
    response,
  };
};

export const schema = {
  name: "llm",
  description: "Ask the LLM to reason, analyze, summarize, or generate text",
  params: {
    prompt: "string (required) - the question or task for the LLM",
    systemPrompt: "string (optional) - system context for the LLM",
  },
};
