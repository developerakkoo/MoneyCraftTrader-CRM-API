const mongoose = require("mongoose");

const REMINDER_TYPES = ["ONE_DAY", "ONE_HOUR", "TEN_MINUTES"];
const REMINDER_STATUSES = ["SENT", "FAILED", "SKIPPED"];
const REMINDER_PROVIDERS = ["wati", "sendgrid"];

const webinarReminderLogSchema = new mongoose.Schema(
  {
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      required: true,
    },
    webinar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Webinar",
      required: true,
    },
    reminderType: {
      type: String,
      enum: REMINDER_TYPES,
      required: true,
    },
    scheduledFor: {
      type: Date,
      required: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: REMINDER_STATUSES,
      required: true,
    },
    provider: {
      type: String,
      enum: REMINDER_PROVIDERS,
      trim: true,
      default: "wati",
    },
    response: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    error: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

webinarReminderLogSchema.index({ webinar: 1, reminderType: 1, scheduledFor: 1 });
webinarReminderLogSchema.index({ lead: 1, webinar: 1, reminderType: 1, provider: 1 }, { unique: true });

module.exports = {
  WebinarReminderLog: mongoose.model("WebinarReminderLog", webinarReminderLogSchema),
  REMINDER_PROVIDERS,
  REMINDER_STATUSES,
  REMINDER_TYPES,
};
