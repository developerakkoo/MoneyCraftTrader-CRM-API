const express = require("express");

const roleController = require("../controllers/role.controllers");
const { PERMISSIONS } = require("../constants/permissions");
const { authenticate } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");

const router = express.Router();

router.use(authenticate);

router.get("/", requirePermission(PERMISSIONS.ROLE_VIEW), roleController.listRoles);
router.post("/", requirePermission(PERMISSIONS.ROLE_CREATE), roleController.createRole);
router.patch(
  "/:id",
  requirePermission(PERMISSIONS.ROLE_UPDATE),
  roleController.updateRole
);

module.exports = router;
