import * as webSearchTool from "./webSearchTool.js";
import * as mapsTool from "./mapsTool.js";
import * as llmTool from "./llmTool.js";
import * as emailTool from "./emailTool.js";
import * as calendarTool from "./calendarTool.js";
import * as bookingTool from "./bookingTool.js";
import * as trafficTool from "./trafficTool.js";

/* =========================================================
   TOOL REGISTRY
   ========================================================= */

export const toolRegistry = Object.freeze({
  web_search: webSearchTool,
  maps: mapsTool,
  llm: llmTool,
  email: emailTool,
  calendar: calendarTool,
  booking: bookingTool,
  traffic: trafficTool,
});

/* =========================================================
   ACTION POLICIES

   Policy principles:

   read:
   - Retrieves information without changing external data.
   - May be retried where safe.

   reasoning:
   - Uses the LLM for reasoning or transformation only.
   - Does not perform an external operational action.

   write:
   - Changes data or communicates externally.
   - Executes immediately when explicitly requested.
   - Must not be blindly retried.

   high:
   - Destructive, irreversible, or financially sensitive.
   - Still requires approval.
   ========================================================= */

const TOOL_ACTION_POLICIES = Object.freeze({
  web_search: {
    default: {
      risk: "read",
      requiresApproval: false,
      retryable: true,
    },
  },

  maps: {
    default: {
      risk: "read",
      requiresApproval: false,
      retryable: true,
    },
  },

  traffic: {
    default: {
      risk: "read",
      requiresApproval: false,
      retryable: true,
    },

    route: {
      risk: "read",
      requiresApproval: false,
      retryable: true,
    },
  },

  llm: {
    default: {
      risk: "reasoning",
      requiresApproval: false,
      retryable: true,
    },
  },

  email: {
    list: {
      risk: "read",
      requiresApproval: false,
      retryable: true,
    },

    read: {
      risk: "read",
      requiresApproval: false,
      retryable: true,
    },

    draft: {
      risk: "write",
      requiresApproval: false,
      retryable: false,
    },

    send: {
      risk: "write",
      requiresApproval: false,
      retryable: false,
    },

    reply: {
      risk: "write",
      requiresApproval: false,
      retryable: false,
    },

    forward: {
      risk: "write",
      requiresApproval: false,
      retryable: false,
    },
  },

  calendar: {
    check_availability: {
      risk: "read",
      requiresApproval: false,
      retryable: true,
    },

    list_events: {
      risk: "read",
      requiresApproval: false,
      retryable: true,
    },

    create_event: {
      risk: "write",
      requiresApproval: false,
      retryable: false,
    },

    ensure_slot: {
      risk: "write",
      requiresApproval: false,
      retryable: false,
    },

    update_event: {
      risk: "write",
      requiresApproval: false,
      retryable: false,
    },

    /*
     * Deletion remains protected because it is destructive.
     */
    delete_event: {
      risk: "high",
      requiresApproval: true,
      retryable: false,
    },
  },

  booking: {
    search: {
      risk: "read",
      requiresApproval: false,
      retryable: true,
    },

    list: {
      risk: "read",
      requiresApproval: false,
      retryable: true,
    },

    /*
     * Reservations may create commercial or financial
     * commitments, so approval remains required.
     */
    reserve: {
      risk: "high",
      requiresApproval: true,
      retryable: false,
    },

    book: {
      risk: "high",
      requiresApproval: true,
      retryable: false,
    },

    cancel: {
      risk: "high",
      requiresApproval: true,
      retryable: false,
    },
  },
});

/* =========================================================
   GENERAL HELPERS
   ========================================================= */

const normalizeToolName = (name) =>
  String(name || "")
    .trim()
    .toLowerCase();

const normalizeAction = (params) =>
  String(params?.action || "default")
    .trim()
    .toLowerCase();

const isPlainObject = (value) =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value);

const getToolDescription = (tool) =>
  tool?.schema?.description ||
  tool?.description ||
  "";

const getToolPolicy = (
  toolName,
  action
) => {
  const toolPolicies =
    TOOL_ACTION_POLICIES[toolName] || {};

  return (
    toolPolicies[action] ||
    toolPolicies.default || {
      risk: "unknown",
      requiresApproval: false,
      retryable: false,
    }
  );
};

/* =========================================================
   TOOL LOOKUP AND SCHEMAS
   ========================================================= */

export const getTool = (name) => {
  const normalizedName =
    normalizeToolName(name);

  return (
    toolRegistry[normalizedName] ||
    null
  );
};

/**
 * Returns full tool schemas for the planner.
 *
 * The action policies are included so the planner and other
 * governance components can understand the risk and execution
 * behavior of every action.
 */
export const getToolSchemas = () =>
  Object.entries(toolRegistry).map(
    ([name, tool]) => {
      const schema = isPlainObject(
        tool.schema
      )
        ? tool.schema
        : {};

      return {
        name,
        description:
          schema.description ||
          getToolDescription(tool),
        ...schema,
        actionPolicies:
          TOOL_ACTION_POLICIES[name] ||
          {},
      };
    }
  );

/* =========================================================
   ACTION VALIDATION
   ========================================================= */

/**
 * Supports common tool-schema structures.
 *
 * Examples:
 *
 * schema.actions = ["send", "read"]
 *
 * schema.actions = {
 *   send: {...},
 *   read: {...}
 * }
 *
 * schema.parameters.properties.action.enum
 */
const getDeclaredActions = (tool) => {
  const schema = tool?.schema;

  if (!isPlainObject(schema)) {
    return [];
  }

  if (Array.isArray(schema.actions)) {
    return schema.actions
      .map((action) =>
        typeof action === "string"
          ? action
          : action?.name
      )
      .filter(Boolean)
      .map((action) =>
        String(action)
          .trim()
          .toLowerCase()
      );
  }

  if (isPlainObject(schema.actions)) {
    return Object.keys(
      schema.actions
    ).map((action) =>
      action.trim().toLowerCase()
    );
  }

  const actionEnum =
    schema?.parameters?.properties
      ?.action?.enum ||
    schema?.inputSchema?.properties
      ?.action?.enum ||
    schema?.input_schema?.properties
      ?.action?.enum;

  return Array.isArray(actionEnum)
    ? actionEnum.map((action) =>
        String(action)
          .trim()
          .toLowerCase()
      )
    : [];
};

const validateAction = (
  toolName,
  tool,
  params
) => {
  const action =
    normalizeAction(params);

  const declaredActions =
    getDeclaredActions(tool);

  /*
   * A tool without declared actions may use a simple
   * non-action-based interface.
   */
  if (
    declaredActions.length === 0 ||
    action === "default"
  ) {
    return {
      valid: true,
      action,
      violations: [],
    };
  }

  if (
    !declaredActions.includes(action)
  ) {
    return {
      valid: false,
      action,
      violations: [
        `Tool "${toolName}" does not support action "${action}".`,
        `Supported actions: ${declaredActions.join(", ")}.`,
      ],
    };
  }

  return {
    valid: true,
    action,
    violations: [],
  };
};

/* =========================================================
   APPROVAL VALIDATION

   Explicit commands can immediately execute ordinary writes
   such as email.send and calendar.create_event because their
   policies use requiresApproval: false.

   Higher-risk actions remain protected.
   ========================================================= */

const validateApproval = ({
  toolName,
  action,
  context,
}) => {
  const policy = getToolPolicy(
    toolName,
    action
  );

  if (!policy.requiresApproval) {
    return {
      approved: true,
      policy,
      reason: null,
    };
  }

  /*
   * Approval must come from trusted server-controlled context.
   * Planner-generated parameters must never grant approval.
   */
  const approved =
    context?.approved === true ||
    context?.approval?.approved ===
      true;

  if (!approved) {
    return {
      approved: false,
      policy,
      reason:
        `The action "${toolName}.${action}" requires approval before execution.`,
    };
  }

  return {
    approved: true,
    policy,
    reason: null,
  };
};

/* =========================================================
   RESULT NORMALIZATION
   ========================================================= */

const normalizeToolResult = ({
  toolName,
  action,
  rawResult,
  startedAt,
  policy,
}) => {
  const durationMs =
    Date.now() - startedAt;

  if (!isPlainObject(rawResult)) {
    return {
      success: false,
      type: "invalid_tool_result",
      tool: toolName,
      action,
      risk: policy.risk,
      retryable: policy.retryable,
      error:
        "The tool returned an invalid result. A result object was expected.",
      rawResult,
      durationMs,
      timestamp:
        new Date().toISOString(),
    };
  }

  /*
   * A tool must explicitly return success: true.
   *
   * An object without a success property must not be treated
   * as successful execution.
   */
  return {
    ...rawResult,

    success:
      rawResult.success === true,

    tool:
      rawResult.tool || toolName,

    action:
      rawResult.action || action,

    risk:
      rawResult.risk ||
      policy.risk,

    retryable:
      typeof rawResult.retryable ===
      "boolean"
        ? rawResult.retryable
        : policy.retryable,

    durationMs:
      rawResult.durationMs ||
      durationMs,

    timestamp:
      rawResult.timestamp ||
      new Date().toISOString(),
  };
};

const createToolFailure = ({
  toolName,
  action = "default",
  code,
  error,
  details = null,
  startedAt = Date.now(),
  policy = {
    risk: "unknown",
    retryable: false,
  },
}) => ({
  success: false,
  type: "tool_failure",
  tool: toolName,
  action,
  code,
  error,
  details,
  risk: policy.risk,
  retryable: policy.retryable,
  durationMs:
    Date.now() - startedAt,
  timestamp:
    new Date().toISOString(),
});

/* =========================================================
   TOOL EXECUTION
   ========================================================= */

export const executeTool = async (
  name,
  params,
  context = {}
) => {
  const startedAt = Date.now();

  const toolName =
    normalizeToolName(name);

  const tool = getTool(toolName);

  if (!tool) {
    return createToolFailure({
      toolName,
      code: "UNKNOWN_TOOL",
      error: `Unknown tool: ${toolName}`,
      startedAt,
    });
  }

  if (
    typeof tool.execute !==
    "function"
  ) {
    return createToolFailure({
      toolName,
      code:
        "TOOL_NOT_EXECUTABLE",
      error:
        `Tool "${toolName}" does not export a valid execute function.`,
      startedAt,
    });
  }

  if (
    params !== undefined &&
    !isPlainObject(params)
  ) {
    return createToolFailure({
      toolName,
      code:
        "INVALID_TOOL_PARAMS",
      error:
        `Tool "${toolName}" parameters must be an object.`,
      details: {
        receivedType:
          Array.isArray(params)
            ? "array"
            : typeof params,
      },
      startedAt,
    });
  }

  if (!isPlainObject(context)) {
    return createToolFailure({
      toolName,
      code:
        "INVALID_TOOL_CONTEXT",
      error:
        "Tool execution context must be an object.",
      startedAt,
    });
  }

  const safeParams = {
    ...(params || {}),
  };

  const actionValidation =
    validateAction(
      toolName,
      tool,
      safeParams
    );

  if (!actionValidation.valid) {
    return createToolFailure({
      toolName,
      action:
        actionValidation.action,
      code:
        "UNSUPPORTED_TOOL_ACTION",
      error:
        actionValidation
          .violations[0],
      details:
        actionValidation.violations,
      startedAt,
    });
  }

  const action =
    actionValidation.action;

  const approvalValidation =
    validateApproval({
      toolName,
      action,
      context,
    });

  if (!approvalValidation.approved) {
    console.warn(
      "[ATHINA][TOOLS] Approval required:",
      {
        tool: toolName,
        action,
        sessionId:
          context.sessionId ||
          null,
        userId:
          context.userId ||
          null,
        taskId:
          context.taskId ||
          null,
      }
    );

    return createToolFailure({
      toolName,
      action,
      code: "APPROVAL_REQUIRED",
      error:
        approvalValidation.reason,
      details: {
        requiresApproval: true,
        risk:
          approvalValidation.policy
            .risk,
      },
      startedAt,
      policy:
        approvalValidation.policy,
    });
  }

  /*
   * Trusted server context comes after planner-generated
   * parameters. This prevents the planner from overriding:
   *
   * - sessionId
   * - userId
   * - taskId
   * - approval data
   * - authorization data
   */
  const executionInput = {
    ...safeParams,
    ...context,
  };

  console.log(
    "[ATHINA][TOOLS] Executing:",
    {
      tool: toolName,
      action,
      risk:
        approvalValidation.policy
          .risk,
      retryable:
        approvalValidation.policy
          .retryable,
      sessionId:
        context.sessionId || null,
      userId:
        context.userId || null,
      taskId:
        context.taskId || null,

      /*
       * Log parameter names only.
       *
       * Avoid placing email bodies, credentials, tokens,
       * customer data, or other sensitive values in logs.
       */
      parameterKeys:
        Object.keys(safeParams),
    }
  );

  try {
    const rawResult =
      await tool.execute(
        executionInput
      );

    const result =
      normalizeToolResult({
        toolName,
        action,
        rawResult,
        startedAt,
        policy:
          approvalValidation.policy,
      });

    console.log(
      "[ATHINA][TOOLS] Completed:",
      {
        tool: toolName,
        action,
        success: result.success,
        durationMs:
          result.durationMs,
        error:
          result.success
            ? null
            : result.error || null,
      }
    );

    return result;
  } catch (error) {
    console.error(
      "[ATHINA][TOOLS] Execution exception:",
      {
        tool: toolName,
        action,
        sessionId:
          context.sessionId ||
          null,
        userId:
          context.userId || null,
        taskId:
          context.taskId || null,
        error:
          error?.message ||
          "Unknown tool exception",
      }
    );

    return createToolFailure({
      toolName,
      action,
      code:
        "TOOL_EXECUTION_EXCEPTION",
      error:
        error?.message ||
        `Tool "${toolName}" failed unexpectedly.`,
      details:
        process.env.NODE_ENV ===
        "development"
          ? {
              stack:
                error?.stack ||
                null,
            }
          : null,
      startedAt,
      policy:
        approvalValidation.policy,
    });
  }
};

/* =========================================================
   POLICY EXPORTS

   These can be consumed by the rule manager, orchestrator,
   execution engine, or a future observability dashboard.
   ========================================================= */

export const getToolActionPolicy = (
  toolName,
  action = "default"
) =>
  getToolPolicy(
    normalizeToolName(toolName),
    String(action || "default")
      .trim()
      .toLowerCase()
  );

export const actionRequiresApproval = (
  toolName,
  action = "default"
) =>
  getToolActionPolicy(
    toolName,
    action
  ).requiresApproval === true;

export const isToolActionRetryable = (
  toolName,
  action = "default"
) =>
  getToolActionPolicy(
    toolName,
    action
  ).retryable === true;
