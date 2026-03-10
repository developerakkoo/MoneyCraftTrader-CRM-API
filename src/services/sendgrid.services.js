const HttpError = require("../utils/httpError");
const { logDebug, logError, logWarn } = require("../utils/logger");

const normalizeApiKey = (apiKey) => String(apiKey || "").trim();

const sendDynamicTemplateEmail = async ({ to, templateId, dynamicTemplateData, subject }) => {
  const apiKey = normalizeApiKey(process.env.SENDGRID_API_KEY);
  const fromEmail = String(process.env.SENDGRID_FROM_EMAIL || "").trim();
  const fromName = String(process.env.SENDGRID_FROM_NAME || "MoneyCraft Trader").trim();

  if (!apiKey || !fromEmail) {
    logWarn("sendgrid", "SendGrid configuration check", {
      hasApiKey: Boolean(apiKey),
      hasFromEmail: Boolean(fromEmail),
    });

    return {
      skipped: true,
      reason: "SendGrid credentials are not configured",
    };
  }

  if (!to) {
    return {
      skipped: true,
      reason: "Recipient email is required",
    };
  }

  if (!templateId) {
    return {
      skipped: true,
      reason: "SendGrid template id is not configured",
    };
  }

  const payload = {
    from: {
      email: fromEmail,
      name: fromName,
    },
    personalizations: [
      {
        to: [{ email: String(to).trim().toLowerCase() }],
        dynamic_template_data: dynamicTemplateData || {},
      },
    ],
    template_id: templateId,
  };

  if (subject) {
    payload.personalizations[0].dynamic_template_data.subject = subject;
  }

  logDebug("sendgrid", "Sending dynamic template email", {
    to,
    templateId,
    subject: subject || null,
    dynamicTemplateData: payload.personalizations[0].dynamic_template_data,
  });

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch (_error) {
    data = text;
  }

  if (!response.ok) {
    logError("sendgrid", "SendGrid email API returned an error response", {
      status: response.status,
      statusText: response.statusText,
      data,
    });
    throw new HttpError(502, "SendGrid email request failed", data);
  }

  logDebug("sendgrid", "SendGrid email API call succeeded", {
    status: response.status,
    data,
  });

  return {
    skipped: false,
    data: data || {
      status: response.status,
      accepted: true,
    },
  };
};

module.exports = {
  sendDynamicTemplateEmail,
};
