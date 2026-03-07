const isDebugEnabled = () => {
  const value = String(process.env.DEBUG_NOTIFICATIONS || "").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
};

const logDebug = (scope, message, meta) => {
  if (!isDebugEnabled()) {
    return;
  }

  if (meta !== undefined) {
    console.log(`[debug:${scope}] ${message}`, meta);
    return;
  }

  console.log(`[debug:${scope}] ${message}`);
};

const logInfo = (scope, message, meta) => {
  if (meta !== undefined) {
    console.log(`[info:${scope}] ${message}`, meta);
    return;
  }

  console.log(`[info:${scope}] ${message}`);
};

const logWarn = (scope, message, meta) => {
  if (meta !== undefined) {
    console.warn(`[warn:${scope}] ${message}`, meta);
    return;
  }

  console.warn(`[warn:${scope}] ${message}`);
};

const logError = (scope, message, meta) => {
  if (meta !== undefined) {
    console.error(`[error:${scope}] ${message}`, meta);
    return;
  }

  console.error(`[error:${scope}] ${message}`);
};

module.exports = {
  logDebug,
  logError,
  logInfo,
  logWarn,
};
