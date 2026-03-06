const crypto = require("crypto");

const User = require("../models/user.model");
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const { signToken } = require("../utils/jwt");

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new HttpError(400, "Email and password are required");
  }

  const user = await User.findOne({ email: email.toLowerCase() })
    .select("+passwordHash")
    .populate("role");

  if (!user || !user.isActive) {
    throw new HttpError(401, "Invalid email or password");
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new HttpError(401, "Invalid email or password");
  }

  const token = signToken({
    userId: user._id,
    roleId: user.role._id,
  });

  res.status(200).json({
    success: true,
    data: {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    },
  });
});

const me = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
});

const logout = asyncHandler(async (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new HttpError(400, "Email is required");
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "+resetPasswordToken +resetPasswordExpiresAt"
  );

  if (!user || !user.isActive) {
    res.status(200).json({
      success: true,
      message: "If the account exists, a reset token has been generated",
    });
    return;
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

  user.resetPasswordToken = hashedToken;
  user.resetPasswordExpiresAt = new Date(Date.now() + 1000 * 60 * 15);
  await user.save();

  res.status(200).json({
    success: true,
    message: "Password reset token generated",
    data: {
      resetToken,
      expiresAt: user.resetPasswordExpiresAt,
    },
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    throw new HttpError(400, "Token and new password are required");
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpiresAt: { $gt: new Date() },
    isActive: true,
  }).select("+passwordHash +resetPasswordToken +resetPasswordExpiresAt");

  if (!user) {
    throw new HttpError(400, "Reset token is invalid or expired");
  }

  user.passwordHash = await User.hashPassword(password);
  user.resetPasswordToken = null;
  user.resetPasswordExpiresAt = null;
  await user.save();

  res.status(200).json({
    success: true,
    message: "Password reset successful",
  });
});

module.exports = {
  forgotPassword,
  login,
  logout,
  me,
  resetPassword,
};
