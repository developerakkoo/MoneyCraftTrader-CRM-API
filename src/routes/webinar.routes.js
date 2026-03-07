const express = require("express");

const webinarController = require("../controllers/webinar.controllers");
const { PERMISSIONS } = require("../constants/permissions");
const { authenticate } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");

const router = express.Router();

router.use(authenticate);

router.get("/", requirePermission(PERMISSIONS.WEBINAR_VIEW), webinarController.listWebinars);
router.get(
  "/:id",
  requirePermission(PERMISSIONS.WEBINAR_VIEW),
  webinarController.getWebinarById
);
router.post(
  "/",
  requirePermission(PERMISSIONS.WEBINAR_CREATE),
  webinarController.createWebinar
);
router.patch(
  "/:id",
  requirePermission(PERMISSIONS.WEBINAR_UPDATE),
  webinarController.updateWebinar
);
router.patch(
  "/:id/status",
  requirePermission(PERMISSIONS.WEBINAR_UPDATE),
  webinarController.updateWebinarStatus
);

module.exports = router;
