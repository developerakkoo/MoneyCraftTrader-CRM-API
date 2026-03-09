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

  let titleToMatch = (webinarTitle && String(webinarTitle).trim()) || null;
  if (!titleToMatch && process.env.DEFAULT_WEBINAR_TITLE) {
    titleToMatch = String(process.env.DEFAULT_WEBINAR_TITLE).trim();
    logDebug("webinar-notification", "Using DEFAULT_WEBINAR_TITLE fallback", { titleToMatch });
  }
  if (titleToMatch) {
    const webinar = await Webinar.findOne({
      title: new RegExp(`^${escapeRegex(titleToMatch)}$`, "i"),
      status: "SCHEDULED",
    });
    if (webinar) {
      logDebug("webinar-notification", "Matched webinar by webinarTitle", {
        webinarTitle: webinar.title,
        webinarId: webinar._id,
      });
      return webinar;
    }
    logWarn("webinar-notification", "No scheduled webinar matched the provided title", {
      webinarTitle: titleToMatch,
    });
  }

  const defaultWebinar = await Webinar.findOne({ status: "SCHEDULED" })
    .sort({ eventDate: 1, startTime: 1 })
    .limit(1);
  if (defaultWebinar) {
    logDebug("webinar-notification", "Using most recent SCHEDULED webinar as fallback", {
      webinarId: defaultWebinar._id,
      webinarTitle: defaultWebinar.title,
    });
    return defaultWebinar;
  }

  logWarn("webinar-notification", "No webinar title or webinar id provided for lead, and no fallback found");
  return null;
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
