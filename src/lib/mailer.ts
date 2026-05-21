import nodemailer, { type Transporter } from "nodemailer";

type MailRecipient = {
  email: string;
  name?: string;
};

type SendMailInput = {
  to: string | MailRecipient | Array<string | MailRecipient>;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

type SendOtpEmailInput = {
  to: MailRecipient | string;
  otpCode: string;
  expiresAt: Date;
  subject?: string;
  message?: string;
};

type SendAccountEventEmailInput = {
  to: MailRecipient | string;
  subject: string;
  title: string;
  message: string;
  ctaLabel?: string;
  ctaHref?: string;
};

type SendBookingEventEmailInput = {
  to: MailRecipient | string;
  subject: string;
  title: string;
  message: string;
  equipmentTitle: string;
  startDate: string;
  endDate: string;
  statusLabel: string;
  ctaLabel?: string;
  ctaHref?: string;
};

const APP_NAME = "RentMart";
const DEFAULT_FROM_NAME = "RentMart";

let transporter: Transporter | null = null;

function getEnv(name: string) {
  const value = process.env[name]?.trim();

  return value && value.length > 0 ? value : null;
}

function getRequiredEnv(name: string) {
  const value = getEnv(name);

  if (!value) {
    throw new Error(`[mailer] Missing required environment variable: ${name}`);
  }

  return value;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value: Date) {
  return value.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDateRangeLabel(startDate: string, endDate: string) {
  return `${startDate} to ${endDate}`;
}

function formatOtpCode(value: string) {
  const compact = value.replace(/\s+/g, "").trim();

  if (compact.length <= 3) {
    return compact;
  }

  return `${compact.slice(0, 3)} - ${compact.slice(3)}`;
}

function formatRecipient(recipient: string | MailRecipient) {
  if (typeof recipient === "string") {
    return recipient;
  }

  return recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email;
}

function getFromAddress() {
  const user = getRequiredEnv("SMTP_USER");
  const fromName = getEnv("SMTP_FROM_NAME") ?? DEFAULT_FROM_NAME;
  return `${fromName} <${user}>`;
}

function createTransporter() {
  if (transporter) {
    return transporter;
  }

  const host = getRequiredEnv("SMTP_HOST");
  const port = getRequiredEnv("SMTP_PORT");
  const user = getRequiredEnv("SMTP_USER");
  const pass = getRequiredEnv("SMTP_PASS");
  const secure = getEnv("SMTP_SECURE") === "true";

  console.log("[mailer] configuring SMTP transporter", {
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    host,
    port,
    secure,
    user,
    hasPass: Boolean(pass),
    from: getFromAddress(),
  });

  transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure,
    auth: {
      user,
      pass,
    },
  });

  return transporter;
}

export async function sendMailMessage(input: SendMailInput) {
  const mailer = createTransporter();

  const to = Array.isArray(input.to)
    ? input.to.map(formatRecipient)
    : formatRecipient(input.to);

  console.log("[mailer] sending email", {
    to,
    subject: input.subject,
    from: getFromAddress(),
  });

  try {
    const result = await mailer.sendMail({
      from: getFromAddress(),
      to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });

    console.log("[mailer] email sent", {
      to,
      subject: input.subject,
      messageId: result.messageId ?? null,
      accepted: result.accepted ?? [],
      rejected: result.rejected ?? [],
      response: result.response ?? null,
    });

    return result;
  } catch (error) {
    console.error("[mailer] sendMail failed", {
      to,
      subject: input.subject,
      message:
        error instanceof Error ? error.message : "Unknown mailer error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

export async function sendOtpEmail(input: SendOtpEmailInput) {
  const recipientEmail = typeof input.to === "string" ? input.to : input.to.email;
  const recipientName = typeof input.to === "string" ? null : input.to.name ?? null;
  const expiresAtLabel = formatDateTime(input.expiresAt);
  const formattedOtpCode = formatOtpCode(input.otpCode);
  const subject = input.subject ?? `${APP_NAME} OTP verification code`;
  const message = input.message ?? "Use this code to complete your verification.";

  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const text = [
    greeting,
    "",
    message,
    "",
    `OTP: ${formattedOtpCode}`,
    `Expires at: ${expiresAtLabel}`,
    "",
    "If you did not request this, you can ignore this email.",
    "",
    `- ${APP_NAME}`,
  ].join("\n");

  const html = `
    <div style="margin:0; padding:48px 16px; background-color:#f9faf6; font-family:Inter, Arial, sans-serif; color:#1a1c1a;">
      <div style="max-width:600px; margin:0 auto; background-color:#ffffff; border:1px solid rgba(193,200,194,0.45); border-radius:8px; overflow:hidden; box-shadow:0 1px 2px rgba(0,0,0,0.04);">
        <div style="padding:24px 32px; border-bottom:1px solid rgba(193,200,194,0.35);">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="font-size:18px; line-height:1; font-weight:900; letter-spacing:-0.04em; color:#1b4332;">
                ${escapeHtml(APP_NAME).toUpperCase()}
              </td>
              <td align="right" style="font-size:20px; line-height:1; color:#717973;">
                &#128276;
              </td>
            </tr>
          </table>
        </div>

        <div style="padding:56px 40px 48px;">
          <p style="margin:0; font-size:16px; line-height:1.6; color:#012d1d;">
            ${escapeHtml(greeting)}
          </p>

          <p style="margin:36px 0 0; font-size:16px; line-height:1.6; color:#414844; max-width:440px;">
            ${escapeHtml(message)}
          </p>

          <div style="margin:44px 0 0; padding:36px 24px; background-color:#f0fdf4; border:1px solid #1b4332; border-radius:8px; text-align:center;">
            <div style="font-family:'Courier New', monospace; font-size:46px; line-height:1.15; font-weight:700; letter-spacing:0.32em; color:#1b4332;">
              ${escapeHtml(formattedOtpCode)}
            </div>
          </div>

          <p style="margin:16px 0 0; text-align:center; font-size:12px; line-height:1.4; color:#5c5f60;">
            This code expires at <strong>${escapeHtml(expiresAtLabel)}</strong>.
          </p>
        </div>

        <div style="padding:36px 40px 40px; background-color:#f3f4f1; border-top:1px solid rgba(193,200,194,0.35); text-align:center;">
          <p style="margin:0; font-size:12px; line-height:1.6; color:#5c5f60; max-width:360px; margin-left:auto; margin-right:auto;">
            If you didn&apos;t request this email, you can safely ignore it or contact our support team immediately.
          </p>

          <p style="margin:24px 0 0; font-size:12px; line-height:1.4; color:#5c5f60;">
            <span style="white-space:nowrap;">Help Center</span>
            <span style="padding:0 10px; color:#c1c8c2;">&bull;</span>
            <span style="white-space:nowrap;">Terms</span>
            <span style="padding:0 10px; color:#c1c8c2;">&bull;</span>
            <span style="white-space:nowrap;">Privacy</span>
          </p>

          <p style="margin:24px 0 0; font-size:12px; line-height:1.4; color:#717973;">
            &copy; 2024 ${escapeHtml(APP_NAME)} Industrial Marketplace. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  `;

  return sendMailMessage({
    to: recipientEmail,
    subject,
    text,
    html,
  });
}

function renderOperationalEmailShell(input: {
  title: string;
  greeting: string;
  message: string;
  details?: Array<{ label: string; value: string }>;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  const detailsHtml = input.details?.length
    ? `
      <div style="margin:32px 0 0; padding:24px; background-color:#f8faf7; border:1px solid rgba(193,200,194,0.35); border-radius:8px;">
        ${input.details
          .map(
            (item) => `
              <div style="display:flex; justify-content:space-between; gap:16px; padding:10px 0; border-bottom:1px solid rgba(193,200,194,0.22);">
                <span style="font-size:12px; line-height:1.4; color:#717973; text-transform:uppercase; letter-spacing:0.12em;">${escapeHtml(item.label)}</span>
                <span style="font-size:14px; line-height:1.5; color:#012d1d; font-weight:600; text-align:right;">${escapeHtml(item.value)}</span>
              </div>
            `,
          )
          .join("")}
      </div>
    `
    : "";

  const ctaHtml =
    input.ctaLabel && input.ctaHref
      ? `
        <div style="margin:32px 0 0;">
          <a href="${escapeHtml(input.ctaHref)}" style="display:inline-block; padding:14px 22px; background-color:#1b4332; color:#ffffff; text-decoration:none; border-radius:6px; font-size:14px; font-weight:700;">
            ${escapeHtml(input.ctaLabel)}
          </a>
        </div>
      `
      : "";

  return `
    <div style="margin:0; padding:48px 16px; background-color:#f9faf6; font-family:Inter, Arial, sans-serif; color:#1a1c1a;">
      <div style="max-width:600px; margin:0 auto; background-color:#ffffff; border:1px solid rgba(193,200,194,0.45); border-radius:8px; overflow:hidden; box-shadow:0 1px 2px rgba(0,0,0,0.04);">
        <div style="padding:24px 32px; border-bottom:1px solid rgba(193,200,194,0.35);">
          <div style="font-size:18px; line-height:1; font-weight:900; letter-spacing:-0.04em; color:#1b4332;">
            ${escapeHtml(APP_NAME).toUpperCase()}
          </div>
        </div>
        <div style="padding:48px 40px;">
          <p style="margin:0; font-size:16px; line-height:1.6; color:#012d1d;">
            ${escapeHtml(input.greeting)}
          </p>
          <h1 style="margin:20px 0 0; font-size:28px; line-height:1.2; color:#012d1d; letter-spacing:-0.03em;">
            ${escapeHtml(input.title)}
          </h1>
          <p style="margin:20px 0 0; font-size:16px; line-height:1.7; color:#414844;">
            ${escapeHtml(input.message)}
          </p>
          ${detailsHtml}
          ${ctaHtml}
        </div>
      </div>
    </div>
  `;
}

export async function sendAccountEventEmail(input: SendAccountEventEmailInput) {
  const recipientEmail = typeof input.to === "string" ? input.to : input.to.email;
  const recipientName = typeof input.to === "string" ? null : input.to.name ?? null;
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const text = [
    greeting,
    "",
    input.title,
    "",
    input.message,
    "",
    ...(input.ctaLabel && input.ctaHref ? [`${input.ctaLabel}: ${input.ctaHref}`, ""] : []),
    `- ${APP_NAME}`,
  ].join("\n");

  return sendMailMessage({
    to: recipientEmail,
    subject: input.subject,
    text,
    html: renderOperationalEmailShell({
      title: input.title,
      greeting,
      message: input.message,
      ctaLabel: input.ctaLabel,
      ctaHref: input.ctaHref,
    }),
  });
}

export async function sendBookingEventEmail(input: SendBookingEventEmailInput) {
  const recipientEmail = typeof input.to === "string" ? input.to : input.to.email;
  const recipientName = typeof input.to === "string" ? null : input.to.name ?? null;
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const dateRange = formatDateRangeLabel(input.startDate, input.endDate);
  const text = [
    greeting,
    "",
    input.title,
    "",
    input.message,
    "",
    `Equipment: ${input.equipmentTitle}`,
    `Dates: ${dateRange}`,
    `Status: ${input.statusLabel}`,
    "",
    ...(input.ctaLabel && input.ctaHref ? [`${input.ctaLabel}: ${input.ctaHref}`, ""] : []),
    `- ${APP_NAME}`,
  ].join("\n");

  return sendMailMessage({
    to: recipientEmail,
    subject: input.subject,
    text,
    html: renderOperationalEmailShell({
      title: input.title,
      greeting,
      message: input.message,
      details: [
        { label: "Equipment", value: input.equipmentTitle },
        { label: "Dates", value: dateRange },
        { label: "Status", value: input.statusLabel },
      ],
      ctaLabel: input.ctaLabel,
      ctaHref: input.ctaHref,
    }),
  });
}
