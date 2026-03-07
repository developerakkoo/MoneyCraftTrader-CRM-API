const mongoose = require("mongoose");
const { Webinar } = require("../models/webinar.model");
const { formatDuration, formatEventDate } = require("../utils/dateTime");
const { logDebug, logWarn } = require("../utils/logger");
const { sendTemplateMessage } = require("./wati.services");

const DEFAULT_TEMPLATE_NAME = "moneycraft_webinar_registration_confirmation";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findWebinarForLead = async ({ webinarId, webinarTitle }) => {
  if (webinarId) {
    if (!mongoose.Types.ObjectId.isValid(webinarId)) {
      logWarn("webinar-notification", "Received invalid webinarId for lead registration", {
        webinarId,
      });
      return null;
    }

    const webinar = await Webinar.findById(webinarId);
    if (webinar) {
      logDebug("webinar-notification", "Matched webinar by webinarId", {
        webinarId,
        webinarTitle: webinar.title,
      });
      return webinar;
    }
  }

  if (!webinarTitle || !webinarTitle.trim()) {
    logWarn("webinar-notification", "No webinar title or webinar id provided for lead");
    return null;
  }

  const webinar = await Webinar.findOne({
    title: new RegExp(`^${escapeRegex(webinarTitle.trim())}$`, "i"),
    status: "SCHEDULED",
  });

  if (!webinar) {
    logWarn("webinar-notification", "No scheduled webinar matched the provided title", {
      webinarTitle: webinarTitle.trim(),
    });
    return null;
  }

  logDebug("webinar-notification", "Matched webinar by webinarTitle", {
    webinarTitle: webinar.title,
    webinarId: webinar._id,
  });

  return webinar;
};

const sendWebinarRegistrationConfirmation = async ({ lead, webinar }) => {
  const eventDate = formatEventDate(webinar.eventDate, webinar.timezone);
  const duration = formatDuration(webinar.durationMinutes);
  const timeValue = duration
    ? `${webinar.startTime} (${duration})`
    : webinar.startTime;
  const platformValue = webinar.mode === "OFFLINE" ? `OFFLINE - ${webinar.location}` : webinar.platform;
  const webinarLinkValue =
    webinar.mode === "OFFLINE" ? webinar.location || "Location will be shared shortly" : webinar.webinarLink;

  logDebug("webinar-notification", "Preparing webinar registration confirmation payload", {
    leadId: lead._id,
    webinarId: webinar._id,
    templateName: process.env.WATI_WEBINAR_TEMPLATE_NAME || DEFAULT_TEMPLATE_NAME,
    parameters: [
      lead.name,
      webinar.title,
      lead.email,
      eventDate,
      timeValue,
      platformValue,
      webinarLinkValue,
    ],
  });

  return sendTemplateMessage({
    phone: lead.phone,
    templateName: process.env.WATI_WEBINAR_TEMPLATE_NAME || DEFAULT_TEMPLATE_NAME,
    broadcastName: `webinar-registration-${webinar._id}`,
    parameters: [
      lead.name,
      webinar.title,
      lead.email,
      eventDate,
      timeValue,
      platformValue,
      webinarLinkValue,
    ],
  });
};

module.exports = {
  findWebinarForLead,
  sendWebinarRegistrationConfirmation,
};
