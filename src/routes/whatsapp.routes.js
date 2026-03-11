const express = require("express");

const whatsappController = require("../controllers/whatsapp.controllers");
const { PERMISSIONS } = require("../constants/permissions");
const { authenticate } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");

const router = express.Router();

router.use(authenticate);

router.get(
  "/templates",
  requirePermission(PERMISSIONS.LEAD_VIEW),
  whatsappController.listTemplates
);
router.get(
  "/templates/:name",
  requirePermission(PERMISSIONS.LEAD_VIEW),
  whatsappController.getTemplateDetails
);
router.post(
  "/send-template",
  requirePermission(PERMISSIONS.LEAD_VIEW),
  whatsappController.sendTemplate
);

module.exports = router;
