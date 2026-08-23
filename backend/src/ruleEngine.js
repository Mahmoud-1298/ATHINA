import { getToolSchemas } from "./tools/index.js";

const UNSAFE_PATTERNS = [
  /\b(hack|exploit|malware|phishing|ransomware)\b/i,
  /\b(illegal drug|weapon|firearm)\b/i,
  /\b(steal|fraud|embezzle|launder)\b/i,
  /\b(bomb|terror|kill|harm)\b/i,
];

const getValidTools = () =>
  new Set(
    getToolSchemas()
      .map((schema) => String(schema?.name || "").trim().toLowerCase())
      .filter(Boolean)
  );

const VALID_ACTIONS = {
  email: new Set(["send", "list", "read", "draft", "reply", "forward"]),
  calendar: new Set([
    "create_event",
    "list_events",
    "get_event",
    "find_event",
    "check_availability",
    "ensure_slot",
    "update_event",
    "move_event",
    "delete_event",
  ]),
};

const containsUnsafeContent = (value) => {
  const text = String(value || "").toLowerCase();
  return UNSAFE_PATTERNS.some((pattern) => pattern.test(text));
};

export const validatePlan = (plan) => {
  const violations = [];

  if (!plan || typeof plan !== "object") {
    return { valid: false, violations: ["Plan must be an object."] };
  }

  if (!String(plan.goal || "").trim()) violations.push("Plan must have a goal.");
  if (containsUnsafeContent(JSON.stringify(plan))) {
    violations.push("Plan contains unsafe or prohibited content.");
  }

  if (Array.isArray(plan.steps) && plan.steps.length > 12) {
    violations.push("Plan has too many steps. Maximum is 12.");
  }

  return { valid: violations.length === 0, violations };
};

const validateEmailTask = (task, violations) => {
  const action = String(task.params?.action || "send").toLowerCase();
  if (!VALID_ACTIONS.email.has(action)) {
    violations.push(`${task.id}: unsupported email action "${action}".`);
    return;
  }

  if (action === "send") {
    if (!task.params?.to) violations.push(`${task.id}: email send requires "to".`);
    if (!String(task.params?.subject || "").trim()) {
      violations.push(`${task.id}: email send requires "subject".`);
    }
  }

  if (action === "read" && !task.params?.messageId) {
    const hasReference = typeof task.params?.messageId === "string" && task.params.messageId.includes("${");
    if (!hasReference) violations.push(`${task.id}: email read requires "messageId".`);
  }
};

const validateCalendarTask = (task, violations) => {
  const action = String(task.params?.action || "create_event").toLowerCase();
  if (!VALID_ACTIONS.calendar.has(action)) {
    violations.push(`${task.id}: unsupported calendar action "${action}".`);
    return;
  }

  if (["create_event", "ensure_slot"].includes(action)) {
    if (!String(task.params?.title || "").trim()) {
      violations.push(`${task.id}: calendar action requires "title".`);
    }

    const hasStart =
      Boolean(task.params?.start) ||
      Boolean(task.params?.datetime) ||
      (Boolean(task.params?.date) && Boolean(task.params?.time));

    if (!hasStart) {
      violations.push(
        `${task.id}: calendar action requires start/datetime or both date and time.`
      );
    }
  }

  if (action === "check_availability") {
    const hasStart =
      Boolean(task.params?.start) ||
      Boolean(task.params?.datetime) ||
      (Boolean(task.params?.date) && Boolean(task.params?.time));
    if (!hasStart) {
      violations.push(`${task.id}: availability check requires a date and time window.`);
    }
  }
};

export const validateTasks = (tasks) => {
  const violations = [];
  const validTools = getValidTools();

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { valid: false, violations: ["No tasks to execute."] };
  }

  if (tasks.length > 12) violations.push("Too many tasks. Maximum is 12.");

  const ids = new Set();
  for (const task of tasks) {
    if (!task?.id || !task?.tool) {
      violations.push("Each task must have an id and tool.");
      continue;
    }

    if (ids.has(task.id)) violations.push(`Duplicate task id: ${task.id}.`);
    ids.add(task.id);

    if (!validTools.has(task.tool)) {
      violations.push(`Invalid tool: ${task.tool}.`);
      continue;
    }

    if (!task.params || typeof task.params !== "object" || Array.isArray(task.params)) {
      violations.push(`${task.id}: params must be an object.`);
      continue;
    }

    if (task.tool === "email") validateEmailTask(task, violations);
    if (task.tool === "calendar") validateCalendarTask(task, violations);
  }

  return { valid: violations.length === 0, violations };
};

// Explicit user commands authorize ordinary email and calendar writes.
// Destructive or financial actions should still be controlled by the tool registry.
export const requiresConfirmation = () => false;

export const checkSafety = (userMessage) => {
  if (containsUnsafeContent(userMessage)) {
    return { safe: false, reason: "Request contains unsafe or prohibited content." };
  }

  return { safe: true };
};
