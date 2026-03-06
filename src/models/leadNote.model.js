const mongoose = require("mongoose");

const leadNoteSchema = new mongoose.Schema(
  {
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

leadNoteSchema.index({ lead: 1, createdAt: -1 });

module.exports = mongoose.model("LeadNote", leadNoteSchema);
