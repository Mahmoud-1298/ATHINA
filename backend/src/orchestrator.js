import { callLLM } from "./utils/llmClient.js";
import { getHistory, saveTurn, savePlan, saveTaskResult } from "./memory/supabaseMemory.js";
import { plan } from "./planner.js";
import { decomposeTasks } from "./taskDecomposer.js";
import { execute as executeTasks } from "./executionEngine.js";
import { validatePlan, validateTasks, checkSafety } from "./ruleEngine.js";
const CORE_PROMPT = [
  "You are ATHINA, an autonomous executive AI agent.",
  "The user is your primary operator. You may call the user Sir sparingly when natural.",
  "Operate like a practical JARVIS-style assistant:",
  "- Understand the user goal.",
  "- Break complex requests into steps and execute them autonomously using available tools.",
  "- Be concise, loyal, professional, and intelligent.",
  "- Never pretend you performed an action that the system did not actually perform.",
  "- If a request is unsafe, impossible, or needs credentials, explain the limitation and propose the next step.",
].join("\n");
const TEXT_MODE_RULES = "Text mode: answer clearly and concisely. Prefer short paragraphs.";
const VOICE_MODE_RULES = "Voice mode: reply in short spoken-friendly sentences suitable for text-to-speech.";
export const orchestrate = async ({ message, sessionId = "default", mode = "text" }) => {
  const safety = checkSafety(message);
  if (!safety.safe) return { success: false, reply: "I cannot process this request: " + safety.reason, actions: [], sessionId, timestamp: new Date().toISOString() };
  const history = await getHistory(sessionId);
  const planResult = await plan({ message, history });
  if (!planResult.requiresPlanning) {
    const reply = planResult.reply || "I am here. How can I help?";
    await saveTurn(sessionId, message, reply);
    return { success: true, reply, actions: [], sessionId, timestamp: new Date().toISOString() };
  }
  const planValidation = validatePlan(planResult);
  if (!planValidation.valid) {
    const reply = "I cannot execute this plan: " + planValidation.violations.join("; ");
    await saveTurn(sessionId, message, reply);
    return { success: false, reply, actions: [], sessionId, timestamp: new Date().toISOString() };
  }
  const tasks = await decomposeTasks({ plan: planResult, history });
  const taskValidation = validateTasks(tasks);
  if (!taskValidation.valid) {
    const reply = "I cannot execute these tasks: " + taskValidation.violations.join("; ");
    await saveTurn(sessionId, message, reply);
    return { success: false, reply, actions: [], sessionId, timestamp: new Date().toISOString() };
  }
  await savePlan(sessionId, { goal: planResult.goal, steps: planResult.steps, tasks });
  const { executed } = await executeTasks(tasks, { saveTaskResult, sessionId });
  const finalReply = await generateReply({ message, plan: planResult, executed, mode });
  await saveTurn(sessionId, message, finalReply);
  const actions = mapToActions(executed);
  return { success: true, reply: finalReply, actions, sessionId, timestamp: new Date().toISOString(), plan: { goal: planResult.goal, steps: planResult.steps }, tasks: executed.map((t) => ({ id: t.id, tool: t.tool, description: t.description, success: t.result && t.result.success })) };
};
const generateReply = async ({ message, plan: planResult, executed, mode }) => {
  const taskSummary = executed.map((t) => "- " + (t.description || t.id) + " (" + t.tool + "): " + (t.result && t.result.success ? "completed" : "failed - " + (t.result && t.result.error || "unknown"))).join("\n");
  const taskResults = executed.map((t) => "Task: " + (t.description || t.id) + "\nTool: " + t.tool + "\nResult: " + JSON.stringify(t.result).slice(0, 600)).join("\n\n");
  const reply = await callLLM({
    messages: [
      { role: "system", content: CORE_PROMPT + "\n" + (mode === "voice" ? VOICE_MODE_RULES : TEXT_MODE_RULES) },
      { role: "user", content: "The user asked: " + message + "\n\nI executed the following plan:\n" + taskSummary + "\n\nDetailed results:\n" + taskResults + "\n\nSummarize what you did for the user in a clear, natural way. Mention specific details from the results (names, prices, locations). If any task failed, mention what went wrong and suggest a fix." },
    ],
    temperature: 0.3,
    maxTokens: 500,
  });
  return reply;
};
const mapToActions = (executed) => {
  const actions = [];
  for (const task of executed) {
    if (!task.result || !task.result.success) continue;
    if (task.result.type === "locate") { actions.push(task.result); }
    else if (task.result.type === "web_search") { actions.push({ type: "browse", query: task.result.query, success: true, summary: task.result.summary, sources: task.result.results, fetchedAt: new Date().toISOString() }); }
  }
  return actions;
};