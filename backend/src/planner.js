import { callLLM } from "./utils/llmClient.js";
import { getToolSchemas } from "./tools/index.js";

/* =========================================================
   CONFIGURATION
   ========================================================= */

const MAX_TASKS = 5;

const ATHINA_PERSONALITY = `
You are ATHINA, an agentic executive assistant.

You are calm, intelligent, capable, and natural.
You communicate like an experienced human consultant.
You never sound robotic and never mention being an AI.

For conversational requests, answer clearly and naturally.
For action requests, create a precise and executable tool plan.
Never claim that an action succeeded unless a tool actually executed it successfully.
`.trim();

/* =========================================================
   ACTION INTENT DETECTION

   These patterns are a deterministic safeguard. The LLM still
   performs the richer classification, but obvious actions must
   never accidentally become ordinary conversational replies.
   ========================================================= */

const ACTION_PATTERNS = {
  emailWrite:
    /\b(send|write|draft|compose|reply|respond|forward)\b[\s\S]*\b(email|e-mail|mail|message)\b|\b(email|e-mail|mail)\b[\s\S]*\b(send|write|draft|compose|reply|respond|forward)\b/i,

  emailRead:
    /\b(read|open|check|list|show|find|summarize|summarise|summary)\b[\s\S]*\b(email|e-mail|mail|inbox)\b|\b(last email|latest email|recent email|inbox)\b/i,

  calendarWrite:
    /\b(schedule|book|create|add|set up|setup|arrange|organize|organise|move|reschedule|cancel|delete|remove)\b[\s\S]*\b(meeting|calendar event|calendar invite|appointment|reminder)\b/i,

  calendarRead:
    /\b(check|show|list|read|find|do i have|am i free|available|availability)\b[\s\S]*\b(calendar|meeting|event|appointment|schedule)\b|\b(calendar|schedule)\b[\s\S]*\b(check|show|list|free|available|availability)\b/i,

  maps:
    /\b(show|find|locate|pin|point to|navigate to)\b[\s\S]*\b(location|place|address|map)\b|\b(directions to|near me|on the map)\b/i,

  web:
    /\b(search the web|search online|look up online|browse|open the website|open website|open the site|open site|open the page|open page|open the url|visit|go to website|youtube|www\.)\b/i,

  booking:
    /\b(book|reserve|search for|find)\b[\s\S]*\b(hotel|flight|restaurant|rental car|car rental)\b/i,

  crm:
    /\b(create|update|edit|modify|find|show|check|list)\b[\s\S]*\b(account|contact|opportunity|lead|pipeline|crm record|customer record)\b/i,
};

const detectDeterministicIntent = (message) => {
  const text = String(message || "").trim();

  if (!text) {
    return {
      actionable: false,
      intent: "empty",
    };
  }

  for (const [intent, pattern] of Object.entries(
    ACTION_PATTERNS
  )) {
    if (pattern.test(text)) {
      return {
        actionable: true,
        intent,
      };
    }
  }

  return {
    actionable: false,
    intent: "conversation_or_unknown",
  };
};

/* =========================================================
   TOOL SCHEMA HELPERS
   ========================================================= */

const getAvailableToolSchemas = () => {
  const schemas = getToolSchemas();

  return Array.isArray(schemas) ? schemas : [];
};

const getToolName = (schema) =>
  String(
    schema?.name ||
      schema?.function?.name ||
      schema?.tool?.name ||
      ""
  ).trim();

const buildToolSchemaMap = (schemas) => {
  const map = new Map();

  for (const schema of schemas) {
    const name = getToolName(schema);

    if (name) {
      map.set(name, schema);
    }
  }

  return map;
};

const serializeToolSchemas = (schemas) => {
  try {
    return JSON.stringify(schemas, null, 2);
  } catch (error) {
    console.warn(
      "[ATHINA][PLANNER] Could not serialize full tool schemas:",
      error.message
    );

    return schemas
      .map((schema) => {
        const name = getToolName(schema);
        const description =
          schema?.description ||
          schema?.function?.description ||
          "";

        return `- ${name}: ${description}`;
      })
      .join("\n");
  }
};

/* =========================================================
   PLANNER PROMPT
   ========================================================= */

const buildPlannerPrompt = (serializedToolSchemas) =>
  [
    ATHINA_PERSONALITY,
    "",
    "ROLE",
    "You are ATHINA Planner.",
    "Analyze the latest user request together with recent conversation history and relevant memory.",
    "Decide whether the request needs tools or can be answered conversationally.",
    "",
    "OUTPUT FORMAT",
    'Return one valid JSON object using this exact top-level structure:',
    '{',
    '  "requiresPlanning": true or false,',
    '  "goal": "short description of the user goal",',
    '  "reply": "conversational response when no tools are needed",',
    '  "tasks": []',
    '}',
    "",
    "TASK FORMAT",
    'Each task must use this exact structure:',
    '{',
    '  "id": "task_1",',
    '  "description": "clear description of the task",',
    '  "tool": "exact_tool_name",',
    '  "params": {},',
    '  "depends_on": []',
    '}',
    "",
    "CORE PLANNING RULES",
    "- Use only tools that exist in AVAILABLE TOOL SCHEMAS.",
    "- Use only the exact tool names, actions, parameter names, and parameter structures defined by those schemas.",
    "- Never invent a tool, action, parameter, or capability.",
    "- Each task must call exactly one tool.",
    "- Use no more than five tasks.",
    "- Order tasks by dependency.",
    "- Task identifiers must be unique and sequential: task_1, task_2, and so on.",
    "- depends_on may reference only earlier task identifiers.",
    '- Use ${task_X.field} syntax when a later task needs data returned by an earlier task.',
    "- Do not create a tool task for ordinary conversation.",
    "- Do not use an LLM-only task as a substitute for a missing operational tool.",
    "- If the requested action cannot be completed with the available tools, return requiresPlanning false and explain the limitation honestly in reply.",
    "- Never state or imply that an operation succeeded. Execution results are handled later by the execution engine.",
    "",
    "INTENT PRIORITY",
    "- The latest explicit request has priority over stale or unrelated conversation context.",
    "- An email address alone does not mean the user wants a meeting.",
    "- The word send does not mean schedule a meeting.",
    "- A normal email request must use the email tool, not the calendar tool.",
    "- A calendar invitation must use the calendar tool and include attendees when provided.",
    "- An unrelated new request must not continue an old workflow.",
    "",
    "EMAIL RULES",
    "- If the user asks to send, draft, compose, reply to, or forward a normal email, use the email tool.",
    "- Preserve the recipient, subject, and body exactly when the user provides them.",
    "- Do not convert an email recipient into a calendar attendee unless the user explicitly requests a meeting or invitation.",
    "- If the user asks only to draft an email, do not send it unless the tool schema has a draft action and the user requested drafting.",
    "- If the user asks to read or summarize the latest email, first list inbox messages and then read the selected message when required.",
    "- For latest-email workflows, use the first list result as the input to the read task.",
    "",
    "CALENDAR RULES",
    "- Checking availability must never create an event unless the user explicitly requests creation or scheduling.",
    "- For calendar checks and conditional scheduling, use ensure_slot only if that exact action exists in the calendar tool schema.",
    "- For direct scheduling, use create_event only if that exact action exists in the calendar tool schema.",
    "- Include attendee email addresses only when the request explicitly relates to a meeting, calendar invitation, appointment, or event.",
    "- Never use the calendar tool for a normal email request.",
    "",
    "MAP AND BROWSER RULES",
    "- Use the maps tool for physical locations, directions, coordinates, and map pins.",
    "- Use the web or browser tool only when the user explicitly requests current web information or asks to open or visit a website.",
    "- Opening a new browser tab must use the exact supported browser/web tool action from the schema.",
    "- Do not claim a tab was opened unless a supported tool task is planned and later succeeds.",
    "",
    "PLANNING DECISION",
    "requiresPlanning must be true when the request requires a tool or external action.",
    "requiresPlanning should be false for greetings, normal conversation, explanations, or questions answerable without external tools.",
    "",
    "WHEN requiresPlanning IS FALSE",
    "- tasks must be an empty array.",
    "- reply must answer the user directly.",
    "- Keep the reply natural, useful, concise, and human.",
    "- Consider recent history when the message is a follow-up.",
    "",
    "WHEN requiresPlanning IS TRUE",
    "- reply must be an empty string.",
    "- tasks must contain at least one valid executable task.",
    "- Every task must use a real available tool.",
    "",
    "EXAMPLES",
    "",
    "Example: ordinary conversation",
    'User: "Hello"',
    'Output: {"requiresPlanning":false,"goal":"Greet the user","reply":"Hello! How can I help?","tasks":[]}',
    "",
    "Example: normal email",
    'User: "Send an email to example@gmail.com with the subject Project Update and body The work is complete."',
    'Output: {"requiresPlanning":true,"goal":"Send the requested email","reply":"","tasks":[{"id":"task_1","description":"Send the requested project update email","tool":"email","params":{"action":"send","to":"example@gmail.com","subject":"Project Update","body":"The work is complete."},"depends_on":[]}]}',
    "",
    "Example: latest email summary",
    'User: "Summarize my latest email."',
    'Output: {"requiresPlanning":true,"goal":"Read and summarize the latest inbox email","reply":"","tasks":[{"id":"task_1","description":"List the latest inbox email","tool":"email","params":{"action":"list","provider":"google","maxResults":1,"query":"in:inbox"},"depends_on":[]},{"id":"task_2","description":"Read the latest inbox email","tool":"email","params":{"action":"read","provider":"google","messageId":"${task_1.messages.0.id}"},"depends_on":["task_1"]}]}',
    "",
    "Example: calendar meeting",
    'User: "Schedule a meeting with example@gmail.com tomorrow at 10 AM called Project Review."',
    'Output: {"requiresPlanning":true,"goal":"Schedule the Project Review meeting","reply":"","tasks":[{"id":"task_1","description":"Create the Project Review calendar event","tool":"calendar","params":{"action":"create_event","title":"Project Review","start":"tomorrow at 10 AM resolved as ISO date-time","end":"one hour after the start as ISO date-time","attendees":["example@gmail.com"]},"depends_on":[]}]}',
    "",
    "Example: map request",
    'User: "Show Dubai Mall on the map."',
    'Output: {"requiresPlanning":true,"goal":"Locate Dubai Mall","reply":"","tasks":[{"id":"task_1","description":"Find Dubai Mall coordinates","tool":"maps","params":{"query":"Dubai Mall"},"depends_on":[]}]}',
    "",
    "Example: unsupported action",
    'User: "Transfer money from my bank account."',
    'Output: {"requiresPlanning":false,"goal":"Transfer money","reply":"I can’t perform that transaction with the tools currently available.","tasks":[]}',
    "",
    "AVAILABLE TOOL SCHEMAS",
    serializedToolSchemas,
    "",
    "Return only valid JSON. Do not include Markdown, explanations, comments, or code fences.",
  ].join("\n");

/* =========================================================
   RESULT NORMALIZATION
   ========================================================= */

const normalizeBoolean = (value) =>
  value === true ||
  String(value).toLowerCase() === "true";

const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeTask = (task, index) => ({
  id:
    normalizeString(task?.id) ||
    `task_${index + 1}`,

  description:
    normalizeString(task?.description) ||
    `Execute task ${index + 1}`,

  tool: normalizeString(task?.tool),

  params:
    task?.params &&
    typeof task.params === "object" &&
    !Array.isArray(task.params)
      ? task.params
      : {},

  depends_on: Array.isArray(task?.depends_on)
    ? task.depends_on
        .map((dependency) =>
          normalizeString(dependency)
        )
        .filter(Boolean)
    : [],
});

/* =========================================================
   LOCAL PLANNER VALIDATION
   ========================================================= */

const validatePlannerTasks = (
  tasks,
  toolSchemaMap
) => {
  const violations = [];

  if (!Array.isArray(tasks)) {
    return {
      valid: false,
      violations: [
        "Planner tasks must be an array.",
      ],
    };
  }

  if (tasks.length === 0) {
    violations.push(
      "An actionable plan must contain at least one task."
    );
  }

  if (tasks.length > MAX_TASKS) {
    violations.push(
      `The plan exceeds the maximum of ${MAX_TASKS} tasks.`
    );
  }

  const seenIds = new Set();

  tasks.forEach((task, index) => {
    if (!task.id) {
      violations.push(
        `Task ${index + 1} has no identifier.`
      );
    } else if (seenIds.has(task.id)) {
      violations.push(
        `Duplicate task identifier: ${task.id}.`
      );
    }

    if (!task.tool) {
      violations.push(
        `${task.id || `Task ${index + 1}`} has no tool.`
      );
    } else if (!toolSchemaMap.has(task.tool)) {
      violations.push(
        `${task.id || `Task ${index + 1}`} uses unavailable tool "${task.tool}".`
      );
    }

    for (const dependency of task.depends_on) {
      if (!seenIds.has(dependency)) {
        violations.push(
          `${task.id || `Task ${index + 1}`} depends on "${dependency}", but dependencies must reference an earlier task.`
        );
      }
    }

    seenIds.add(task.id);
  });

  return {
    valid: violations.length === 0,
    violations,
  };
};

/* =========================================================
   OPTIONAL INTENT CONSISTENCY CHECKS
   ========================================================= */

const validateIntentToolConsistency = ({
  message,
  tasks,
}) => {
  const violations = [];
  const deterministicIntent =
    detectDeterministicIntent(message);

  const tools = new Set(
    tasks.map((task) => task.tool)
  );

  if (
    deterministicIntent.intent === "emailWrite" ||
    deterministicIntent.intent === "emailRead"
  ) {
    if (!tools.has("email")) {
      violations.push(
        "The user requested an email operation, but the plan does not use the email tool."
      );
    }

    if (
      tools.has("calendar") &&
      !hasExplicitCalendarLanguage(message)
    ) {
      violations.push(
        "The plan incorrectly uses the calendar tool for a normal email request."
      );
    }
  }

  if (
    deterministicIntent.intent ===
      "calendarWrite" ||
    deterministicIntent.intent ===
      "calendarRead"
  ) {
    if (!tools.has("calendar")) {
      violations.push(
        "The user requested a calendar operation, but the plan does not use the calendar tool."
      );
    }
  }

  if (
    deterministicIntent.intent === "maps" &&
    !tools.has("maps")
  ) {
    violations.push(
      "The user requested a map action, but the plan does not use the maps tool."
    );
  }

  return {
    valid: violations.length === 0,
    violations,
  };
};

const hasExplicitCalendarLanguage = (message) =>
  /\b(meeting|calendar|appointment|event|invite)\b/i.test(
    String(message || "")
  );

/* =========================================================
   SAFE PLANNING FAILURE
   ========================================================= */

const buildPlanningFailure = (
  message,
  reason,
  details = []
) => {
  console.warn(
    "[ATHINA][PLANNER] Safe planning failure:",
    {
      message,
      reason,
      details,
    }
  );

  return {
    requiresPlanning: false,
    reply:
      "I understood that you want me to perform an action, but I couldn’t create a safe and valid execution plan. Could you rephrase the request with the exact action and details?",
    goal: message,
    steps: [],
    tasks: [],
    planningFailed: true,
    planningFailureReason: reason,
  };
};

/* =========================================================
   MAIN PLANNER
   ========================================================= */

export const plan = async ({
  message,
  history = [],
  locationNote = "",
  memoryNote = "",
}) => {
  const normalizedMessage = String(
    message || ""
  ).trim();

  if (!normalizedMessage) {
    return {
      requiresPlanning: false,
      reply: "What would you like me to help with?",
      goal: "",
      steps: [],
      tasks: [],
    };
  }

  const toolSchemas = getAvailableToolSchemas();
  const toolSchemaMap =
    buildToolSchemaMap(toolSchemas);

  const serializedToolSchemas =
    serializeToolSchemas(toolSchemas);

  const plannerPrompt = buildPlannerPrompt(
    serializedToolSchemas
  );

  const deterministicIntent =
    detectDeterministicIntent(
      normalizedMessage
    );

  const userContent = [
    memoryNote,
    locationNote,
    `Detected deterministic intent: ${deterministicIntent.intent}`,
    `Latest user request: ${normalizedMessage}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const safeHistory = Array.isArray(history)
    ? history
        .slice(-6)
        .filter(
          (item) =>
            item &&
            typeof item.content === "string" &&
            ["user", "assistant"].includes(
              item.role
            )
        )
        .map((item) => ({
          role: item.role,
          content: item.content,
        }))
    : [];

  const messages = [
    {
      role: "system",
      content: plannerPrompt,
    },
    ...safeHistory,
    {
      role: "user",
      content: userContent,
    },
  ];

  console.log("[ATHINA][PLANNER] Planning:", {
    message: normalizedMessage,
    detectedIntent:
      deterministicIntent.intent,
    availableTools: Array.from(
      toolSchemaMap.keys()
    ),
    historyItems: safeHistory.length,
    hasMemoryNote: Boolean(memoryNote),
    hasLocationNote: Boolean(locationNote),
  });

  let result;

  try {
    result = await callLLM({
      messages,
      temperature: 0.1,
      maxTokens: 1200,
      jsonMode: true,
    });
  } catch (error) {
    console.error(
      "[ATHINA][PLANNER] LLM planning failed:",
      error
    );

    if (deterministicIntent.actionable) {
      return buildPlanningFailure(
        normalizedMessage,
        "planner_llm_error",
        [error.message]
      );
    }

    return {
      requiresPlanning: false,
      reply:
        "I’m having trouble processing that right now. Could you try again?",
      goal: normalizedMessage,
      steps: [],
      tasks: [],
      planningFailed: true,
    };
  }

  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result)
  ) {
    return buildPlanningFailure(
      normalizedMessage,
      "invalid_planner_response",
      [
        "The planner did not return a valid JSON object.",
      ]
    );
  }

  let requiresPlanning =
    normalizeBoolean(result.requiresPlanning);

  let reply = normalizeString(result.reply);

  let goal =
    normalizeString(result.goal) ||
    normalizedMessage;

  let tasks = Array.isArray(result.tasks)
    ? result.tasks
        .slice(0, MAX_TASKS)
        .map(normalizeTask)
    : [];

  /*
   * Deterministic action safeguard:
   * An obvious action request cannot silently become a normal
   * conversational answer.
   */
  if (
    deterministicIntent.actionable &&
    !requiresPlanning
  ) {
    console.warn(
      "[ATHINA][PLANNER] LLM classified an obvious action as conversational.",
      {
        intent: deterministicIntent.intent,
        message: normalizedMessage,
      }
    );

    /*
     * We do not invent a fallback LLM task.
     * If the model failed to create valid executable tasks,
     * the action must fail safely.
     */
    if (tasks.length === 0) {
      return buildPlanningFailure(
        normalizedMessage,
        "action_misclassified_without_tasks",
        [
          `Detected intent: ${deterministicIntent.intent}`,
        ]
      );
    }

    requiresPlanning = true;
    reply = "";
  }

  /*
   * Conversational response normalization.
   */
  if (!requiresPlanning) {
    return {
      requiresPlanning: false,
      reply:
        reply ||
        "I’m here. What would you like help with?",
      goal,
      steps: [],
      tasks: [],
    };
  }

  /*
   * Action plans must have tasks.
   */
  if (tasks.length === 0) {
    return buildPlanningFailure(
      normalizedMessage,
      "action_plan_has_no_tasks"
    );
  }

  /*
   * Validate tool existence, task IDs, and dependencies.
   */
  const taskValidation =
    validatePlannerTasks(
      tasks,
      toolSchemaMap
    );

  if (!taskValidation.valid) {
    return buildPlanningFailure(
      normalizedMessage,
      "invalid_task_structure",
      taskValidation.violations
    );
  }

  /*
   * Validate that the selected tools agree with obvious
   * user intent. This specifically prevents email requests
   * from becoming calendar requests.
   */
  const consistencyValidation =
    validateIntentToolConsistency({
      message: normalizedMessage,
      tasks,
    });

  if (!consistencyValidation.valid) {
    return buildPlanningFailure(
      normalizedMessage,
      "intent_tool_mismatch",
      consistencyValidation.violations
    );
  }

  /*
   * The planner never provides a final success reply for an
   * action. Success must come from real execution results.
   */
  reply = "";

  const planResult = {
    requiresPlanning: true,
    reply,
    goal,
    steps: tasks.map(
      (task) => task.description
    ),
    tasks,
  };

  console.log(
    "[ATHINA][PLANNER] Valid action plan:",
    {
      goal: planResult.goal,
      tasks: planResult.tasks.map(
        (task) => ({
          id: task.id,
          tool: task.tool,
          description: task.description,
          depends_on: task.depends_on,
        })
      ),
    }
  );

  return planResult;
};
