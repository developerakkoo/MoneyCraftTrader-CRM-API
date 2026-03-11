const asyncHandler = require("../utils/asyncHandler");
const reminderService = require("../services/reminder.services");

const createReminder = asyncHandler(async (req, res) => {
  const reminder = await reminderService.createReminder({
    leadId: req.body.leadId,
    note: req.body.note,
    reminderDate: req.body.reminderDate,
    userId: req.user._id,
  });

  res.status(201).json({
    success: true,
    data: reminder,
  });
});

const getReminderByDate = asyncHandler(async (req, res) => {
  const reminders = await reminderService.getRemindersByDate(req.params.date);

  res.status(200).json({
    success: true,
    data: reminders,
  });
});

const getTodayReminders = asyncHandler(async (_req, res) => {
  const reminders = await reminderService.getTodayReminders();

  res.status(200).json({
    success: true,
    data: reminders,
  });
});

const getReminderCalendar = asyncHandler(async (req, res) => {
  const counts = await reminderService.getReminderCalendarCounts(req.query.month);

  res.status(200).json({
    success: true,
    data: counts,
  });
});

module.exports = {
  createReminder,
  getReminderByDate,
  getTodayReminders,
  getReminderCalendar,
};
