import { executeTool } from "./tools/index.js";
const resolveParamValue = (value, results) => {
  if (typeof value !== "string") return value;
  return value.replace(/\$\{(\w+)\.(\w+)\}/g, (match, taskId, field) => {
    const result = results[taskId];
    if (!result) return match;
    const val = result[field];
    if (val === undefined || val === null) return match;
    return typeof val === "string" ? val : JSON.stringify(val);
  });
};
const resolveParams = (params, results) => {
  const resolved = {};
  for (const [key, value] of Object.entries(params || {})) {
    resolved[key] = typeof value === "string" ? resolveParamValue(value, results) : value;
  }
  return resolved;
};
export const execute = async (tasks, { saveTaskResult, sessionId }) => {
  const results = {};
  const executed = [];
  for (const task of tasks) {
    const resolvedParams = resolveParams(task.params || {}, results);
    const result = await executeTool(task.tool, resolvedParams);
    results[task.id] = result;
    executed.push({ ...task, params: resolvedParams, result });
    if (saveTaskResult && sessionId) await saveTaskResult(sessionId, task.id, task.tool, result);
  }
  return { results, executed };
};