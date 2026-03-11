const mongoose = require("mongoose");

const leadActivitySchema = new mongoose.Schema(
  {
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
      default: null,
    },
    type: {
      type: String,
      trim: true,
      default: null,
    },
    channel: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      trim: true,
      default: null,
    },
    title: {
      type: String,
      trim: true,
      default: null,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: "lead_activities",
  }
);

leadActivitySchema.index({ lead: 1, createdAt: -1 });
leadActivitySchema.index({ lead: 1, category: 1, createdAt: -1 });
leadActivitySchema.index({ lead: 1, channel: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("LeadActivity", leadActivitySchema);
