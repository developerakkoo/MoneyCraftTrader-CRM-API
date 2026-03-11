const mongoose = require("mongoose");

const Lead = require("../models/lead.model");
const { Webinar } = require("../models/webinar.model");
const { buildTemplateDefinitions } = require("../config/whatsappTemplates");
const HttpError = require("../utils/httpError");
const { formatEventDate, formatEventTime, formatDuration } = require("../utils/dateTime");
const { logDebug, logError } = require("../utils/logger");
const { sendTemplateMessage } = require("./wati.services");
const { createLeadActivity } = require("./leadActivity.services");

const getNestedValue = (source, path) => {
  if (!path) {
    return undefined;
  }

  return path.split(".").reduce((value, segment) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    return value[segment];
  }, source);
};

const normalizeText = (value) => (typeof value === "string" ? value.trim() : value);

const ensureValidId = (value, label) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new HttpError(400, `Invalid ${label}`);
  }
};

const buildWebinarPresentation = (webinar) => {
  if (!webinar) {
    return null;
  }

  const eventDateLabel = formatEventDate(webinar.eventDate, webinar.timezone);
  const timeOnlyLabel = formatEventTime(webinar.startTime);
  const duration = formatDuration(webinar.durationMinutes);
  const eventTimeLabel = duration ? `${webinar.startTime} (${duration})` : webinar.startTime;
  const isOffline = webinar.mode === "OFFLINE";

  return {
    id: webinar._id,
    title: webinar.title,
    eventDateLabel,
    eventTimeLabel,
    timeOnlyLabel,
    platformLabel: isOffline ? `OFFLINE - ${webinar.location || ""}`.trim() : webinar.platform,
    modeLabel: isOffline ? "OFFLINE" : webinar.platform,
    webinarLinkLabel: isOffline
      ? webinar.location || "Location will be shared shortly"
      : webinar.webinarLink,
    status: webinar.status,
    isActive: webinar.isActive,
  };
};

const buildLeadPresentation = (lead) => {
  if (!lead) {
    return null;
  }

  return {
    id: lead._id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    city: lead.city,
    source: lead.source,
    webinarTitle: lead.webinarTitle,
    status: lead.status,
  };
};

const getTemplateByName = (name) =>
  buildTemplateDefinitions().find((template) => template.name === name);

const getTemplateByNameOrThrow = (name) => {
  const template = getTemplateByName(name);
  if (!template) {
    throw new HttpError(404, "WhatsApp template not found");
  }

  return template;
};

const loadContext = async ({ leadId, webinarId, paymentId }) => {
  const warnings = [];
  let lead = null;
  let webinar = null;

  if (paymentId) {
    warnings.push("paymentId was provided, but payment autofill is not available in this API yet.");
  }

  if (leadId) {
    ensureValidId(leadId, "lead id");
    lead = await Lead.findById(leadId).populate(
      "webinar",
      "title eventDate startTime durationMinutes timezone mode platform webinarLink location status isActive"
    );

    if (!lead) {
      throw new HttpError(404, "Lead not found");
    }
  }

  if (webinarId) {
    ensureValidId(webinarId, "webinar id");
    webinar = await Webinar.findById(webinarId).select(
      "title eventDate startTime durationMinutes timezone mode platform webinarLink location status isActive"
    );

    if (!webinar) {
      throw new HttpError(404, "Webinar not found");
    }
  } else if (lead?.webinar) {
    webinar = lead.webinar;
  }

  return {
    warnings,
    lead: buildLeadPresentation(lead),
    webinar: buildWebinarPresentation(webinar),
    payment: null,
  };
};

const resolveTemplateValues = (template, context, values = {}, { enforceRequired = true } = {}) => {
  const resolvedValues = {};

  for (const variable of template.variables) {
    const incomingValue = normalizeText(values[variable.key]);
    const autofillValue = normalizeText(getNestedValue(context, variable.source));
    const defaultValue = normalizeText(variable.defaultValue);
    const finalValue = incomingValue !== undefined ? incomingValue : autofillValue ?? defaultValue ?? "";

    if (enforceRequired && variable.required && !String(finalValue || "").trim()) {
      throw new HttpError(400, `${variable.label} is required`, {
        field: variable.key,
      });
    }

    resolvedValues[variable.key] = finalValue;
  }

  return resolvedValues;
};

const buildTemplateResponse = (template, context) => {
  const prefilledValues = resolveTemplateValues(template, context, {}, { enforceRequired: false });

  return {
    name: template.name,
    displayName: template.displayName,
    category: template.category,
    description: template.description,
    fields: template.variables.map((variable, index) => ({
      key: variable.key,
      label: variable.label,
      required: variable.required,
      source: variable.source,
      order: index + 1,
      value: prefilledValues[variable.key],
    })),
    prefilledValues,
    dataSources: {
      lead: context.lead,
      webinar: context.webinar,
      payment: context.payment,
    },
    warnings: context.warnings,
  };
};

const listTemplates = async () =>
  buildTemplateDefinitions().map((template) => ({
    name: template.name,
    displayName: template.displayName,
    category: template.category,
    description: template.description,
    variableCount: template.variables.length,
  }));

const getTemplateDetails = async (templateName, query = {}) => {
  const template = getTemplateByNameOrThrow(templateName);
  const context = await loadContext(query);

  return buildTemplateResponse(template, context);
};

const sendTemplate = async (payload, actor) => {
  const templateName = normalizeText(payload.templateName);
  if (!templateName) {
    throw new HttpError(400, "templateName is required");
  }

  const template = getTemplateByNameOrThrow(templateName);
  const context = await loadContext({
    leadId: payload.leadId,
    webinarId: payload.webinarId,
    paymentId: payload.paymentId,
  });

  const recipientPhone = normalizeText(payload.phone) || context.lead?.phone;
  if (!recipientPhone) {
    throw new HttpError(400, "phone or leadId with a valid phone number is required");
  }

  const values = payload.values && typeof payload.values === "object" ? payload.values : {};
  const resolvedValues = resolveTemplateValues(template, context, values);
  const orderedParameters = template.variables.map((variable) => resolvedValues[variable.key]);
  const broadcastName =
    normalizeText(payload.broadcastName) ||
    `admin-${template.name}-${Date.now()}`;

  logDebug("whatsapp", "Sending admin WhatsApp template message", {
    actorId: actor?._id || null,
    templateName: template.name,
    leadId: payload.leadId || null,
    webinarId: payload.webinarId || null,
    broadcastName,
    recipientPhone,
    orderedParameters,
  });

  try {
    const result = await sendTemplateMessage({
      phone: recipientPhone,
      templateName: template.name,
      broadcastName,
      parameters: orderedParameters,
    });

    await createLeadActivity({
      leadId: payload.leadId || context.lead?.id || null,
      userId: actor?._id || null,
      action: "whatsapp_template_sent",
      meta: {
        templateName: template.name,
        broadcastName,
        recipientPhone,
        values: resolvedValues,
        response: result.data || null,
      },
    });

    return {
      template: {
        name: template.name,
        displayName: template.displayName,
      },
      recipient: {
        phone: recipientPhone,
        leadId: payload.leadId || context.lead?.id || null,
        webinarId: payload.webinarId || context.webinar?.id || null,
      },
      values: resolvedValues,
      warnings: context.warnings,
      provider: {
        name: "wati",
        response: result.data || null,
        skipped: result.skipped || false,
        reason: result.reason || null,
      },
    };
  } catch (error) {
    await createLeadActivity({
      leadId: payload.leadId || context.lead?.id || null,
      userId: actor?._id || null,
      action: "whatsapp_template_failed",
      meta: {
        templateName: template.name,
        broadcastName,
        recipientPhone,
        values: resolvedValues,
        error: error.message,
        details: error.errors || null,
      },
    });

    logError("whatsapp", "Admin WhatsApp template send failed", {
      actorId: actor?._id || null,
      templateName: template.name,
      recipientPhone,
      error: error.message,
      details: error.errors || null,
    });

    throw error;
  }
};

module.exports = {
  getTemplateDetails,
  listTemplates,
  sendTemplate,
};
