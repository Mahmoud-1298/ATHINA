import { getHistory, saveTurn, savePlan, saveTaskResult } from "./memory/supabaseMemory.js";
import { plan } from "./planner.js";
import { decomposeTasks } from "./taskDecomposer.js";
import { execute as executeTasks } from "./executionEngine.js";
import { validatePlan, validateTasks, checkSafety } from "./ruleEngine.js";
import { getQuickReply, buildCompactExecutionReply } from "./llmManager.js";
export const orchestrate = async ({ message, sessionId = "default", mode = "text" }) => {
  const safety = checkSafety(message);
  if (!safety.safe) return { success: false, reply: "I cannot process this request: " + safety.reason, actions: [], sessionId, timestamp: new Date().toISOString() };
  const quickReply = getQuickReply(message);
  if (quickReply) {
    await saveTurn(sessionId, message, quickReply.reply);
    return { success: true, reply: quickReply.reply, actions: [], sessionId, timestamp: new Date().toISOString(), quickReply: true };
  }

  const history = await getHistory(sessionId, 6);
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
  const finalReply = buildCompactExecutionReply(executed);
  await saveTurn(sessionId, message, finalReply);
  const actions = mapToActions(executed);
  return { success: true, reply: finalReply, actions, sessionId, timestamp: new Date().toISOString(), plan: { goal: planResult.goal, steps: planResult.steps }, tasks: executed.map((t) => ({ id: t.id, tool: t.tool, description: t.description, success: t.result && t.result.success })) };
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