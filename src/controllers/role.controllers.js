const Role = require("../models/role.model");
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const { PERMISSIONS } = require("../constants/permissions");

const validatePermissions = (permissions = []) => {
  const allowedPermissions = Object.values(PERMISSIONS);
  const invalidPermissions = permissions.filter(
    (permission) => !allowedPermissions.includes(permission)
  );

  if (invalidPermissions.length > 0) {
    throw new HttpError(400, `Invalid permissions: ${invalidPermissions.join(", ")}`);
  }
};

const listRoles = asyncHandler(async (_req, res) => {
  const roles = await Role.find().sort({ isSystem: -1, name: 1 });

  res.status(200).json({
    success: true,
    data: roles,
  });
});

const createRole = asyncHandler(async (req, res) => {
  const { name, description, permissions } = req.body;

  if (!name || !Array.isArray(permissions)) {
    throw new HttpError(400, "Name and permissions array are required");
  }

  validatePermissions(permissions);

  const existingRole = await Role.findOne({ name: name.trim() });
  if (existingRole) {
    throw new HttpError(409, "Role already exists");
  }

  const role = await Role.create({
    name: name.trim(),
    description: description || "",
    permissions,
    isSystem: false,
  });

  res.status(201).json({
    success: true,
    data: role,
  });
});

const updateRole = asyncHandler(async (req, res) => {
  const { name, description, permissions } = req.body;

  const role = await Role.findById(req.params.id);
  if (!role) {
    throw new HttpError(404, "Role not found");
  }

  if (name !== undefined) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new HttpError(400, "Role name cannot be empty");
    }

    const duplicateRole = await Role.findOne({
      name: trimmedName,
      _id: { $ne: role._id },
    });

    if (duplicateRole) {
      throw new HttpError(409, "Role already exists");
    }

    role.name = trimmedName;
  }

  if (description !== undefined) {
    role.description = description;
  }

  if (permissions !== undefined) {
    if (!Array.isArray(permissions)) {
      throw new HttpError(400, "Permissions must be an array");
    }

    validatePermissions(permissions);
    role.permissions = permissions;
  }

  await role.save();

  res.status(200).json({
    success: true,
    data: role,
  });
});

module.exports = {
  createRole,
  listRoles,
  updateRole,
};
