import { callLLM } from "./utils/llmClient.js";

const ATHINA_SYSTEM_PROMPT = [
  "You are ATHINA (Autonomous Thinking Human-like Intelligent Network Assistant).",
  "",
  "You are the primary AI Operating System for your user.",
  "",
  "Your purpose is not merely to answer questions. Your purpose is to understand goals, reason about them, plan intelligently, execute safely through available tools, continuously monitor progress, learn from previous interactions, and help the user achieve real-world outcomes.",
  "",
  "You are calm, intelligent, confident, proactive, trustworthy, and highly capable.",
  "",
  "You communicate naturally like an experienced human consultant.",
  "",
  "Never sound robotic. Never mention being an AI unless directly asked.",
  "",
  "Never use phrases such as: 'As an AI...', 'I am just a language model...', 'I cannot because I am AI...'",
  "",
  "Speak naturally. Be concise. Be useful. Be honest.",
  "",
  "If uncertain, say so clearly. Never invent facts. Always prioritize accuracy over confidence.",
  "",
  "You speak like a highly experienced executive assistant combined with an elite technical consultant. Your responses should feel effortless. Never overwhelm the user. Prefer clarity over complexity.",
].join("\n");

const summarizeExecution = (executed = []) => {
  const summary = {
    total: executed.length,
    success: 0,
    failed: 0,
    skipped: 0,
  };

  for (const task of executed) {
    const result = task?.result || {};
    if (result.skipped) {
      summary.skipped += 1;
    } else if (result.success) {
      summary.success += 1;
    } else {
      summary.failed += 1;
    }
  }

  return summary;
};

const extractEmailAddressFromHeader = (header = "") => {
  const match = String(header).match(/<([^>]+)>/);
  return match ? match[1] : String(header || "").trim();
};

const buildDeterministicExecutionReply = (executed = []) => {
  const missingInfoFailure = executed.find(
    (task) =>
      task?.result?.success === false &&
      Array.isArray(task?.result?.missingFields) &&
      task.result.missingFields.length > 0
  );

  if (missingInfoFailure) {
    const result = missingInfoFailure.result;
    const fields = result.missingFields.join(", ");
    if (result.type === "calendar") {
      return `I can do that, but I still need: ${fields}. Please share those details and I’ll complete it immediately.`;
    }
    if (result.type === "email") {
      return `I’m ready to send it, but I still need: ${fields}.`;
    }
    return `I need a few more details before I can continue: ${fields}.`;
  }

  // Only short-circuit to the canned sender/subject reply when the email
  // read was the final step of the plan (a literal "check my last email"
  // request). If a downstream task (e.g. an llm extraction step) ran
  // afterwards, its output must drive the reply instead.
  const lastTask = executed[executed.length - 1];
  const hasDownstreamProcessing = executed.some(
    (task) => task?.result?.type === "llm" && task?.result?.success === true
  );

  const successfulEmailRead =
    !hasDownstreamProcessing &&
    lastTask?.result?.success === true &&
    lastTask?.result?.type === "email" &&
    String(lastTask?.result?.action || "").toLowerCase() === "read" &&
    lastTask?.result?.message
      ? lastTask
      : null;

  if (successfulEmailRead) {
    const message = successfulEmailRead.result.message || {};
    const from = extractEmailAddressFromHeader(message.from || "unknown sender");
    const subject = String(message.subject || "(no subject)").trim();
    return `Your latest email is from ${from}. Subject: ${subject}.`;
  }

  const successfulEmailList =
    !hasDownstreamProcessing &&
    lastTask?.result?.success === true &&
    lastTask?.result?.type === "email" &&
    String(lastTask?.result?.action || "").toLowerCase() === "list"
      ? lastTask
      : null;

  if (successfulEmailList) {
    const count = Number(successfulEmailList.result.count || 0);
    if (count === 0) return "Your inbox appears empty right now.";
    return `I checked your inbox and found ${count} recent email${count === 1 ? "" : "s"}.`;
  }

  return null;
};

const normalizeMessage = (message) =>
  String(message || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const QUICK_REPLIES = [
  {
    patterns: [/^(hi|hello|hey|hiya|good morning|good afternoon|good evening)$/i, /^(hi|hello|hey) athina$/i],
    reply: "Hello. How can I help?",
  },
  {
    patterns: [/^how are you$/i, /^how are you doing$/i, /^how's it going$/i],
    reply: "I'm ready and working well. How can I help?",
  },
  {
    patterns: [/^(ok|okay|alright|sure|yes|yep|yeah|noted|got it|roger|cool|fine)$/i],
    reply: "Noted.",
  },
  {
    patterns: [/^(thanks|thank you|thx|ty)$/i, /^(thanks|thank you|thx|ty) athina$/i],
    reply: "You're welcome.",
  },
  {
    patterns: [/^(good night|night)$/i],
    reply: "Good night.",
  },
  {
    patterns: [/^(what can you do|help|what do you do)$/i],
    reply: "I can be your personal assistant, schedule meetings, send & read emails, answer questions, search the web, locate places, and handle supported actions.",
  },
];

export const getQuickReply = (message) => {
  const normalized = normalizeMessage(message);
  if (!normalized) return null;

  for (const entry of QUICK_REPLIES) {
    if (entry.patterns.some((pattern) => pattern.test(normalized))) {
      return { reply: entry.reply, key: normalized };
    }
  }

  return null;
};

export const buildCompactExecutionReply = async (executed) => {
  if (!Array.isArray(executed) || executed.length === 0) {
    return "I'm here. How can I help?";
  }

  const deterministicReply = buildDeterministicExecutionReply(executed);
  if (deterministicReply) {
    return deterministicReply;
  }

  const execution = summarizeExecution(executed);

  const resultsSummary = executed.map((task) => {
    const result = task.result || {};
    if (!result.success) {
      return '- Task "' + (task.description || task.id) + '": Failed - ' + (result.error || "unknown error");
    }
    if (result.type === "locate") {
      return "- Found location: " + (result.name || result.query || "unknown") + " at " + result.lat + ", " + result.lng;
    }
    if (result.type === "web_search") {
      const urls = (result.results || []).map((r) => r.url).join(", ");
      return '- Searched web for "' + result.query + '". Found URLs: ' + urls;
    }
    
    if (result.type === "calendar") {

  const action =
    String(result.action || "")
      .toLowerCase();

  if (action === "list_events") {

    const count =
      Number(result.count || 0);

    if (count === 0) {
      return "- Calendar query completed. No events found.";
    }

    const events =
      (result.events || [])
        .slice(0, 10)
        .map(event =>
          `${event.title || "Untitled"} (${event.start || "unknown time"})`
        )
        .join("; ");

    return `- Listed ${count} calendar event(s): ${events}`;
  }

  if (action === "check_availability") {
    return result.isFree
      ? "- Calendar availability check completed. The requested time slot is free."
      : "- Calendar availability check completed. The requested time slot contains conflicts.";
  }

  if (
    action === "create_event" ||
    action === "ensure_slot"
  ) {
    return "- Created calendar event: " +
           (result.title || task.description);
  }

  if (action === "update_event") {
    return "- Updated calendar event: " +
           (result.title || task.description);
  }

  if (action === "move_event") {
    return "- Rescheduled calendar event: " +
           (result.title || task.description);
  }

  if (action === "delete_event") {
    return "- Deleted calendar event successfully.";
  }

  return "- Completed calendar action: " +
         action;
    }
    
    if (result.type === "email") {
      const action = String(result.action || "").toLowerCase();
      if (action === "send") {
        return "- Sent email to " + (result.to || "the provided recipient");
      }
      if (action === "read") {
        const from = extractEmailAddressFromHeader(result.message?.from || "unknown sender");
        const subject = String(result.message?.subject || "(no subject)").trim();
        return `- Read email from ${from}. Subject: ${subject}.`;
      }
      if (action === "list") {
        return "- Listed inbox emails. Count: " + Number(result.count || 0);
      }
      return "- Completed email action: " + (result.action || "unknown");
    }
    if (result.type === "booking") {
      return "- Checked booking options for " + (result.query || task.description);
    }
    if (result.type === "llm") {
      return "- LLM response: " + result.response;
    }
    return "- Completed: " + (task.description || task.id);
  }).join("\n");

  const messages = [
    {
      role: "system",
      content:
        ATHINA_SYSTEM_PROMPT +
        "\n\nBased on execution results, reply in 2-4 short sentences. " +
        "If tasks are partially failed, clearly say what succeeded and what still needs user input or retry. " +
        "Do not output markdown bullets. Do not mention internal task IDs.",
    },
    {
      role: "user",
      content:
        "Execution summary:\n" +
        `- Total tasks: ${execution.total}\n` +
        `- Successful: ${execution.success}\n` +
        `- Failed: ${execution.failed}\n` +
        `- Skipped: ${execution.skipped}\n\n` +
        "Execution details:\n" +
        resultsSummary,
    }
  ];

  try {
    const reply = await callLLM({ messages, temperature: 0.2, maxTokens: 320 });
    return reply;
  } catch (error) {
    console.warn("[ATHINA] LLM reply generation failed, using fallback:", error.message);
    return executed.map((task) => {
      const result = task.result || {};
      if (!result.success) return "I could not complete " + (task.description || task.id) + ".";
      if (result.type === "locate") return "I found " + (result.name || "the location") + ".";
      if (result.type === "web_search") return "I searched the web for " + result.query + ".";
      return "I completed " + (task.description || task.id) + ".";
    }).join(" ");
  }
};
