const express = require("express");

const leadController = require("../controllers/lead.controllers");
const { PERMISSIONS } = require("../constants/permissions");
const { authenticate } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");

const router = express.Router();

router.post("/", leadController.createLead);

router.get(
  "/",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_VIEW),
  leadController.listLeads
);
router.get(
  "/:id",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_VIEW, PERMISSIONS.LEAD_ACTIVITY_VIEW),
  leadController.getLeadById
);
router.patch(
  "/:id",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_UPDATE),
  leadController.updateLead
);
router.post(
  "/:id/notes",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_NOTE_CREATE),
  leadController.addLeadNote
);

module.exports = router;
