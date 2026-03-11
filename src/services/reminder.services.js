const mongoose = require("mongoose");

const Lead = require("../models/lead.model");
const LeadActivity = require("../models/leadActivity.model");
const { Reminder } = require("../models/reminder.model");
const HttpError = require("../utils/httpError");

const DAY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_REGEX = /^\d{4}-\d{2}$/;

const createLeadActivity = async ({ leadId, userId, action, meta = {} }) =>
  LeadActivity.create({
    lead: leadId,
    user: userId || null,
    action,
    meta,
  });

const ensureValidLead = async (leadId) => {
  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new HttpError(400, "Invalid lead id");
  }

  const lead = await Lead.findById(leadId).select("name");
  if (!lead) {
    throw new HttpError(404, "Lead not found");
  }

  return lead;
};

const parseDayRange = (dateString) => {
  if (!DAY_REGEX.test(dateString)) {
    throw new HttpError(400, "Date must be in YYYY-MM-DD format");
  }

  const start = new Date(`${dateString}T00:00:00.000Z`);
  const end = new Date(`${dateString}T23:59:59.999Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new HttpError(400, "Invalid date");
  }

  return { start, end };
};

const parseMonthRange = (monthString) => {
  if (!MONTH_REGEX.test(monthString)) {
    throw new HttpError(400, "Month must be in YYYY-MM format");
  }

  const [year, month] = monthString.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new HttpError(400, "Invalid month");
  }

  return { start, end };
};

const formatReminder = (reminder) => ({
  _id: reminder._id,
  leadId: reminder.lead?._id || reminder.lead,
  leadName: reminder.lead?.name || null,
  note: reminder.note,
  reminderDate: reminder.reminderDate,
  status: reminder.status,
  createdBy: reminder.createdBy?._id || reminder.createdBy || null,
  createdAt: reminder.createdAt,
  updatedAt: reminder.updatedAt,
});

const createReminder = async ({ leadId, note, reminderDate, userId }) => {
  const trimmedNote = typeof note === "string" ? note.trim() : "";
  if (!trimmedNote) {
    throw new HttpError(400, "Reminder note is required");
  }

  const parsedReminderDate = new Date(reminderDate);
  if (!reminderDate || Number.isNaN(parsedReminderDate.getTime())) {
    throw new HttpError(400, "Valid reminderDate is required");
  }

  const lead = await ensureValidLead(leadId);

  const reminder = await Reminder.create({
    lead: lead._id,
    note: trimmedNote,
    reminderDate: parsedReminderDate,
    createdBy: userId,
  });

  await createLeadActivity({
    leadId: lead._id,
    userId,
    action: "reminder_created",
    meta: {
      reminderId: reminder._id,
      reminderDate: reminder.reminderDate,
      note: reminder.note,
    },
  });

  const populatedReminder = await Reminder.findById(reminder._id)
    .populate("lead", "name")
    .populate("createdBy", "name email");

  return formatReminder(populatedReminder);
};

const getRemindersByDate = async (dateString) => {
  const { start, end } = parseDayRange(dateString);

  const reminders = await Reminder.find({
    reminderDate: { $gte: start, $lte: end },
  })
    .populate("lead", "name")
    .populate("createdBy", "name email")
    .sort({ reminderDate: 1, createdAt: 1 });

  return reminders.map(formatReminder);
};

const getTodayReminders = async () => {
  const now = new Date();
  const dateString = now.toISOString().slice(0, 10);

  const reminders = await Reminder.find({
    status: "pending",
    reminderDate: {
      $gte: new Date(`${dateString}T00:00:00.000Z`),
      $lte: new Date(`${dateString}T23:59:59.999Z`),
    },
  })
    .populate("lead", "name")
    .populate("createdBy", "name email")
    .sort({ reminderDate: 1, createdAt: 1 });

  return reminders.map(formatReminder);
};

const getReminderCalendarCounts = async (month) => {
  const range = month ? parseMonthRange(month) : null;
  const match = range
    ? {
        reminderDate: {
          $gte: range.start,
          $lte: range.end,
        },
      }
    : {};

  const counts = await Reminder.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$reminderDate",
          },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return counts.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});
};

module.exports = {
  createReminder,
  getRemindersByDate,
  getTodayReminders,
  getReminderCalendarCounts,
};
