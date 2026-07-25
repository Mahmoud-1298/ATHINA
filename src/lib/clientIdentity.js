export const getClientUserId = () => {
  if (typeof window === "undefined") return null;

  try {
    const storedUser = localStorage.getItem("athina_user");
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      if (parsedUser?.id) return String(parsedUser.id);
    }
  } catch {
    // Ignore malformed local user payloads and fall back to session identity.
  }

  const sessionId = localStorage.getItem("athina_session_id");
  return sessionId ? String(sessionId) : null;
};

export const getClientSessionId = () => {
  if (typeof window === "undefined") return "ui-session";

  const existing = localStorage.getItem("athina_session_id");
  if (existing) return String(existing);

  const generated = crypto.randomUUID();
  localStorage.setItem("athina_session_id", generated);
  return generated;
};

export const getClientIdentity = () => ({
  userId: getClientUserId(),
  sessionId: getClientSessionId(),
});