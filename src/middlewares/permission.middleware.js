const HttpError = require("../utils/httpError");
const { SYSTEM_ROLES } = require("../constants/permissions");

const requirePermission = (...permissions) => (req, _res, next) => {
  if (!req.user || !req.user.role) {
    return next(new HttpError(401, "Authentication required"));
  }

  const grantedPermissions = req.user.role.permissions || [];
  const hasPermission = permissions.every((permission) =>
    grantedPermissions.includes(permission)
  );

  if (!hasPermission) {
    return next(new HttpError(403, "Insufficient permissions"));
  }

  return next();
};

const requireSuperAdmin = (req, _res, next) => {
  if (!req.user || !req.user.role) {
    return next(new HttpError(401, "Authentication required"));
  }

  if (req.user.role.name !== SYSTEM_ROLES.SUPER_ADMIN) {
    return next(new HttpError(403, "Only Super Admin can perform this action"));
  }

  return next();
};

module.exports = {
  requirePermission,
  requireSuperAdmin,
};
