import {
  getClientIdentity,
  getClientUserId,
} from "./clientIdentity";

export interface AgentLocateAction {
  type: "locate";
  query: string;
  success: boolean;
  name?: string;
  lat?: number;
  lng?: number;
  mapUrl?: string;
  error?: string;
}

export interface AgentBrowseAction {
  type: "browse";
  query?: string;
  success: boolean;
  url?: string;
  title?: string;
  summary?: string;
  sources?: Array<{
    title: string;
    url: string;
    snippet?: string;
  }>;
  embedBlocked?: boolean;
  fetchedAt?: string;
  error?: string;
}

export type AgentAction =
  | AgentLocateAction
  | AgentBrowseAction;

export interface AgentTask {
  id: string;
  tool: string;
  description: string;
  success: boolean;
}

export interface AgentPlan {
  goal?: string;
  steps?: string[];
}

export interface AgentResponse {
  success: boolean;
  reply: string;
  actions: AgentAction[];
  sessionId: string;
  timestamp?: string;
  requestId?: string;
  audioBase64?: string | null;
  tasks?: AgentTask[];
  plan?: AgentPlan | null;
  quickReply?: boolean;
  cachedReply?: boolean;
  directAction?: boolean;
  workflowCleared?: boolean;
  planningFailed?: boolean;
  error?: string;
  details?: string;
}

export interface MapLocationContext {
  name: string;
  lat: number;
  lng: number;
  source?: string;
  query?: string;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/*
 * Production fallback for ATHINA backend.
 *
 * VITE_BACKEND_URL can override this at build time.
 * Do not use window.location.origin because the frontend
 * and backend are deployed on different platforms.
 */
const PRODUCTION_BACKEND_URL =
  "https://athina-4qpx.onrender.com";

const configuredBackendUrl = String(
  import.meta.env.VITE_BACKEND_URL ||
    PRODUCTION_BACKEND_URL
)
  .trim()
  .replace(/\/+$/, "");

export const BACKEND_BASE_URL =
  configuredBackendUrl;

const createRequestId = (): string => {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID ===
      "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `athina-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
};

const parseJsonSafe = async (
  response: Response
): Promise<any> => {
  const rawBody = await response.text();

  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return {
      rawBody,
      error:
        "The backend returned a non-JSON response.",
    };
  }
};

const getFetchError = (
  url: string,
  response: Response,
  body: any
): Error => {
  const details =
    body?.details ||
    body?.error ||
    body?.rawBody ||
    response.statusText ||
    "Unknown backend error";

  return new Error(
    `ATHINA request failed at ${url}: ` +
      `${details} (HTTP ${response.status}).`
  );
};

/*
 * Sends a text request through ATHINA's agentic pipeline:
 *
 * Orchestrator
 * -> Rule engine
 * -> Planner
 * -> Execution engine
 * -> Tools
 * -> Memory
 */
export const sendAgentMessage = async (
  message: string,
  sessionId = getClientIdentity().sessionId,
  mode: "text" | "voice" = "text",
  locationContext?: MapLocationContext | null
): Promise<AgentResponse> => {
  const { userId } = getClientIdentity();

  const normalizedMessage =
    String(message).trim();

  if (!normalizedMessage) {
    throw new Error(
      "Please enter a message for ATHINA."
    );
  }

  /*
   * Text should use /api/chat.
   * Voice audio should use sendVoiceMessage().
   */
  const url = `${BACKEND_BASE_URL}/api/chat`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": createRequestId(),
      },
      body: JSON.stringify({
        message: normalizedMessage,
        sessionId,
        userId,
        mode,
        locationContext:
          locationContext || null,
      }),
    });

    const data = await parseJsonSafe(response);

    if (!response.ok) {
      throw getFetchError(
        url,
        response,
        data
      );
    }

    if (!data || typeof data !== "object") {
      throw new Error(
        "ATHINA returned an empty response."
      );
    }

    return {
      success: data.success === true,
      reply:
        data.reply ||
        data.error ||
        "ATHINA completed the request but returned no message.",
      actions: Array.isArray(data.actions)
        ? data.actions
        : [],
      sessionId:
        data.sessionId || sessionId,
      timestamp: data.timestamp,
      requestId: data.requestId,
      audioBase64:
        data.audioBase64 || null,
      tasks: Array.isArray(data.tasks)
        ? data.tasks
        : [],
      plan: data.plan || null,
      quickReply: Boolean(
        data.quickReply
      ),
      cachedReply: Boolean(
        data.cachedReply
      ),
      directAction: Boolean(
        data.directAction
      ),
      workflowCleared: Boolean(
        data.workflowCleared
      ),
      planningFailed: Boolean(
        data.planningFailed
      ),
      error: data.error,
      details: data.details,
    };
  } catch (error) {
    /*
     * A real network error has no HTTP response.
     */
    if (error instanceof TypeError) {
      throw new Error(
        `Unable to reach the ATHINA backend at ${url}. ` +
          "Check the backend URL, deployment status, and browser network connection."
      );
    }

    throw error;
  }
};

export const loadConversationHistory = async (
  sessionId = getClientIdentity().sessionId
): Promise<{
  success: boolean;
  sessionId: string;
  messages: ConversationMessage[];
}> => {
  const userId = getClientUserId();
  const params = new URLSearchParams();

  if (userId) {
    params.set("userId", userId);
  }

  const query = params.toString();
  const url =
    `${BACKEND_BASE_URL}/api/history/` +
    `${encodeURIComponent(sessionId)}` +
    `${query ? `?${query}` : ""}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Request-Id": createRequestId(),
    },
  });

  const data = await parseJsonSafe(response);

  if (!response.ok) {
    throw getFetchError(
      url,
      response,
      data
    );
  }

  return {
    success: data?.success === true,
    sessionId:
      data?.sessionId || sessionId,
    messages: Array.isArray(data?.messages)
      ? data.messages
      : [],
  };
};

export const sendVoiceMessage = async (
  audioBase64: string,
  sessionId = getClientIdentity().sessionId,
  locationContext?: MapLocationContext | null
): Promise<AgentResponse & {
  transcript?: string | null;
  text?: string;
}> => {
  const { userId } = getClientIdentity();
  const url = `${BACKEND_BASE_URL}/api/voice`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": createRequestId(),
    },
    body: JSON.stringify({
      audioBase64,
      sessionId,
      userId,
      locationContext:
        locationContext || null,
    }),
  });

  const data = await parseJsonSafe(response);

  if (!response.ok) {
    throw getFetchError(
      url,
      response,
      data
    );
  }

  return {
    ...data,
    reply:
      data?.reply ||
      data?.text ||
      "ATHINA returned no voice response.",
    actions: Array.isArray(data?.actions)
      ? data.actions
      : [],
    sessionId:
      data?.sessionId || sessionId,
  };
};

export const speakText = async (
  text: string
): Promise<{
  success: boolean;
  audioBase64: string | null;
}> => {
  const url = `${BACKEND_BASE_URL}/api/speak`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": createRequestId(),
    },
    body: JSON.stringify({ text }),
  });

  const data = await parseJsonSafe(response);

  if (!response.ok) {
    throw getFetchError(
      url,
      response,
      data
    );
  }

  return {
    success: data?.success === true,
    audioBase64:
      data?.audioBase64 || null,
  };
};
