const express = require("express");

const userController = require("../controllers/user.controllers");
const { PERMISSIONS } = require("../constants/permissions");
const { authenticate } = require("../middlewares/auth.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");

const router = express.Router();

router.use(authenticate);

router.get("/", requirePermission(PERMISSIONS.USER_VIEW), userController.listUsers);
router.post("/", requirePermission(PERMISSIONS.USER_CREATE), userController.createUser);
router.patch("/:id", requirePermission(PERMISSIONS.USER_CREATE), userController.updateUser);
router.delete("/:id", requirePermission(PERMISSIONS.USER_CREATE), userController.deleteUser);

module.exports = router;
