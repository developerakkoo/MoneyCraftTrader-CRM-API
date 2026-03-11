const Lead = require("../models/lead.model");
const { Webinar } = require("../models/webinar.model");
const {
  WebinarReminderLog,
  REMINDER_PROVIDERS,
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
const { sendDynamicTemplateEmail } = require("./sendgrid.services");
const { createChannelActivity, createLeadActivity } = require("./leadActivity.services");

const DEFAULT_TEMPLATE_NAME = "moneycraft_webinar_dynamic_reminder";
const DEFAULT_SENDGRID_TEMPLATE_ID = "d-2a8bd5008c884213810d7f4c25c46647";
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
    countdownLabel: "1 hour",
  },
  {
    type: REMINDER_TYPES[2],
    offsetMinutes: 10,
    broadcastSuffix: "10min",
    countdownLabel: "10 minutes",
  },
];

let schedulerHandle = null;
let isSchedulerRunning = false;

const buildReminderNotificationData = (lead, webinar, reminderConfig) => ({
  name: lead.name,
  email: lead.email,
  reminder_time: reminderConfig.countdownLabel,
  webinar_name: webinar.title,
  webinar_title: webinar.title,
  date: formatEventDate(webinar.eventDate, webinar.timezone),
  time: formatEventTime(webinar.startTime),
  platform: webinar.mode === "OFFLINE" ? "OFFLINE" : webinar.platform,
  webinar_link:
    webinar.mode === "OFFLINE"
      ? webinar.location || "Location will be shared shortly"
      : webinar.webinarLink,
});

const sendReminder = async ({
  lead,
  webinar,
  reminderType,
  reminderConfig,
  sendWhatsapp = true,
  sendEmail = true,
}) => {
  const notificationData = buildReminderNotificationData(lead, webinar, reminderConfig);
  const jobs = [
    sendWhatsapp
      ? sendTemplateMessage({
          phone: lead.phone,
          templateName: process.env.WATI_WEBINAR_REMINDER_TEMPLATE_NAME || DEFAULT_TEMPLATE_NAME,
          broadcastName: `webinar-reminder-${reminderType.toLowerCase()}-${webinar._id}`,
          parameters: [
            notificationData.name,
            notificationData.reminder_time,
            notificationData.webinar_name,
            notificationData.date,
            notificationData.time,
            notificationData.platform,
            notificationData.webinar_link,
          ],
        })
      : Promise.resolve({
          skipped: true,
          reason: "WhatsApp reminder not required for this run",
          data: null,
        }),
    sendEmail
      ? sendDynamicTemplateEmail({
          to: lead.email,
          templateId:
            process.env.SENDGRID_WEBINAR_REMINDER_TEMPLATE_ID || DEFAULT_SENDGRID_TEMPLATE_ID,
          dynamicTemplateData: notificationData,
          subject: `Reminder: ${notificationData.webinar_name} starts in ${notificationData.reminder_time}`,
        })
      : Promise.resolve({
          skipped: true,
          reason: "Email reminder not required for this run",
          data: null,
        }),
  ];
  const [whatsapp, email] = await Promise.allSettled(jobs);

  return {
    whatsapp:
      whatsapp.status === "fulfilled"
        ? whatsapp.value
        : {
            skipped: false,
            failed: true,
            reason: whatsapp.reason?.message || "WhatsApp reminder failed",
            data: whatsapp.reason?.errors || null,
          },
    email:
      email.status === "fulfilled"
        ? email.value
        : {
            skipped: false,
            failed: true,
            reason: email.reason?.message || "Email reminder failed",
            data: email.reason?.errors || null,
          },
  };
};

const upsertReminderLog = async ({
  leadId,
  webinarId,
  reminderType,
  provider,
  scheduledFor,
  status,
  response,
  error,
}) =>
  WebinarReminderLog.findOneAndUpdate(
    {
      lead: leadId,
      webinar: webinarId,
      reminderType,
      provider,
    },
    {
      $set: {
        scheduledFor,
        provider,
        status,
        response: response || null,
        error: error || null,
        sentAt: status === "SENT" ? new Date() : null,
      },
    },
    {
      upsert: true,
      setDefaultsOnInsert: true,
      returnDocument: "after",
    }
  );

const processLeadReminder = async ({ lead, webinar, reminderConfig, scheduledFor }) => {
  const existingLogs = await WebinarReminderLog.find({
    lead: lead._id,
    webinar: webinar._id,
    reminderType: reminderConfig.type,
  }).select("provider status");

  const sentProviders = new Set(
    existingLogs.filter((log) => log.status === "SENT").map((log) => log.provider)
  );
  const needsWhatsapp = !sentProviders.has(REMINDER_PROVIDERS[0]);
  const needsEmail = !sentProviders.has(REMINDER_PROVIDERS[1]);

  if (!needsWhatsapp && !needsEmail) {
    return;
  }

  logDebug("webinar-reminder", "Sending webinar reminder", {
    leadId: lead._id,
    webinarId: webinar._id,
    reminderType: reminderConfig.type,
    scheduledFor,
    needsWhatsapp,
    needsEmail,
  });

  const notificationResult = {
    whatsapp: {
      skipped: !needsWhatsapp,
      reason: !needsWhatsapp ? "Reminder already sent on WhatsApp" : null,
      data: null,
    },
    email: {
      skipped: !needsEmail,
      reason: !needsEmail ? "Reminder already sent on email" : null,
      data: null,
    },
  };

  try {
    const result = await sendReminder({
      lead: lead.toObject(),
      webinar,
      reminderType: reminderConfig.type,
      reminderConfig,
      sendWhatsapp: needsWhatsapp && Boolean(lead.phone),
      sendEmail: needsEmail && Boolean(lead.email),
    });

    if (needsWhatsapp) {
      notificationResult.whatsapp = result.whatsapp;
    }
    if (needsEmail) {
      notificationResult.email = result.email;
    }
  } catch (error) {
    logError("webinar-reminder", "Failed to send webinar reminder", {
      leadId: lead._id,
      webinarId: webinar._id,
      reminderType: reminderConfig.type,
      error: error.message,
      details: error.errors || null,
    });
  }

  const providerResults = [
    {
      provider: REMINDER_PROVIDERS[0],
      enabled: needsWhatsapp,
      result: notificationResult.whatsapp,
      missingReason: "Lead phone number missing",
    },
    {
      provider: REMINDER_PROVIDERS[1],
      enabled: needsEmail,
      result: notificationResult.email,
      missingReason: "Lead email address missing",
    },
  ];

  for (const providerResult of providerResults) {
    if (!providerResult.enabled) {
      continue;
    }

    if (providerResult.provider === "wati" && !lead.phone) {
      await upsertReminderLog({
        leadId: lead._id,
        webinarId: webinar._id,
        reminderType: reminderConfig.type,
        provider: providerResult.provider,
        scheduledFor,
        status: "SKIPPED",
        error: { message: providerResult.missingReason },
      });
      continue;
    }

    if (providerResult.provider === "sendgrid" && !lead.email) {
      await upsertReminderLog({
        leadId: lead._id,
        webinarId: webinar._id,
        reminderType: reminderConfig.type,
        provider: providerResult.provider,
        scheduledFor,
        status: "SKIPPED",
        error: { message: providerResult.missingReason },
      });
      continue;
    }

    await upsertReminderLog({
      leadId: lead._id,
      webinarId: webinar._id,
      reminderType: reminderConfig.type,
      provider: providerResult.provider,
      scheduledFor,
      status: providerResult.result.failed
        ? "FAILED"
        : providerResult.result.skipped
          ? "SKIPPED"
          : "SENT",
      response: providerResult.result.data || null,
      error:
        providerResult.result.failed || providerResult.result.skipped
          ? { reason: providerResult.result.reason || null, details: providerResult.result.data || null }
          : null,
    });
  }

  const sentAny =
    (needsWhatsapp && !notificationResult.whatsapp.failed && !notificationResult.whatsapp.skipped) ||
    (needsEmail && !notificationResult.email.failed && !notificationResult.email.skipped);
  const failedAny =
    (needsWhatsapp && notificationResult.whatsapp.failed) ||
    (needsEmail && notificationResult.email.failed);

  await createLeadActivity({
    leadId: lead._id,
    action: failedAny
      ? "webinar_reminder_failed"
      : sentAny
        ? "webinar_reminder_sent"
        : "webinar_reminder_skipped",
    meta: {
      webinarId: webinar._id,
      webinarTitle: webinar.title,
      reminderType: reminderConfig.type,
      notifications: {
        whatsapp: notificationResult.whatsapp,
        email: notificationResult.email,
      },
    },
  });

  await Promise.all([
    createChannelActivity({
      leadId: lead._id,
      channel: "whatsapp",
      status: notificationResult.whatsapp.failed
        ? "failed"
        : notificationResult.whatsapp.skipped
          ? "skipped"
          : "sent",
      type: "webinar_reminder",
      title: "WhatsApp webinar reminder",
      meta: {
        webinarId: webinar._id,
        webinarTitle: webinar.title,
        reminderType: reminderConfig.type,
        response: notificationResult.whatsapp.data || null,
        reason: notificationResult.whatsapp.reason || null,
      },
    }),
    createChannelActivity({
      leadId: lead._id,
      channel: "email",
      status: notificationResult.email.failed
        ? "failed"
        : notificationResult.email.skipped
          ? "skipped"
          : "sent",
      type: "webinar_reminder",
      title: "Email webinar reminder",
      meta: {
        webinarId: webinar._id,
        webinarTitle: webinar.title,
        reminderType: reminderConfig.type,
        response: notificationResult.email.data || null,
        reason: notificationResult.email.reason || null,
      },
    }),
  ]);
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
