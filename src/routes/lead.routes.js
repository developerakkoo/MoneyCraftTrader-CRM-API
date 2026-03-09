const express = require("express");

const leadController = require("../controllers/lead.controllers");
const { PERMISSIONS } = require("../constants/permissions");
const { authenticate } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");

const router = express.Router();

router.post("/", leadController.createLead);

router.get(
  "/events",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_VIEW),
  leadController.streamLeadEvents
);

router.get(
  "/export",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_VIEW),
  leadController.exportLeads
);

router.get(
  "/stats",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_VIEW),
  leadController.getLeadStats
);

router.get(
  "/",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_VIEW),
  leadController.listLeads
);

router.get(
  "/followups/today",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_VIEW),
  (req, res, next) => {
    req.query.followUp = "today";
    next();
  },
  leadController.listLeads
);

router.get(
  "/followups/overdue",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_VIEW),
  (req, res, next) => {
    req.query.followUp = "overdue";
    next();
  },
  leadController.listLeads
);

router.get(
  "/:id/activity",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_VIEW),
  (req, res, next) => {
    // The activity is returned by getLeadById as well, but we can make a dedicated one, or just map to getLeadById
    next();
  },
  leadController.getLeadById
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

router.patch(
  "/:id/priority",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_UPDATE),
  leadController.updateLead
);

router.patch(
  "/:id/status",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_UPDATE),
  leadController.updateLead
);

router.patch(
  "/:id/followup",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_UPDATE),
  leadController.updateLead
);

router.delete(
  "/:id",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_UPDATE),
  leadController.deleteLead
);

router.post(
  "/:id/notes",
  authenticate,
  requirePermission(PERMISSIONS.LEAD_NOTE_CREATE),
  leadController.addLeadNote
);

module.exports = router;
