const PERMISSIONS = {
  LEAD_CREATE: "lead:create",
  LEAD_VIEW: "lead:view",
  LEAD_UPDATE: "lead:update",
  LEAD_ASSIGN: "lead:assign",
  LEAD_NOTE_CREATE: "lead:note:create",
  LEAD_ACTIVITY_VIEW: "lead:activity:view",
  USER_VIEW: "user:view",
  USER_CREATE: "user:create",
  ROLE_VIEW: "role:view",
  ROLE_CREATE: "role:create",
  ROLE_UPDATE: "role:update",
};

const SYSTEM_ROLES = {
  SUPER_ADMIN: "Super Admin",
  SUB_ADMIN: "Sub Admin",
};

const ROLE_PERMISSIONS = {
  [SYSTEM_ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),
  [SYSTEM_ROLES.SUB_ADMIN]: [
    PERMISSIONS.LEAD_VIEW,
    PERMISSIONS.LEAD_UPDATE,
    PERMISSIONS.LEAD_ASSIGN,
    PERMISSIONS.LEAD_NOTE_CREATE,
    PERMISSIONS.LEAD_ACTIVITY_VIEW,
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.ROLE_VIEW,
  ],
};

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  SYSTEM_ROLES,
};
