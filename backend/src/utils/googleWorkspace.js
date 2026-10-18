import crypto from "crypto";
import { google } from "googleapis";
import { getContext, saveContext } from "../memory/supabaseMemory.js";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar",
];

const getRedirectUri = () =>
  process.env.GOOGLE_REDIRECT_URI
  || (process.env.PUBLIC_APP_URL ? `${process.env.PUBLIC_APP_URL.replace(/\/$/, "")}/api/google/oauth/callback` : null);

const requireClientConfig = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getRedirectUri();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI (or PUBLIC_APP_URL).");
  }

  return { clientId, clientSecret, redirectUri };
};

const createOAuthClient = () => {
  const { clientId, clientSecret, redirectUri } = requireClientConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

const authContextKey = "google_oauth";

const signOAuthState = (payload, clientSecret) => {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", clientSecret)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
};

const verifyOAuthState = (state, clientSecret) => {
  const [encodedPayload, providedSignature, ...extraParts] = String(state || "").split(".");
  if (!encodedPayload || !providedSignature || extraParts.length) {
    throw new Error("Invalid Google OAuth state.");
  }

  const expectedSignature = crypto
    .createHmac("sha256", clientSecret)
    .update(encodedPayload)
    .digest();
  let actualSignature;
  try {
    actualSignature = Buffer.from(providedSignature, "base64url");
  } catch {
    throw new Error("Invalid Google OAuth state.");
  }
  if (
    actualSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new Error("Invalid Google OAuth state.");
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid Google OAuth state.");
  }
  const now = Date.now();
  if (
    !payload.userId ||
    !payload.sessionId ||
    !Number.isFinite(payload.issuedAt) ||
    payload.issuedAt > now + 30_000 ||
    now - payload.issuedAt > 10 * 60 * 1000
  ) {
    throw new Error("Google OAuth state has expired or is invalid.");
  }
  return payload;
};

const readStoredTokens = async ({ sessionId = "default", userId = null }) => {
  const sessionCandidates = Array.from(new Set([
    sessionId || "default",
    "ui-session",
    "default",
  ]));

  // Try user-scoped context first when available.
  if (userId) {
    for (const candidate of sessionCandidates) {
      const userScoped = await getContext(candidate, authContextKey, userId);
      if (userScoped && typeof userScoped === "object" && userScoped.refresh_token) {
        return { ...userScoped, _source: { sessionId: candidate, userId } };
      }
    }
    return null;
  }

  // Fall back to legacy session-only tokens (userId null).
  for (const candidate of sessionCandidates) {
    const sessionScoped = await getContext(candidate, authContextKey, null);
    if (sessionScoped && typeof sessionScoped === "object" && sessionScoped.refresh_token) {
      return { ...sessionScoped, _source: { sessionId: candidate, userId: null } };
    }
  }

  return null;
};

export const getGoogleAuthStatus = async ({ sessionId = "default", userId = null } = {}) => {
  const stored = await readStoredTokens({ sessionId, userId });
  const hasRefreshToken = Boolean(
    stored?.refresh_token || (!userId && process.env.GOOGLE_REFRESH_TOKEN)
  );
  return {
    connected: hasRefreshToken,
    sessionId,
    userId,
    tokenSource: stored?._source || null,
    scopes: GOOGLE_SCOPES,
    redirectUri: getRedirectUri(),
  };
};

export const buildGoogleConnectUrl = async ({ sessionId = "default", userId = null } = {}) => {
  const oauth2Client = createOAuthClient();
  const { clientSecret } = requireClientConfig();
  const state = signOAuthState({
    sessionId,
    userId,
    issuedAt: Date.now(),
  }, clientSecret);
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
  });
  return { url, sessionId, userId, scopes: GOOGLE_SCOPES };
};

export const exchangeGoogleCode = async ({ code, state } = {}) => {
  if (!code) throw new Error("Missing OAuth code.");
  if (!state) throw new Error("Missing Google OAuth state.");
  const { clientSecret } = requireClientConfig();
  const { sessionId, userId } = verifyOAuthState(state, clientSecret);
  const oauth2Client = createOAuthClient();

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens) throw new Error("Google OAuth token exchange failed.");

  const previousTokens = await readStoredTokens({ sessionId, userId });
  const refreshToken = tokens.refresh_token || previousTokens?.refresh_token || null;
  if (!refreshToken) {
    throw new Error("Google OAuth did not return a refresh token. Reconnect with prompt=consent and access_type=offline.");
  }

  await saveContext(sessionId, authContextKey, {
    refresh_token: refreshToken,
    scope: tokens.scope || GOOGLE_SCOPES.join(" "),
    connected_at: new Date().toISOString(),
  }, userId);

  // Also save compatibility copies so existing UI session patterns can find tokens.
  if (sessionId !== "ui-session") {
    await saveContext("ui-session", authContextKey, {
      refresh_token: refreshToken,
      scope: tokens.scope || GOOGLE_SCOPES.join(" "),
      connected_at: new Date().toISOString(),
      source_session: sessionId,
    }, userId);
  }
  if (sessionId !== "default") {
    await saveContext("default", authContextKey, {
      refresh_token: refreshToken,
      scope: tokens.scope || GOOGLE_SCOPES.join(" "),
      connected_at: new Date().toISOString(),
      source_session: sessionId,
    }, userId);
  }

  return {
    success: true,
    sessionId,
    userId,
    scopes: tokens.scope || GOOGLE_SCOPES.join(" "),
  };
};

export const getGoogleClients = async ({ sessionId = "default", userId = null } = {}) => {
  const oauth2Client = createOAuthClient();
  const stored = await readStoredTokens({ sessionId, userId });
  const refreshToken = stored?.refresh_token || (!userId && process.env.GOOGLE_REFRESH_TOKEN);

  if (!refreshToken) {
    throw new Error("Google account is not connected. Open /api/google/connect-url (or call function googleConnectUrl) and authorize first.");
  }

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return {
    auth: oauth2Client,
    gmail: google.gmail({ version: "v1", auth: oauth2Client }),
    calendar: google.calendar({ version: "v3", auth: oauth2Client }),
  };
};

export const getGoogleOAuthInfo = () => ({
  redirectUri: getRedirectUri(),
  scopes: GOOGLE_SCOPES,
});
