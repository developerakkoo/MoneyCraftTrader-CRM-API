const mongoose = require("mongoose");

const REMINDER_STATUSES = ["pending", "done", "cancelled"];

const reminderSchema = new mongoose.Schema(
  {
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      required: true,
    },
    note: {
      type: String,
      required: true,
      trim: true,
    },
    reminderDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: REMINDER_STATUSES,
      default: "pending",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

reminderSchema.index({ reminderDate: 1 });
reminderSchema.index({ lead: 1, reminderDate: -1 });
reminderSchema.index({ status: 1, reminderDate: 1 });

module.exports = {
  Reminder: mongoose.model("Reminder", reminderSchema),
  REMINDER_STATUSES,
};
