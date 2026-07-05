// Rule Engine — validates plans and tasks against safety rules and constraints
const UNSAFE_PATTERNS = [/hack|exploit|malware|phishing|ransomware/i, /illegal|drug|weapon|firearm/i, /steal|fraud|embezzle|launder/i, /bomb|terror|kill|harm/i];
const VALID_TOOLS = ["llm", "web_search", "maps", "email", "calendar", "booking"];
export const validatePlan = (plan) => {
  const violations = [];
  if (!plan || !plan.goal) { violations.push("Plan must have a goal"); return { valid: false, violations }; }
  const planText = JSON.stringify(plan).toLowerCase();
  for (const pattern of UNSAFE_PATTERNS) { if (pattern.test(planText)) { violations.push("Plan contains unsafe or prohibited content"); break; } }
  if (plan.steps && plan.steps.length > 12) violations.push("Plan has too many steps (max 12)");
  return { valid: violations.length === 0, violations };
};
export const validateTasks = (tasks) => {
  const violations = [];
  if (!Array.isArray(tasks) || tasks.length === 0) { violations.push("No tasks to execute"); return { valid: false, violations }; }
  if (tasks.length > 12) violations.push("Too many tasks (max 12)");
  for (const task of tasks) {
    if (!task.id || !task.tool) { violations.push("Each task must have id and tool"); continue; }
    if (!VALID_TOOLS.includes(task.tool)) violations.push("Invalid tool: " + task.tool);
  }
  return { valid: violations.length === 0, violations };
};
export const requiresConfirmation = (tasks) => tasks.some((t) => t.tool === "email" || t.tool === "booking");
export const checkSafety = (userMessage) => {
  const lower = (userMessage || "").toLowerCase();
  for (const pattern of UNSAFE_PATTERNS) { if (pattern.test(lower)) return { safe: false, reason: "Request contains unsafe or prohibited content" }; }
  return { safe: true };
};