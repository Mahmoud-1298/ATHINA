import nodemailer from "nodemailer";

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
  const { to, subject, body } = params;
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
  description: "Send an email to a recipient",
  params: {
    to: "string (required) - recipient email address",
    subject: "string (required) - email subject",
    body: "string (optional) - email body text",
  },
};
