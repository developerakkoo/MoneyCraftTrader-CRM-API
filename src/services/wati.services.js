const HttpError = require("../utils/httpError");
const { logDebug, logError, logWarn } = require("../utils/logger");

const cleanPhone = (phone) => String(phone || "").replace(/[^\d+]/g, "");

const normalizePhoneForWhatsApp = (phone) => {
  const cleaned = cleanPhone(phone);
  const defaultCountryCode = String(process.env.WATI_DEFAULT_COUNTRY_CODE || "91").replace(
    /\D/g,
    ""
  );

  if (!cleaned) {
    throw new HttpError(400, "Phone number is required to send WhatsApp message");
  }

  if (cleaned.startsWith("+")) {
    return cleaned.slice(1);
  }

  if (cleaned.length === 10 && defaultCountryCode) {
    return `${defaultCountryCode}${cleaned}`;
  }

  return cleaned;
};

const buildTemplateParameters = (values) =>
  values.map((value, index) => ({
    name: String(index + 1),
    value: String(value ?? ""),
  }));

const normalizeApiToken = (apiToken) => String(apiToken || "").replace(/^Bearer\s+/i, "").trim();

const resolveWatiApiBase = (baseUrl, tenantId) => {
  const normalizedBaseUrl = String(baseUrl || "").replace(/\/$/, "");
  const normalizedTenantId = String(tenantId || "").trim();

  if (!normalizedTenantId) {
    return normalizedBaseUrl;
  }

  if (normalizedBaseUrl.endsWith(`/${normalizedTenantId}`)) {
    return normalizedBaseUrl;
  }

  return `${normalizedBaseUrl}/${normalizedTenantId}`;
};

const sendTemplateMessage = async ({ phone, templateName, broadcastName, parameters }) => {
  const baseUrl = process.env.WATI_BASE_URL;
  const tenantId = process.env.WATI_TENANT_ID;
  const apiToken = normalizeApiToken(process.env.WATI_API_TOKEN);

  if (!baseUrl || !tenantId || !apiToken) {
    logWarn("wati", "WATI configuration check", {
      hasBaseUrl: Boolean(baseUrl),
      hasTenantId: Boolean(tenantId),
      hasApiToken: Boolean(apiToken),
    });
  }

  if (!baseUrl || !apiToken) {
    return {
      skipped: true,
      reason: "WATI credentials are not configured",
    };
  }

  const whatsappNumber = normalizePhoneForWhatsApp(phone);
  const apiBase = resolveWatiApiBase(baseUrl, tenantId);
  const url = `${apiBase}/api/v2/sendTemplateMessage?whatsappNumber=${encodeURIComponent(
    whatsappNumber
  )}`;
  const payload = {
    template_name: templateName,
    broadcast_name: broadcastName,
    parameters: buildTemplateParameters(parameters),
  };

  if (process.env.WATI_CHANNEL_NUMBER) {
    payload.channelNumber = process.env.WATI_CHANNEL_NUMBER;
  }

  logDebug("wati", "Sending template message", {
    url,
    templateName,
    broadcastName,
    whatsappNumber,
    parameterCount: payload.parameters.length,
    payload,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
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
    logError("wati", "WATI template API returned an error response", {
      status: response.status,
      statusText: response.statusText,
      data,
    });
    throw new HttpError(502, "WATI template message request failed", data);
  }

  logDebug("wati", "WATI template API call succeeded", {
    status: response.status,
    data,
  });

  return {
    skipped: false,
    data,
  };
};

module.exports = {
  sendTemplateMessage,
};
