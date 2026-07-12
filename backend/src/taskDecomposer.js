import { callLLM } from "./utils/llmClient.js";
import { getToolSchemas } from "./tools/index.js";

const DECOMPOSER_PROMPT = [
  "You are ATHINA Task Decomposer. Convert each plan step into an executable task.",
  "Available tools:",
  "- llm: Reason/analyze/generate. Params: { prompt, systemPrompt }",
  "- web_search: Search the web. Params: { query }",
  "- maps: Find location. Params: { query }",
  "- email: Send email. Params: { to, subject, body }",
  "- calendar: Add calendar event. Params: { title, datetime, location, description }",
  "- booking: Search hotels/services. Params: { query, location, minRating, checkIn, checkOut }",
  "Return JSON: { \"tasks\": [{ \"id\": \"task_1\", \"description\": \"\", \"tool\": \"tool_name\", \"params\": {}, \"depends_on\": [] }] }",
  "Rules: Use ${task_X.field} in params to reference results from previous tasks. Each task uses one tool. Order by dependency. For email use user@example.com if unknown. For calendar use ISO datetime. Max 10 tasks. Use llm tool if no tool fits.",
  "Return only valid JSON.",
].join("\n");

export const decomposeTasks = async ({ plan: planResult, history, locationNote = "" }) => {
  const toolList = getToolSchemas().map((t) => "- " + t.name + ": " + t.description).join("\n");
  const planText = "Goal: " + planResult.goal + "\nSteps:\n" + planResult.steps.map((s, i) => (i + 1) + ". " + s).join("\n");
  const userContent = [locationNote, planText].filter(Boolean).join("\n\n");
  const messages = [{ role: "system", content: DECOMPOSER_PROMPT + "\n\nAvailable tools:\n" + toolList }, ...history.slice(-2), { role: "user", content: userContent }];
  const result = await callLLM({ messages, temperature: 0.1, maxTokens: 1500, jsonMode: true });
  return result.tasks || [];
};