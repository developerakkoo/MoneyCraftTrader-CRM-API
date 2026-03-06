const Role = require("../models/role.model");
const User = require("../models/user.model");
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");

const listUsers = asyncHandler(async (_req, res) => {
  const users = await User.find({ isActive: true })
    .populate("role", "name permissions")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: users,
  });
});

const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, roleId } = req.body;

  if (!name || !email || !password || !roleId) {
    throw new HttpError(400, "Name, email, password and roleId are required");
  }

  const [existingUser, role] = await Promise.all([
    User.findOne({ email: email.toLowerCase() }),
    Role.findById(roleId),
  ]);

  if (existingUser) {
    throw new HttpError(409, "User already exists with this email");
  }

  if (!role) {
    throw new HttpError(404, "Role not found");
  }

  const passwordHash = await User.hashPassword(password);

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash,
    role: role._id,
  });

  const populatedUser = await User.findById(user._id).populate("role", "name permissions");

  res.status(201).json({
    success: true,
    data: populatedUser,
  });
});

const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, roleId } = req.body;

  const user = await User.findById(id);
  if (!user) {
    throw new HttpError(404, "User not found");
  }

  if (name !== undefined && name.trim()) user.name = name.trim();
  if (roleId !== undefined) {
    const role = await Role.findById(roleId);
    if (!role) throw new HttpError(404, "Role not found");
    user.role = roleId;
  }

  await user.save();
  const populated = await User.findById(user._id).populate("role", "name permissions");
  res.status(200).json({ success: true, data: populated });
});

const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = await User.findById(id);
  if (!user) {
    throw new HttpError(404, "User not found");
  }
  user.isActive = false;
  await user.save();
  res.status(200).json({ success: true });
});

module.exports = {
  createUser,
  listUsers,
  updateUser,
  deleteUser,
};
