const HttpError = require("../utils/httpError");

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

module.exports = {
  requirePermission,
};
