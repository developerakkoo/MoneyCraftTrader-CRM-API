const mongoose = require("mongoose");

const Lead = require("../models/lead.model");
const LeadActivity = require("../models/leadActivity.model");
const HttpError = require("../utils/httpError");

const ACTIVITY_DEFINITIONS = {
  lead_created: {
    category: "system",
    type: "lead",
    status: "completed",
    title: "Lead created",
  },
  lead_opened: {
    category: "system",
    type: "view",
    status: "completed",
    title: "Lead opened",
  },
  status_changed: {
    category: "system",
    type: "status",
    status: "completed",
    title: "Status updated",
  },
  priority_changed: {
    category: "system",
    type: "priority",
    status: "completed",
    title: "Priority updated",
  },
  followup_scheduled: {
    category: "reminder",
    type: "follow_up",
    status: "scheduled",
    title: "Follow-up scheduled",
  },
  lead_assigned: {
    category: "system",
    type: "assignment",
    status: "completed",
    title: "Lead assigned",
  },
  note_added: {
    category: "note",
    type: "note",
    status: "created",
    title: "Note added",
  },
  reminder_created: {
    category: "reminder",
    type: "manual_reminder",
    status: "created",
    title: "Reminder created",
  },
  webinar_registered: {
    category: "webinar",
    type: "registration",
    status: "completed",
    title: "Webinar registered",
  },
  webinar_confirmation_sent: {
    category: "webinar",
    type: "registration_confirmation",
    status: "sent",
    title: "Webinar confirmation sent",
  },
  webinar_confirmation_skipped: {
    category: "webinar",
    type: "registration_confirmation",
    status: "skipped",
    title: "Webinar confirmation skipped",
  },
  webinar_confirmation_failed: {
    category: "webinar",
    type: "registration_confirmation",
    status: "failed",
    title: "Webinar confirmation failed",
  },
  webinar_reminder_sent: {
    category: "reminder",
    type: "webinar_reminder",
    status: "sent",
    title: "Webinar reminder sent",
  },
  webinar_reminder_skipped: {
    category: "reminder",
    type: "webinar_reminder",
    status: "skipped",
    title: "Webinar reminder skipped",
  },
  webinar_reminder_failed: {
    category: "reminder",
    type: "webinar_reminder",
    status: "failed",
    title: "Webinar reminder failed",
  },
  whatsapp_template_sent: {
    category: "whatsapp",
    type: "template_message",
    channel: "whatsapp",
    status: "sent",
    title: "WhatsApp message sent",
  },
  whatsapp_template_failed: {
    category: "whatsapp",
    type: "template_message",
    channel: "whatsapp",
    status: "failed",
    title: "WhatsApp message failed",
  },
  whatsapp_message_sent: {
    category: "whatsapp",
    type: "message",
    channel: "whatsapp",
    status: "sent",
    title: "WhatsApp message sent",
  },
  whatsapp_message_failed: {
    category: "whatsapp",
    type: "message",
    channel: "whatsapp",
    status: "failed",
    title: "WhatsApp message failed",
  },
  whatsapp_message_skipped: {
    category: "whatsapp",
    type: "message",
    channel: "whatsapp",
    status: "skipped",
    title: "WhatsApp message skipped",
  },
  email_sent: {
    category: "email",
    type: "message",
    channel: "email",
    status: "sent",
    title: "Email sent",
  },
  email_failed: {
    category: "email",
    type: "message",
    channel: "email",
    status: "failed",
    title: "Email failed",
  },
  email_skipped: {
    category: "email",
    type: "message",
    channel: "email",
    status: "skipped",
    title: "Email skipped",
  },
  payment_recorded: {
    category: "payment",
    type: "payment",
    status: "completed",
    title: "Payment recorded",
  },
};

const ensureValidLead = async (leadId) => {
  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new HttpError(400, "Invalid lead id");
  }

  const lead = await Lead.findById(leadId).select("_id");
  if (!lead) {
    throw new HttpError(404, "Lead not found");
  }

  return lead;
};

const resolveActivityDefinition = (action, overrides = {}) => {
  const baseDefinition = ACTIVITY_DEFINITIONS[action] || {};

  return {
    category: overrides.category ?? baseDefinition.category ?? null,
    type: overrides.type ?? baseDefinition.type ?? null,
    channel: overrides.channel ?? baseDefinition.channel ?? null,
    status: overrides.status ?? baseDefinition.status ?? null,
    title: overrides.title ?? baseDefinition.title ?? null,
  };
};

const createLeadActivity = async ({
  leadId,
  userId,
  action,
  meta = {},
  category,
  type,
  channel,
  status,
  title,
}) => {
  if (!leadId) {
    return null;
  }

  const resolved = resolveActivityDefinition(action, {
    category,
    type,
    channel,
    status,
    title,
  });

  return LeadActivity.create({
    lead: leadId,
    user: userId || null,
    action,
    meta,
    ...resolved,
  });
};

const createChannelActivity = async ({
  leadId,
  userId,
  channel,
  status,
  type = "message",
  title,
  meta = {},
}) => {
  if (!leadId || !channel || !status) {
    return null;
  }

  const normalizedChannel = String(channel).trim().toLowerCase();
  const normalizedStatus = String(status).trim().toLowerCase();
  let action = null;

  if (normalizedChannel === "whatsapp") {
    if (normalizedStatus === "sent") {
      action = "whatsapp_message_sent";
    } else if (normalizedStatus === "failed") {
      action = "whatsapp_message_failed";
    } else if (normalizedStatus === "skipped") {
      action = "whatsapp_message_skipped";
    }
  }

  if (normalizedChannel === "email") {
    if (normalizedStatus === "sent") {
      action = "email_sent";
    } else if (normalizedStatus === "failed") {
      action = "email_failed";
    } else if (normalizedStatus === "skipped") {
      action = "email_skipped";
    }
  }

  if (!action) {
    return null;
  }

  return createLeadActivity({
    leadId,
    userId,
    action,
    type,
    channel: normalizedChannel,
    status: normalizedStatus,
    title,
    meta,
  });
};

const deriveActivityShape = (activity) => {
  const action = activity.action;
  const meta = activity.meta || {};
  const derived = resolveActivityDefinition(action, activity);

  if (derived.category && derived.status) {
    return derived;
  }

  if (action === "webinar_confirmation_sent") {
    return {
      ...derived,
      category: derived.category || "webinar",
      type: derived.type || "registration_confirmation",
      status: derived.status || "sent",
      title: derived.title || "Webinar confirmation sent",
    };
  }

  if (action === "webinar_confirmation_skipped") {
    return {
      ...derived,
      category: derived.category || "webinar",
      type: derived.type || "registration_confirmation",
      status: derived.status || "skipped",
      title: derived.title || "Webinar confirmation skipped",
    };
  }

  if (action === "webinar_confirmation_failed") {
    return {
      ...derived,
      category: derived.category || "webinar",
      type: derived.type || "registration_confirmation",
      status: derived.status || "failed",
      title: derived.title || "Webinar confirmation failed",
    };
  }

  if (action === "webinar_reminder_sent" || action === "webinar_reminder_skipped" || action === "webinar_reminder_failed") {
    return {
      ...derived,
      category: derived.category || "reminder",
      type: derived.type || "webinar_reminder",
      status:
        derived.status ||
        (action.endsWith("_sent") ? "sent" : action.endsWith("_failed") ? "failed" : "skipped"),
      title: derived.title || "Webinar reminder",
    };
  }

  if (action === "whatsapp_template_sent" || action === "whatsapp_template_failed") {
    return {
      ...derived,
      category: "whatsapp",
      type: "template_message",
      channel: "whatsapp",
      status: action.endsWith("_sent") ? "sent" : "failed",
      title: action.endsWith("_sent") ? "WhatsApp message sent" : "WhatsApp message failed",
    };
  }

  if (action === "reminder_created") {
    return {
      ...derived,
      category: derived.category || "reminder",
      type: derived.type || "manual_reminder",
      status: derived.status || "created",
      title: derived.title || "Reminder created",
    };
  }

  if (action === "payment_recorded") {
    return {
      ...derived,
      category: "payment",
      type: "payment",
      status: derived.status || "completed",
      title: derived.title || "Payment recorded",
    };
  }

  if (action === "lead_created") {
    return {
      ...derived,
      category: derived.category || "system",
      type: derived.type || "lead",
      status: derived.status || "completed",
      title: derived.title || "Lead created",
    };
  }

  if (meta.notifications?.email?.status === "sent") {
    return {
      ...derived,
      category: derived.category || "email",
      channel: derived.channel || "email",
      status: "sent",
    };
  }

  if (meta.notifications?.whatsapp?.status === "sent") {
    return {
      ...derived,
      category: derived.category || "whatsapp",
      channel: derived.channel || "whatsapp",
      status: "sent",
    };
  }

  return derived;
};

const formatActivity = (activity) => {
  const document = activity.toObject ? activity.toObject() : activity;
  const derived = deriveActivityShape(document);

  return {
    ...document,
    category: document.category || derived.category || null,
    type: document.type || derived.type || null,
    channel: document.channel || derived.channel || null,
    status: document.status || derived.status || null,
    title: document.title || derived.title || null,
  };
};

const listLeadActivities = async (leadId) => {
  await ensureValidLead(leadId);

  const activities = await LeadActivity.find({ lead: leadId })
    .populate("user", "name email")
    .sort({ createdAt: -1 });

  return activities.map(formatActivity);
};

const getLeadActivityCounts = async (leadId) => {
  await ensureValidLead(leadId);

  const activities = await LeadActivity.find({ lead: leadId })
    .select("action category type channel status meta");

  const counts = {
    emailsSent: 0,
    whatsappMessagesSent: 0,
    webinarRegistrations: 0,
    payments: 0,
    reminders: 0,
  };

  for (const activityDoc of activities) {
    const activity = formatActivity(activityDoc);
    const meta = activity.meta || {};

    if (activity.category === "email" && activity.status === "sent") {
      counts.emailsSent += 1;
    }

    if (activity.category === "whatsapp" && activity.status === "sent") {
      counts.whatsappMessagesSent += 1;
    }

    if (
      activity.action === "webinar_registered" ||
      activity.action === "webinar_confirmation_sent" ||
      activity.action === "webinar_confirmation_skipped" ||
      activity.action === "webinar_confirmation_failed" ||
      (activity.category === "webinar" && activity.type === "registration")
    ) {
      counts.webinarRegistrations += 1;
    }

    if (
      activity.category === "payment" &&
      ["completed", "success", "paid", "received"].includes(String(activity.status || "").toLowerCase())
    ) {
      counts.payments += 1;
    }

    if (
      activity.category === "reminder" &&
      !["failed", "skipped"].includes(String(activity.status || "").toLowerCase())
    ) {
      counts.reminders += 1;
    }

  }

  return counts;
};

module.exports = {
  createChannelActivity,
  createLeadActivity,
  ensureValidLead,
  formatActivity,
  getLeadActivityCounts,
  listLeadActivities,
};
