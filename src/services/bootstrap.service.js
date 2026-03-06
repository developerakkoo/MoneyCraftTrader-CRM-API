const Role = require("../models/role.model");
const User = require("../models/user.model");
const { ROLE_PERMISSIONS, SYSTEM_ROLES } = require("../constants/permissions");

const ensureSystemRoles = async () => {
  const roleNames = Object.keys(ROLE_PERMISSIONS);

  await Promise.all(roleNames.map(async (name) => {
    const existingRole = await Role.findOne({ name });
    if (existingRole) {
      return existingRole;
    }

    return Role.create({
      name,
      permissions: ROLE_PERMISSIONS[name],
      isSystem: true,
      description: `${name} system role`,
    });
  }));
};

const ensureSuperAdmin = async () => {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME || "Super Admin";

  if (!email || !password) {
    return;
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return;
  }

  const superAdminRole = await Role.findOne({ name: SYSTEM_ROLES.SUPER_ADMIN });
  if (!superAdminRole) {
    throw new Error("Super Admin role not found during bootstrap");
  }

  const passwordHash = await User.hashPassword(password);

  await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash,
    role: superAdminRole._id,
  });
};

module.exports = {
  ensureSystemRoles,
  ensureSuperAdmin,
};
