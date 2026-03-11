const express = require("express");

const reminderController = require("../controllers/reminder.controllers");
const { PERMISSIONS } = require("../constants/permissions");
const { authenticate } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");

const router = express.Router();

router.post(
  "/",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_NOTE_CREATE),
  reminderController.createReminder
);

router.get(
  "/today",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_VIEW),
  reminderController.getTodayReminders
);

router.get(
  "/calendar",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_VIEW),
  reminderController.getReminderCalendar
);

router.get(
  "/date/:date",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_VIEW),
  reminderController.getReminderByDate
);

module.exports = router;
