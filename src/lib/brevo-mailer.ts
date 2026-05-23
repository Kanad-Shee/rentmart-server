import { logger } from "./logger.js";

type MailRecipient = {
  email: string;
  name?: string;
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

export enum EmailPurpose {
  OTP = "OTP",
  ACCOUNT = "ACCOUNT",
  BOOKING = "BOOKING",
}

type SendEmailInput = {
  email: string;
  title: string;
  body: string;
  purpose: EmailPurpose;
  url?: string;
  actionLabel?: string;
  footerNote?: string;
  details?: Array<{
    label: string;
    value: string;
  }>;
};

type BrevoErrorResponse = {
  message?: string;
  code?: string;
};

type BrevoSuccessResponse = {
  messageId?: string;
  messageIds?: string[];
};

const APP_NAME = "RentMart";
const DEFAULT_FROM_NAME = "RentMart";
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const APP_SUPPORT_EMAIL = "support@rentmart.in";
const APP_TERMS_URL = "/terms";
const APP_SUPPORT_URL = "/contact";

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function getRequiredEnv(name: string) {
  const value = getEnv(name);

  if (!value) {
    throw new Error(`[brevo-mailer] Missing required environment variable: ${name}`);
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

function getFromAddress() {
  const fromName = getEnv("SMTP_FROM_NAME") ?? DEFAULT_FROM_NAME;
  const fromEmail = getRequiredEnv("EMAIL_USER");

  return {
    name: fromName,
    email: fromEmail,
  };
}

function getPurposeHeading(purpose: EmailPurpose) {
  switch (purpose) {
    case EmailPurpose.OTP:
      return "Verify your email";
    case EmailPurpose.ACCOUNT:
      return "Account update";
    case EmailPurpose.BOOKING:
      return "Booking update";
  }
}

function getPurposeDefaultActionLabel(purpose: EmailPurpose) {
  switch (purpose) {
    case EmailPurpose.OTP:
      return "Complete Verification";
    case EmailPurpose.ACCOUNT:
      return "View Account";
    case EmailPurpose.BOOKING:
      return "View Booking";
  }
}

function getPurposeEyebrow(purpose: EmailPurpose) {
  switch (purpose) {
    case EmailPurpose.OTP:
      return "Secure account access";
    case EmailPurpose.ACCOUNT:
      return "Account activity update";
    case EmailPurpose.BOOKING:
      return "Rental lifecycle update";
  }
}

function renderDetailRows(
  details?: Array<{
    label: string;
    value: string;
  }>,
) {
  if (!details || details.length === 0) {
    return "";
  }

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 28px; border: 1px solid #d8ddd9; border-radius: 8px; background-color: #f3f4f1;">
      <tr>
        <td style="padding: 0;">
          ${details
            .map(
              (detail, index) => `
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding: 16px 20px; border-bottom: ${
                      index < details.length - 1 ? "1px solid #d8ddd9" : "0"
                    };">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td style="font-size: 11px; line-height: 1.3; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #5f6661;">
                            ${escapeHtml(detail.label)}
                          </td>
                          <td align="right" style="font-size: 14px; line-height: 1.5; font-weight: 600; color: #1a1c1a;">
                            ${escapeHtml(detail.value)}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              `,
            )
            .join("")}
        </td>
      </tr>
    </table>
  `;
}

function renderEmailSkeleton(input: SendEmailInput) {
  const buttonHtml = input.url
    ? `
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top: 32px;">
        <tr>
          <td style="border-radius: 4px; background-color: #1b4332;">
            <a href="${escapeHtml(input.url)}" style="display: inline-block; padding: 14px 28px; font-size: 14px; line-height: 1.2; font-weight: 600; letter-spacing: 0.01em; color: #ffffff; text-decoration: none; border-radius: 4px;">
              ${escapeHtml(input.actionLabel ?? getPurposeDefaultActionLabel(input.purpose))}
            </a>
          </td>
        </tr>
      </table>
    `
    : "";

  return `
    <div style="margin: 0; padding: 0; background-color: #f3f4f1; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1a1c1a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f1;">
        <tr>
          <td style="padding: 32px 16px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; border-collapse: separate;">
              <tr>
                <td style="background-color: #1b4332; padding: 26px 32px; border-radius: 8px 8px 0 0;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="font-size: 28px; line-height: 1.1; font-weight: 700; letter-spacing: -0.03em; color: #ffffff;">
                        ${escapeHtml(APP_NAME)}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top: 10px; font-size: 12px; line-height: 1.4; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #a5d0b9;">
                        Industrial Marketplace
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="background-color: #ffffff; border: 1px solid #d8ddd9; border-top: 0; padding: 34px 32px 28px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="font-size: 11px; line-height: 1.3; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #5f6661;">
                        ${escapeHtml(getPurposeEyebrow(input.purpose))}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top: 14px;">
                        <div style="width: 52px; height: 1px; background-color: #86af99;"></div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top: 18px; font-size: 31px; line-height: 1.2; font-weight: 600; letter-spacing: -0.02em; color: #1a1c1a;">
                        ${escapeHtml(getPurposeHeading(input.purpose))}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top: 24px; font-size: 16px; line-height: 1.75; color: #414844;">
                        ${input.body}
                      </td>
                    </tr>
                    <tr>
                      <td>
                        ${renderDetailRows(input.details)}
                      </td>
                    </tr>
                    ${
                      buttonHtml
                        ? `
                          <tr>
                            <td>
                              ${buttonHtml}
                            </td>
                          </tr>
                        `
                        : ""
                    }
                    ${
                      input.footerNote
                        ? `
                          <tr>
                            <td style="padding-top: 28px;">
                              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #d8ddd9; background-color: #f9faf6;">
                                <tr>
                                  <td style="padding: 16px 18px; font-size: 13px; line-height: 1.6; color: #5f6661;">
                                    ${escapeHtml(input.footerNote)}
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        `
                        : ""
                    }
                  </table>
                </td>
              </tr>
              <tr>
                <td style="background-color: #2f312f; padding: 24px 32px 28px; border-radius: 0 0 8px 8px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="center" style="font-size: 12px; line-height: 1.4; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #c7cec9;">
                        Need help with your booking or account?
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-top: 14px; font-size: 13px; line-height: 1.7; color: #f0f1ee;">
                        <a href="${escapeHtml(APP_SUPPORT_URL)}" style="color: #f0f1ee; text-decoration: none;">Support</a>
                        <span style="color: #8f9791; padding: 0 10px;">|</span>
                        <a href="${escapeHtml(APP_TERMS_URL)}" style="color: #f0f1ee; text-decoration: none;">Terms of Service</a>
                        <span style="color: #8f9791; padding: 0 10px;">|</span>
                        <a href="${escapeHtml(APP_TERMS_URL)}" style="color: #f0f1ee; text-decoration: none;">Privacy Policy</a>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-top: 16px; font-size: 13px; line-height: 1.7; color: #c7cec9;">
                        Contact us at
                        <a href="mailto:${escapeHtml(APP_SUPPORT_EMAIL)}" style="color: #ffffff; text-decoration: none;">${escapeHtml(APP_SUPPORT_EMAIL)}</a>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-top: 16px; border-top: 1px solid #434744; font-size: 12px; line-height: 1.6; color: #a5ada7;">
                        If you didn't request this, you can safely ignore this email.<br />
                        &copy; 2026 ${escapeHtml(APP_NAME)} Industrial Marketplace. All rights reserved.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function getBrevoApiKey() {
  return getRequiredEnv("BREVO_API_KEY");
}

export function initializeMailer(): { status: string; initialized: boolean } {
  try {
    getBrevoApiKey();
    getFromAddress();

    return {
      status: "Brevo mailer initialized successfully",
      initialized: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("[brevo-mailer] Failed to initialize at startup", {
      service: "brevo-mailer",
      action: "initializeMailer",
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }

    return {
      status: `Failed to initialize Brevo mailer: ${errorMessage}`,
      initialized: false,
    };
  }
}

export const sendEmail = async ({
  email,
  body,
  title,
  url,
  purpose,
  actionLabel,
  footerNote,
  details,
}: SendEmailInput) => {
  const sender = getFromAddress();
  const html = renderEmailSkeleton({
    email,
    title,
    body,
    url,
    purpose,
    actionLabel,
    footerNote,
    details,
  });

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": getBrevoApiKey(),
    },
    body: JSON.stringify({
      sender,
      to: [{ email }],
      subject: title,
      htmlContent: html,
    }),
  });

  const responseBody = (await response.json().catch(() => null)) as
    | BrevoErrorResponse
    | BrevoSuccessResponse
    | null;

  if (!response.ok) {
    const errorMessage =
      responseBody && "message" in responseBody && responseBody.message
        ? responseBody.message
        : `Brevo API request failed with status ${response.status}`;

    logger.error("[brevo-mailer] sendEmail error", {
      service: "brevo-mailer",
      action: "sendEmail",
      to: email,
      subject: title,
      purpose,
      status: response.status,
      error: responseBody,
      timestamp: new Date().toISOString(),
    });

    throw new Error(errorMessage);
  }

  const messageId =
    responseBody && "messageId" in responseBody
      ? (responseBody.messageId ?? responseBody.messageIds?.[0] ?? null)
      : null;

  logger.info("[brevo-mailer] message sent successfully", {
    service: "brevo-mailer",
    action: "sendEmail",
    to: email,
    subject: title,
    purpose,
    messageId,
    timestamp: new Date().toISOString(),
  });

  return responseBody;
};

export async function sendOtpEmail(input: SendOtpEmailInput) {
  const recipientEmail =
    typeof input.to === "string" ? input.to : input.to.email;
  const recipientName =
    typeof input.to === "string" ? null : (input.to.name ?? null);
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const formattedOtpCode = formatOtpCode(input.otpCode);
  const expiresAtLabel = formatDateTime(input.expiresAt);

  const body = `
    <p style="margin: 0; font-size: 24px; line-height: 1.3; font-weight: 600; letter-spacing: -0.02em; color: #1a1c1a;">${escapeHtml(greeting)}</p>
    <p style="margin: 18px 0 0; font-size: 16px; line-height: 1.8; color: #414844;">${escapeHtml(
      input.message ?? "Use this code to complete your verification.",
    )}</p>
    <div style="margin-top: 28px; border: 1px solid #d8ddd9; background-color: #f3f4f1; padding: 22px 18px; text-align: center; border-radius: 8px;">
      <div style="font-size: 12px; line-height: 1.3; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #5f6661;">
        Verification code
      </div>
      <div style="margin-top: 12px; font-size: 38px; line-height: 1.1; font-weight: 700; color: #012d1d; letter-spacing: 0.24em;">
        ${escapeHtml(formattedOtpCode)}
      </div>
    </div>
  `;

  return sendEmail({
    email: recipientEmail,
    title: input.subject ?? `${APP_NAME} OTP verification code`,
    body,
    purpose: EmailPurpose.OTP,
    footerNote: `This code expires at ${expiresAtLabel}.`,
  });
}

export async function sendAccountEventEmail(input: SendAccountEventEmailInput) {
  const recipientEmail =
    typeof input.to === "string" ? input.to : input.to.email;
  const recipientName =
    typeof input.to === "string" ? null : (input.to.name ?? null);
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";

  const body = `
    <p style="margin: 0; font-size: 24px; line-height: 1.3; font-weight: 600; letter-spacing: -0.02em; color: #1a1c1a;">${escapeHtml(greeting)}</p>
    <p style="margin: 18px 0 0; font-size: 16px; line-height: 1.7; color: #5f6661; font-weight: 600;">
      ${escapeHtml(input.title)}
    </p>
    <p style="margin: 18px 0 0; font-size: 16px; line-height: 1.8; color: #414844;">${escapeHtml(input.message)}</p>
  `;

  return sendEmail({
    email: recipientEmail,
    title: input.subject,
    body,
    purpose: EmailPurpose.ACCOUNT,
    url: input.ctaHref,
    actionLabel: input.ctaLabel,
  });
}

export async function sendBookingEventEmail(input: SendBookingEventEmailInput) {
  const recipientEmail =
    typeof input.to === "string" ? input.to : input.to.email;
  const recipientName =
    typeof input.to === "string" ? null : (input.to.name ?? null);
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";

  const body = `
    <p style="margin: 0; font-size: 24px; line-height: 1.3; font-weight: 600; letter-spacing: -0.02em; color: #1a1c1a;">${escapeHtml(greeting)}</p>
    <p style="margin: 18px 0 0; font-size: 16px; line-height: 1.7; color: #5f6661; font-weight: 600;">
      ${escapeHtml(input.title)}
    </p>
    <p style="margin: 18px 0 0; font-size: 16px; line-height: 1.8; color: #414844;">${escapeHtml(input.message)}</p>
  `;

  return sendEmail({
    email: recipientEmail,
    title: input.subject,
    body,
    purpose: EmailPurpose.BOOKING,
    url: input.ctaHref,
    actionLabel: input.ctaLabel,
    details: [
      { label: "Equipment", value: input.equipmentTitle },
      {
        label: "Dates",
        value: formatDateRangeLabel(input.startDate, input.endDate),
      },
      { label: "Status", value: input.statusLabel },
    ],
  });
}
