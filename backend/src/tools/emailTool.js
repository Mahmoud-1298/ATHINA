import nodemailer from "nodemailer";
import { getGoogleClients } from "../utils/googleWorkspace.js";

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
};

export const execute = async (params) => {
  const {
    action = "send",
    provider = "google",
    to,
    subject,
    body,
    maxResults = 10,
    query = "",
    messageId,
    sessionId = "default",
    userId = null,
  } = params;

  const normalizedAction = String(action || "send").toLowerCase();

  if (provider === "google") {
    const { gmail } = await getGoogleClients({ sessionId, userId });

    if (normalizedAction === "list" || normalizedAction === "read_recent") {
      const listRes = await gmail.users.messages.list({
        userId: "me",
        maxResults: Math.min(Number(maxResults) || 10, 20),
        q: query || undefined,
      });
      const messages = listRes.data.messages || [];
      const hydrated = [];

      for (const message of messages.slice(0, 10)) {
        const messageRes = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        });
        const headers = messageRes.data.payload?.headers || [];
        const findHeader = (name) => headers.find((h) => String(h.name || "").toLowerCase() === name.toLowerCase())?.value || "";
        hydrated.push({
          id: message.id,
          threadId: message.threadId,
          from: findHeader("From"),
          subject: findHeader("Subject"),
          date: findHeader("Date"),
          snippet: messageRes.data.snippet || "",
        });
      }

      return { type: "email", success: true, action: "list", count: hydrated.length, messages: hydrated };
    }

    if (normalizedAction === "read") {
      if (!messageId) return { type: "email", success: false, error: "Missing messageId for read action." };
      const messageRes = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });

      const payload = messageRes.data.payload || {};
      const headers = payload.headers || [];
      const findHeader = (name) => headers.find((h) => String(h.name || "").toLowerCase() === name.toLowerCase())?.value || "";
      const parts = payload.parts || [];
      const bodyPart = parts.find((p) => p.mimeType === "text/plain") || parts.find((p) => p.mimeType === "text/html") || payload;
      const encodedBody = bodyPart?.body?.data || "";
      const decodedBody = encodedBody
        ? Buffer.from(String(encodedBody).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
        : "";

      return {
        type: "email",
        success: true,
        action: "read",
        message: {
          id: messageRes.data.id,
          threadId: messageRes.data.threadId,
          from: findHeader("From"),
          to: findHeader("To"),
          subject: findHeader("Subject"),
          date: findHeader("Date"),
          snippet: messageRes.data.snippet || "",
          body: decodedBody,
        },
      };
    }

    if (!to || !subject) {
      return { success: false, error: "Missing required parameters: to, subject" };
    }

    const mime = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "MIME-Version: 1.0",
      "",
      body || "",
    ].join("\n");

    const raw = Buffer.from(mime, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const sent = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    return {
      type: "email",
      success: true,
      action: "send",
      provider: "google",
      to,
      subject,
      messageId: sent.data.id,
      threadId: sent.data.threadId,
    };
  }

  if (!to || !subject) {
    return { success: false, error: "Missing required parameters: to, subject" };
  }

  const transport = getTransporter();
  if (!transport) {
    return {
      type: "email",
      success: false,
      error: "Email not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS environment variables.",
      to, subject, body,
    };
  }

  const info = await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text: body || "",
    html: (body || "").replace(/\n/g, "<br>"),
  });

  return {
    type: "email",
    success: true,
    to,
    subject,
    messageId: info.messageId,
  };
};

export const schema = {
  name: "email",
  description: "Send and read emails using Gmail OAuth (fallback SMTP send supported)",
  params: {
    action: "string (optional) - send | list | read",
    provider: "string (optional) - google | smtp, default google",
    to: "string (required for send) - recipient email address",
    subject: "string (required for send) - email subject",
    body: "string (optional) - email body text",
    query: "string (optional for list) - Gmail search query",
    maxResults: "number (optional for list) - number of messages",
    messageId: "string (required for read) - Gmail message id",
    sessionId: "string (optional) - user session id for Google OAuth token lookup",
    userId: "string (optional) - user id for Google OAuth token lookup",
  },
};
