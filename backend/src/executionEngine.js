import { executeTool } from "./tools/index.js";

/* =========================================================
   CONFIGURATION
   ========================================================= */

const TASK_REFERENCE_PATTERN =
  /\$\{([A-Za-z0-9_-]+)((?:\.[A-Za-z0-9_-]+|\[\d+\])*)\}/g;

const EXACT_TASK_REFERENCE_PATTERN =
  /^\$\{([A-Za-z0-9_-]+)((?:\.[A-Za-z0-9_-]+|\[\d+\])*)\}$/;

const MAX_EXECUTION_TASKS = 10;

/* =========================================================
   PATH AND REFERENCE HELPERS
   ========================================================= */

/**
 * Converts paths such as:
 *
 * .messages.0.id
 * .messages[0].id
 *
 * into:
 *
 * ["messages", "0", "id"]
 */
const parseReferencePath = (rawPath = "") =>
  String(rawPath)
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);

/**
 * Safely retrieves a nested property.
 */
const getValueByPath = (source, pathParts) => {
  let current = source;

  for (const part of pathParts) {
    if (
      current === null ||
      current === undefined
    ) {
      return undefined;
    }

    current = current[part];
  }

  return current;
};

/**
 * Resolves one task reference against earlier results.
 */
const resolveTaskReference = (
  taskId,
  rawPath,
  results
) => {
  const taskResult = results[taskId];

  if (taskResult === undefined) {
    return {
      resolved: false,
      reason: `No result exists for task "${taskId}".`,
      value: undefined,
    };
  }

  const pathParts =
    parseReferencePath(rawPath);

  const value =
    pathParts.length === 0
      ? taskResult
      : getValueByPath(
          taskResult,
          pathParts
        );

  if (
    value === undefined ||
    value === null
  ) {
    return {
      resolved: false,
      reason:
        `Task "${taskId}" does not contain ` +
        `the referenced path "${rawPath || "."}".`,
      value: undefined,
    };
  }

  return {
    resolved: true,
    reason: null,
    value,
  };
};

/* =========================================================
   RECURSIVE PARAMETER RESOLUTION
   ========================================================= */

/**
 * Resolves a string containing task references.
 *
 * If the complete string is one reference, the original value
 * type is preserved. For example, an array remains an array.
 *
 * If a reference appears inside a larger string, objects and
 * arrays are serialized into JSON.
 */
const resolveStringValue = (
  value,
  results,
  unresolved
) => {
  const exactMatch = String(value).match(
    EXACT_TASK_REFERENCE_PATTERN
  );

  if (exactMatch) {
    const [, taskId, rawPath] =
      exactMatch;

    const resolution =
      resolveTaskReference(
        taskId,
        rawPath,
        results
      );

    if (!resolution.resolved) {
      unresolved.push({
        reference: value,
        reason: resolution.reason,
      });

      return value;
    }

    return resolution.value;
  }

  return String(value).replace(
    TASK_REFERENCE_PATTERN,
    (match, taskId, rawPath) => {
      const resolution =
        resolveTaskReference(
          taskId,
          rawPath,
          results
        );

      if (!resolution.resolved) {
        unresolved.push({
          reference: match,
          reason: resolution.reason,
        });

        return match;
      }

      if (
        typeof resolution.value ===
        "string"
      ) {
        return resolution.value;
      }

      return JSON.stringify(
        resolution.value
      );
    }
  );
};

/**
 * Recursively resolves:
 *
 * - strings
 * - arrays
 * - nested objects
 */
const resolveValue = (
  value,
  results,
  unresolved
) => {
  if (typeof value === "string") {
    return resolveStringValue(
      value,
      results,
      unresolved
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      resolveValue(
        item,
        results,
        unresolved
      )
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const resolvedObject = {};

    for (const [key, nestedValue] of Object.entries(
      value
    )) {
      resolvedObject[key] =
        resolveValue(
          nestedValue,
          results,
          unresolved
        );
    }

    return resolvedObject;
  }

  return value;
};

const resolveParams = (
  params,
  results
) => {
  const unresolved = [];

  const resolved = resolveValue(
    params || {},
    results,
    unresolved
  );

  return {
    resolved,
    unresolved,
  };
};

/* =========================================================
   DEPENDENCY VALIDATION
   ========================================================= */

const validateTaskDependencies = (
  task,
  completedTaskIds,
  taskStatus
) => {
  const dependencies = Array.isArray(
    task.depends_on
  )
    ? task.depends_on
    : [];

  const missing = dependencies.filter(
    (dependencyId) =>
      !completedTaskIds.has(
        dependencyId
      )
  );

  if (missing.length > 0) {
    return {
      valid: false,
      reason:
        "The following dependencies have not executed: " +
        missing.join(", "),
    };
  }

  const failed = dependencies.filter(
    (dependencyId) =>
      taskStatus[dependencyId] !==
      "success"
  );

  if (failed.length > 0) {
    return {
      valid: false,
      reason:
        "The following dependencies did not succeed: " +
        failed.join(", "),
    };
  }

  return {
    valid: true,
    reason: null,
  };
};

/* =========================================================
   RESULT HELPERS
   ========================================================= */

const createFailureResult = ({
  task,
  code,
  error,
  details = null,
  durationMs = 0,
}) => ({
  success: false,
  type: "task_failure",
  taskId: task.id,
  tool: task.tool,
  code,
  error,
  details,
  durationMs,
  timestamp: new Date().toISOString(),
});

const createSkippedResult = ({
  task,
  reason,
}) => ({
  success: false,
  skipped: true,
  type: "task_skipped",
  taskId: task.id,
  tool: task.tool,
  code: "DEPENDENCY_FAILURE",
  error: reason,
  timestamp: new Date().toISOString(),
});

const normalizeToolResult = (
  task,
  result,
  durationMs
) => {
  if (
    result &&
    typeof result === "object"
  ) {
    return {
      ...result,
      success:
        result.success === true,
      taskId:
        result.taskId || task.id,
      tool:
        result.tool || task.tool,
      durationMs,
      timestamp:
        result.timestamp ||
        new Date().toISOString(),
    };
  }

  return {
    success: false,
    type: "invalid_tool_result",
    taskId: task.id,
    tool: task.tool,
    code: "INVALID_TOOL_RESULT",
    error:
      "The tool did not return a valid result object.",
    rawResult: result,
    durationMs,
    timestamp: new Date().toISOString(),
  };
};

/* =========================================================
   RESULT PERSISTENCE
   ========================================================= */

const persistTaskResult = async ({
  saveTaskResult,
  sessionId,
  task,
  result,
}) => {
  if (
    typeof saveTaskResult !==
      "function" ||
    !sessionId
  ) {
    return;
  }

  try {
    await saveTaskResult(
      sessionId,
      task.id,
      task.tool,
      result
    );
  } catch (error) {
    console.error(
      "[ATHINA][EXECUTION] Failed to save task result:",
      {
        taskId: task.id,
        tool: task.tool,
        error: error.message,
      }
    );
  }
};

/* =========================================================
   MAIN EXECUTION ENGINE
   ========================================================= */

export const execute = async (
  tasks,
  {
    saveTaskResult,
    sessionId,
    userId = null,
  }
) => {
  if (!Array.isArray(tasks)) {
    throw new TypeError(
      "Execution tasks must be an array."
    );
  }

  if (
    tasks.length >
    MAX_EXECUTION_TASKS
  ) {
    throw new Error(
      `Execution plan exceeds the maximum of ${MAX_EXECUTION_TASKS} tasks.`
    );
  }

  const results = {};
  const executed = [];
  const taskStatus = {};
  const completedTaskIds =
    new Set();

  for (const task of tasks) {
    const taskStartedAt = Date.now();

    console.log(
      "[ATHINA][EXECUTION] Starting task:",
      {
        sessionId,
        userId,
        taskId: task.id,
        tool: task.tool,
        description:
          task.description,
        dependsOn:
          task.depends_on || [],
      }
    );

    /* -------------------------------------------------------
       1. BASIC TASK VALIDATION
       ------------------------------------------------------- */

    if (!task?.id || !task?.tool) {
      const result =
        createFailureResult({
          task: task || {
            id: "unknown",
            tool: "unknown",
          },
          code: "INVALID_TASK",
          error:
            "Task requires both an id and a tool.",
          durationMs:
            Date.now() -
            taskStartedAt,
        });

      results[task?.id || "unknown"] =
        result;

      executed.push({
        ...task,
        result,
      });

      taskStatus[
        task?.id || "unknown"
      ] = "failed";

      await persistTaskResult({
        saveTaskResult,
        sessionId,
        task:
          task || {
            id: "unknown",
            tool: "unknown",
          },
        result,
      });

      continue;
    }

    /* -------------------------------------------------------
       2. DEPENDENCY ENFORCEMENT
       ------------------------------------------------------- */

    const dependencyValidation =
      validateTaskDependencies(
        task,
        completedTaskIds,
        taskStatus
      );

    if (
      !dependencyValidation.valid
    ) {
      const result =
        createSkippedResult({
          task,
          reason:
            dependencyValidation.reason,
        });

      results[task.id] = result;
      taskStatus[task.id] =
        "skipped";
      completedTaskIds.add(
        task.id
      );

      executed.push({
        ...task,
        params: task.params || {},
        result,
      });

      await persistTaskResult({
        saveTaskResult,
        sessionId,
        task,
        result,
      });

      console.warn(
        "[ATHINA][EXECUTION] Task skipped:",
        {
          taskId: task.id,
          reason:
            dependencyValidation.reason,
        }
      );

      continue;
    }

    /* -------------------------------------------------------
       3. PARAMETER RESOLUTION
       ------------------------------------------------------- */

    const {
      resolved: resolvedParams,
      unresolved,
    } = resolveParams(
      task.params || {},
      results
    );

    if (unresolved.length > 0) {
      const result =
        createFailureResult({
          task,
          code:
            "UNRESOLVED_REFERENCE",
          error:
            "One or more task-result references could not be resolved.",
          details: unresolved,
          durationMs:
            Date.now() -
            taskStartedAt,
        });

      results[task.id] = result;
      taskStatus[task.id] =
        "failed";
      completedTaskIds.add(
        task.id
      );

      executed.push({
        ...task,
        params: resolvedParams,
        result,
      });

      await persistTaskResult({
        saveTaskResult,
        sessionId,
        task,
        result,
      });

      console.error(
        "[ATHINA][EXECUTION] Unresolved task references:",
        {
          taskId: task.id,
          unresolved,
        }
      );

      continue;
    }

    /* -------------------------------------------------------
       4. TOOL EXECUTION
       ------------------------------------------------------- */

    let normalizedResult;

    try {
      const rawResult =
        await executeTool(
          task.tool,
          resolvedParams,
          {
            sessionId,
            userId,
            taskId: task.id,
          }
        );

      normalizedResult =
        normalizeToolResult(
          task,
          rawResult,
          Date.now() -
            taskStartedAt
        );
    } catch (error) {
      normalizedResult =
        createFailureResult({
          task,
          code:
            "TOOL_EXECUTION_ERROR",
          error:
            error?.message ||
            "The tool execution failed.",
          details:
            process.env.NODE_ENV ===
            "development"
              ? {
                  stack:
                    error?.stack ||
                    null,
                }
              : null,
          durationMs:
            Date.now() -
            taskStartedAt,
        });
    }

    /* -------------------------------------------------------
       5. RECORD RESULT
       ------------------------------------------------------- */

    results[task.id] =
      normalizedResult;

    taskStatus[task.id] =
      normalizedResult.success
        ? "success"
        : "failed";

    completedTaskIds.add(task.id);

    const executedTask = {
      ...task,
      params: resolvedParams,
      result: normalizedResult,
    };

    executed.push(executedTask);

    await persistTaskResult({
      saveTaskResult,
      sessionId,
      task,
      result: normalizedResult,
    });

    console.log(
      "[ATHINA][EXECUTION] Task completed:",
      {
        taskId: task.id,
        tool: task.tool,
        success:
          normalizedResult.success,
        durationMs:
          normalizedResult.durationMs,
        error:
          normalizedResult.success
            ? null
            : normalizedResult.error,
      }
    );
  }

  const successfulTasks =
    executed.filter(
      (task) =>
        task.result?.success === true
    ).length;

  const failedTasks =
    executed.filter(
      (task) =>
        task.result?.success ===
          false &&
        !task.result?.skipped
    ).length;

  const skippedTasks =
    executed.filter(
      (task) =>
        task.result?.skipped ===
        true
    ).length;

  const summary = {
    totalTasks: executed.length,
    successfulTasks,
    failedTasks,
    skippedTasks,
    success:
      executed.length > 0 &&
      failedTasks === 0 &&
      skippedTasks === 0,
  };

  console.log(
    "[ATHINA][EXECUTION] Plan completed:",
    {
      sessionId,
      ...summary,
    }
  );

  return {
    results,
    executed,
    summary,
  };
};
