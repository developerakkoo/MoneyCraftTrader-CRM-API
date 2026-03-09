const mongoose = require("mongoose");
const { LEAD_STATUSES } = require("../constants/lead");

const leadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
      default: "",
    },
    source: {
      type: String,
      trim: true,
      default: "checkout",
    },
    webinar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Webinar",
      default: null,
    },
    webinarTitle: {
      type: String,
      trim: true,
      default: "",
    },
    priority: {
      type: String,
      enum: ["hot", "warm", "cold"],
      default: "cold",
    },
    followUpDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: LEAD_STATUSES,
      default: "New",
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

leadSchema.index({ createdAt: -1 });
leadSchema.index({ status: 1, assignedTo: 1, createdAt: -1 });
leadSchema.index({ email: 1 });
leadSchema.index({ phone: 1 });
leadSchema.index({ webinar: 1, createdAt: -1 });

module.exports = mongoose.model("Lead", leadSchema);
