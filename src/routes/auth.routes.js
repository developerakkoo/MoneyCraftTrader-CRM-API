const express = require("express");

const authController = require("../controllers/auth.controllers");
const { authenticate } = require("../middlewares/auth.middleware");

const router = express.Router();

router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.get("/me", authenticate, authController.me);
router.post("/logout", authenticate, authController.logout);

module.exports = router;
