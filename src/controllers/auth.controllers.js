const crypto = require("crypto");

const User = require("../models/user.model");
const Role = require("../models/role.model");
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const { signToken } = require("../utils/jwt");
const { SYSTEM_ROLES } = require("../constants/permissions");

const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    throw new HttpError(400, "Name, email and password are required");
  }

  // const userCount = await User.countDocuments();
  // if (userCount > 0) {
  //   throw new HttpError(403, "Registration is disabled. An admin already exists.");
  // }

  const superAdminRole = await Role.findOne({ name: SYSTEM_ROLES.SUPER_ADMIN });
  if (!superAdminRole) {
    throw new HttpError(500, "Super Admin role not found. Run the server to bootstrap roles first.");
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new HttpError(409, "User already exists with this email");
  }

  const passwordHash = await User.hashPassword(password);
  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    role: superAdminRole._id,
  });

  const populated = await User.findById(user._id).populate("role");
  const token = signToken({
    userId: populated._id,
    roleId: populated.role._id,
  });

  res.status(201).json({
    success: true,
    data: {
      token,
      user: {
        id: populated._id,
        name: populated.name,
        email: populated.email,
        role: populated.role,
      },
    },
  });
});

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
  register,
  resetPassword,
};
