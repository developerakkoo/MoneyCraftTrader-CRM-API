const mongoose = require("mongoose");

const WEBINAR_MODES = ["ONLINE", "OFFLINE"];
const WEBINAR_PLATFORMS = ["ZOOM", "GOOGLE_MEET", "OTHER"];
const WEBINAR_STATUSES = ["DRAFT", "SCHEDULED", "COMPLETED", "CANCELLED"];

const webinarSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    speakerName: {
      type: String,
      trim: true,
      default: "",
    },
    eventDate: {
      type: Date,
      required: true,
    },
    startTime: {
      type: String,
      required: true,
      trim: true,
    },
    timezone: {
      type: String,
      trim: true,
      default: "Asia/Kolkata",
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 1,
    },
    mode: {
      type: String,
      enum: WEBINAR_MODES,
      required: true,
    },
    platform: {
      type: String,
      enum: WEBINAR_PLATFORMS,
      default: null,
    },
    webinarLink: {
      type: String,
      trim: true,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    maxAttendees: {
      type: Number,
      min: 1,
      default: null,
    },
    status: {
      type: String,
      enum: WEBINAR_STATUSES,
      default: "SCHEDULED",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

webinarSchema.index({ eventDate: 1, startTime: 1 });
webinarSchema.index({ status: 1, mode: 1, platform: 1 });
webinarSchema.index({ title: "text", speakerName: "text" });

module.exports = {
  Webinar: mongoose.model("Webinar", webinarSchema),
  WEBINAR_MODES,
  WEBINAR_PLATFORMS,
  WEBINAR_STATUSES,
};
