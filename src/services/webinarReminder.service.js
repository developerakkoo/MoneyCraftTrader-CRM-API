const Lead = require("../models/lead.model");
const LeadActivity = require("../models/leadActivity.model");
const { Webinar } = require("../models/webinar.model");
const {
  WebinarReminderLog,
  REMINDER_TYPES,
} = require("../models/webinarReminderLog.model");
const {
  formatDateTimeWithTimezone,
  formatEventDate,
  formatEventTime,
  getWebinarStartDateTime,
} = require("../utils/dateTime");
const { logDebug, logError, logInfo, logWarn } = require("../utils/logger");
const { sendTemplateMessage } = require("./wati.services");

const DEFAULT_TEMPLATE_NAME = "moneycraft_webinar_dynamic_reminder";
const POLL_INTERVAL_MS = Math.max(Number(process.env.WEBINAR_REMINDER_POLL_MS) || 60000, 10000);
const LOOKBACK_MINUTES = Math.max(Number(process.env.WEBINAR_REMINDER_LOOKBACK_MINUTES) || 5, 1);
const REMINDER_CONFIGS = [
  {
    type: REMINDER_TYPES[0],
    offsetMinutes: 24 * 60,
    broadcastSuffix: "1day",
    countdownLabel: "1 day",
  },
  {
    type: REMINDER_TYPES[1],
    offsetMinutes: 60,
    broadcastSuffix: "1hr",
    countdownLabel: "1 hr",
  },
  {
    type: REMINDER_TYPES[2],
    offsetMinutes: 10,
    broadcastSuffix: "10min",
    countdownLabel: "10 min",
  },
];

let schedulerHandle = null;
let isSchedulerRunning = false;

const createLeadActivity = async ({ leadId, action, meta = {} }) =>
  LeadActivity.create({
    lead: leadId,
    action,
    meta,
  });

const buildReminderParameters = (lead, webinar, reminderConfig) => [
  lead.name,
  reminderConfig.countdownLabel,
  webinar.title,
  formatEventDate(webinar.eventDate, webinar.timezone),
  formatEventTime(webinar.startTime),
  webinar.mode === "OFFLINE" ? "OFFLINE" : webinar.platform,
  webinar.mode === "OFFLINE"
    ? webinar.location || "Location will be shared shortly"
    : webinar.webinarLink,
];

const sendReminder = async ({ lead, webinar, reminderType, reminderConfig }) =>
  sendTemplateMessage({
    phone: lead.phone,
    templateName: process.env.WATI_WEBINAR_REMINDER_TEMPLATE_NAME || DEFAULT_TEMPLATE_NAME,
    broadcastName: `webinar-reminder-${reminderType.toLowerCase()}-${webinar._id}`,
    parameters: buildReminderParameters(lead, webinar, reminderConfig),
  });

const upsertReminderLog = async ({ leadId, webinarId, reminderType, scheduledFor, status, response, error }) =>
  WebinarReminderLog.findOneAndUpdate(
    {
      lead: leadId,
      webinar: webinarId,
      reminderType,
    },
    {
      $set: {
        scheduledFor,
        status,
        response: response || null,
        error: error || null,
        sentAt: status === "SENT" ? new Date() : null,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

const processLeadReminder = async ({ lead, webinar, reminderConfig, scheduledFor }) => {
  const existingLog = await WebinarReminderLog.findOne({
    lead: lead._id,
    webinar: webinar._id,
    reminderType: reminderConfig.type,
  });

  if (existingLog?.status === "SENT") {
    return;
  }

  if (!lead.phone) {
    await upsertReminderLog({
      leadId: lead._id,
      webinarId: webinar._id,
      reminderType: reminderConfig.type,
      scheduledFor,
      status: "SKIPPED",
      error: { message: "Lead phone number missing" },
    });

    await createLeadActivity({
      leadId: lead._id,
      action: "webinar_reminder_skipped",
      meta: {
        webinarId: webinar._id,
        webinarTitle: webinar.title,
        reminderType: reminderConfig.type,
        reason: "Lead phone number missing",
      },
    });

    return;
  }

  try {
    logDebug("webinar-reminder", "Sending webinar reminder", {
      leadId: lead._id,
      webinarId: webinar._id,
      reminderType: reminderConfig.type,
      scheduledFor,
    });

    const notificationResult = await sendReminder({
      lead,
      webinar,
      reminderType: reminderConfig.type,
      reminderConfig,
    });

    await upsertReminderLog({
      leadId: lead._id,
      webinarId: webinar._id,
      reminderType: reminderConfig.type,
      scheduledFor,
      status: notificationResult.skipped ? "SKIPPED" : "SENT",
      response: notificationResult.data || null,
      error: notificationResult.skipped ? { reason: notificationResult.reason } : null,
    });

    await createLeadActivity({
      leadId: lead._id,
      action: notificationResult.skipped
        ? "webinar_reminder_skipped"
        : "webinar_reminder_sent",
      meta: {
        webinarId: webinar._id,
        webinarTitle: webinar.title,
        reminderType: reminderConfig.type,
        reason: notificationResult.reason || null,
        response: notificationResult.data || null,
      },
    });
  } catch (error) {
    logError("webinar-reminder", "Failed to send webinar reminder", {
      leadId: lead._id,
      webinarId: webinar._id,
      reminderType: reminderConfig.type,
      error: error.message,
      details: error.errors || null,
    });

    await upsertReminderLog({
      leadId: lead._id,
      webinarId: webinar._id,
      reminderType: reminderConfig.type,
      scheduledFor,
      status: "FAILED",
      error: {
        message: error.message,
        details: error.errors || null,
      },
    });

    await createLeadActivity({
      leadId: lead._id,
      action: "webinar_reminder_failed",
      meta: {
        webinarId: webinar._id,
        webinarTitle: webinar.title,
        reminderType: reminderConfig.type,
        error: error.message,
        details: error.errors || null,
      },
    });
  }
};

const processReminderConfigForWebinar = async (webinar, reminderConfig, now) => {
  const webinarStartAt = getWebinarStartDateTime(
    webinar.eventDate,
    webinar.startTime,
    webinar.timezone
  );
  const scheduledFor = new Date(webinarStartAt.getTime() - reminderConfig.offsetMinutes * 60000);
  const lookbackStart = new Date(now.getTime() - LOOKBACK_MINUTES * 60000);

  if (scheduledFor > now || scheduledFor < lookbackStart) {
    return;
  }

  const leads = await Lead.find({ webinar: webinar._id }).select("name email phone webinar");
  if (leads.length === 0) {
    logWarn("webinar-reminder", "No leads found for webinar reminder window", {
      webinarId: webinar._id,
      webinarTitle: webinar.title,
      reminderType: reminderConfig.type,
    });
    return;
  }

    logInfo("webinar-reminder", "Processing webinar reminder window", {
      webinarId: webinar._id,
      webinarTitle: webinar.title,
      reminderType: reminderConfig.type,
      leadCount: leads.length,
      scheduledFor,
      scheduledForIst: formatDateTimeWithTimezone(scheduledFor, "Asia/Kolkata"),
    });

  for (const lead of leads) {
    await processLeadReminder({
      lead,
      webinar,
      reminderConfig,
      scheduledFor,
    });
  }
};

const runReminderSweep = async () => {
  if (isSchedulerRunning) {
    logWarn("webinar-reminder", "Previous reminder sweep still running, skipping this cycle");
    return;
  }

  isSchedulerRunning = true;

  try {
    const now = new Date();
    const webinars = await Webinar.find({
      status: "SCHEDULED",
      eventDate: {
        $gte: new Date(now.getTime() - 24 * 60 * 60000),
        $lte: new Date(now.getTime() + 2 * 24 * 60 * 60000),
      },
    }).select(
      "title eventDate startTime timezone mode platform webinarLink location status"
    );

    logDebug("webinar-reminder", "Running reminder sweep", {
      webinarCount: webinars.length,
      now,
      nowIst: formatDateTimeWithTimezone(now, "Asia/Kolkata"),
    });

    for (const webinar of webinars) {
      for (const reminderConfig of REMINDER_CONFIGS) {
        await processReminderConfigForWebinar(webinar, reminderConfig, now);
      }
    }
  } catch (error) {
    logError("webinar-reminder", "Reminder sweep failed", {
      error: error.message,
      details: error.errors || null,
    });
  } finally {
    isSchedulerRunning = false;
  }
};

const startWebinarReminderScheduler = () => {
  if (schedulerHandle) {
    return schedulerHandle;
  }

  logInfo("webinar-reminder", "Starting webinar reminder scheduler", {
    pollIntervalMs: POLL_INTERVAL_MS,
    lookbackMinutes: LOOKBACK_MINUTES,
  });

  schedulerHandle = setInterval(() => {
    runReminderSweep().catch((error) => {
      logError("webinar-reminder", "Unhandled reminder sweep error", {
        error: error.message,
      });
    });
  }, POLL_INTERVAL_MS);

  runReminderSweep().catch((error) => {
    logError("webinar-reminder", "Initial reminder sweep failed", {
      error: error.message,
    });
  });

  return schedulerHandle;
};

module.exports = {
  runReminderSweep,
  startWebinarReminderScheduler,
};
