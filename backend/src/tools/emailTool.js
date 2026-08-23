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

const decodeBase64Url = (value) => {
  if (!value) return "";
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
};

const stripHtml = (html) =>
  String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<\/div\s*>/gi, "\n")
    .replace(/<\/li\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();

const collectMimeBodies = (part, output = { plain: [], html: [] }) => {
  if (!part || typeof part !== "object") return output;

  const mimeType = String(part.mimeType || "").toLowerCase();
  const data = part.body?.data;

  if (data) {
    const decoded = decodeBase64Url(data);
    if (mimeType === "text/plain") output.plain.push(decoded);
    if (mimeType === "text/html") output.html.push(decoded);
  }

  for (const child of part.parts || []) collectMimeBodies(child, output);
  return output;
};

const extractReadableBody = (payload, snippet = "") => {
  const collected = collectMimeBodies(payload);
  const plainText = collected.plain.join("\n\n").trim();
  if (plainText) return { text: plainText, bodyType: "text/plain" };

  const htmlText = stripHtml(collected.html.join("\n\n"));
  if (htmlText) return { text: htmlText, bodyType: "text/html" };

  const directData = payload?.body?.data ? decodeBase64Url(payload.body.data) : "";
  if (directData) {
    const isHtml = /<html|<body|<!doctype/i.test(directData);
    return {
      text: isHtml ? stripHtml(directData) : directData.trim(),
      bodyType: isHtml ? "text/html" : "text/plain",
    };
  }

  return { text: String(snippet || "").trim(), bodyType: "snippet" };
};

const normalizeRecipient = (to) => {
  if (Array.isArray(to)) return to.map(String).map((value) => value.trim()).filter(Boolean).join(", ");
  return String(to || "").trim();
};

const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

const splitRecipients = (to) =>
  String(to || "")
    .split(/[;,]/)
    .map((value) => value.trim())
    .filter(Boolean);

const hasOnlyValidEmails = (to) => {
  const recipients = splitRecipients(to);
  return recipients.length > 0 && recipients.every((value) => EMAIL_PATTERN.test(value));
};

export const execute = async (params = {}) => {
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

  const normalizedAction = String(action || "send").trim().toLowerCase();
  const normalizedProvider = String(provider || "google").trim().toLowerCase();

  if (normalizedProvider === "google") {
    const { gmail } = await getGoogleClients({ sessionId, userId });

    if (["list", "read_recent"].includes(normalizedAction)) {
      const listRes = await gmail.users.messages.list({
        userId: "me",
        maxResults: Math.min(Number(maxResults) || 10, 20),
        q: query || undefined,
      });

      const hydrated = [];
      for (const message of (listRes.data.messages || []).slice(0, 10)) {
        const messageRes = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        });

        const headers = messageRes.data.payload?.headers || [];
        const findHeader = (name) =>
          headers.find((header) => String(header.name || "").toLowerCase() === name.toLowerCase())?.value || "";

        hydrated.push({
          id: message.id,
          threadId: message.threadId,
          from: findHeader("From"),
          to: findHeader("To"),
          subject: findHeader("Subject"),
          date: findHeader("Date"),
          snippet: messageRes.data.snippet || "",
        });
      }

      return { type: "email", success: true, action: "list", count: hydrated.length, messages: hydrated };
    }

    if (normalizedAction === "read") {
      if (!messageId) {
        return { type: "email", success: false, action: "read", error: "Missing messageId for read action." };
      }

      const messageRes = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });

      const payload = messageRes.data.payload || {};
      const headers = payload.headers || [];
      const findHeader = (name) =>
        headers.find((header) => String(header.name || "").toLowerCase() === name.toLowerCase())?.value || "";
      const readable = extractReadableBody(payload, messageRes.data.snippet || "");

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
          body: readable.text,
          bodyType: readable.bodyType,
        },
      };
    }

    const recipient = normalizeRecipient(to);
    if (!recipient || !String(subject || "").trim()) {
      return {
        type: "email",
        success: false,
        action: normalizedAction,
        error: "Missing required parameters: to and subject.",
        missingFields: [
          ...(!recipient ? ["to"] : []),
          ...(!String(subject || "").trim() ? ["subject"] : []),
        ],
      };
    }

    if (!hasOnlyValidEmails(recipient)) {
      return {
        type: "email",
        success: false,
        action: normalizedAction,
        error: "Recipient must be a valid email address. I still need the recipient email.",
        missingFields: ["recipient_email"],
      };
    }

    const mime = [
      `To: ${recipient}`,
      `Subject: ${String(subject).trim()}`,
      "Content-Type: text/plain; charset=utf-8",
      "MIME-Version: 1.0",
      "",
      String(body || ""),
    ].join("\r\n");

    const raw = Buffer.from(mime, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const sent = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    if (!sent.data.id) {
      return {
        type: "email",
        success: false,
        action: "send",
        error: "Gmail did not return a message ID. Email delivery could not be verified.",
      };
    }

    return {
      type: "email",
      success: true,
      verified: true,
      action: "send",
      provider: "google",
      to: recipient,
      subject: String(subject).trim(),
      messageId: sent.data.id,
      threadId: sent.data.threadId,
    };
  }

  const recipient = normalizeRecipient(to);
  if (!recipient || !String(subject || "").trim()) {
    return {
      type: "email",
      success: false,
      action: "send",
      error: "Missing required parameters: to and subject.",
      missingFields: [
        ...(!recipient ? ["to"] : []),
        ...(!String(subject || "").trim() ? ["subject"] : []),
      ],
    };
  }

  if (!hasOnlyValidEmails(recipient)) {
    return {
      type: "email",
      success: false,
      action: "send",
      error: "Recipient must be a valid email address. I still need the recipient email.",
      missingFields: ["recipient_email"],
    };
  }

  const transport = getTransporter();
  if (!transport) {
    return {
      type: "email",
      success: false,
      action: "send",
      error: "Email is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.",
      to: recipient,
      subject,
    };
  }

  const info = await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: recipient,
    subject: String(subject).trim(),
    text: String(body || ""),
    html: String(body || "").replace(/\n/g, "<br>"),
  });

  return {
    type: "email",
    success: Boolean(info.messageId),
    verified: Boolean(info.messageId),
    action: "send",
    provider: "smtp",
    to: recipient,
    subject: String(subject).trim(),
    messageId: info.messageId,
  };
};

export const schema = {
  description: "Send and read email through Gmail OAuth, with SMTP fallback for sending.",
  actions: ["send", "list", "read"],
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["send", "list", "read"] },
      provider: { type: "string", enum: ["google", "smtp"] },
      to: {
        oneOf: [
          { type: "string" },
          { type: "array", items: { type: "string" } },
        ],
      },
      subject: { type: "string" },
      body: { type: "string" },
      query: { type: "string" },
      maxResults: { type: "number" },
      messageId: { type: "string" },
    },
  },
};
