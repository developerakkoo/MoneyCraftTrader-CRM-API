const mongoose = require("mongoose");

const HttpError = require("../utils/httpError");
const {
  Webinar,
  WEBINAR_MODES,
  WEBINAR_PLATFORMS,
  WEBINAR_STATUSES,
} = require("../models/webinar.model");

const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ALLOWED_MUTATION_FIELDS = [
  "title",
  "description",
  "speakerName",
  "eventDate",
  "startTime",
  "timezone",
  "durationMinutes",
  "mode",
  "platform",
  "webinarLink",
  "location",
  "maxAttendees",
  "isActive",
  "status",
];

const normalizeText = (value) => (typeof value === "string" ? value.trim() : value);
const normalizeBoolean = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return value;
};

const pickAllowedFields = (payload) =>
  ALLOWED_MUTATION_FIELDS.reduce((result, key) => {
    if (payload[key] !== undefined) {
      result[key] = payload[key];
    }
    return result;
  }, {});

const ensureValidDate = (value, fieldName) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${fieldName} must be a valid date`);
  }

  return date;
};

const validateModeSpecificFields = ({ mode, platform, webinarLink, location }) => {
  if (mode === "ONLINE") {
    if (!platform) {
      throw new HttpError(400, "Platform is required for online webinars");
    }

    if (!WEBINAR_PLATFORMS.includes(platform)) {
      throw new HttpError(400, "Invalid webinar platform");
    }

    if (!webinarLink) {
      throw new HttpError(400, "Webinar link is required for online webinars");
    }

    return;
  }

  if (mode === "OFFLINE" && !location) {
    throw new HttpError(400, "Location is required for offline webinars");
  }
};

const validatePayload = (payload, { partial = false } = {}) => {
  const normalized = {
    ...payload,
    title: normalizeText(payload.title),
    description: normalizeText(payload.description),
    speakerName: normalizeText(payload.speakerName),
    startTime: normalizeText(payload.startTime),
    timezone: normalizeText(payload.timezone),
    mode: normalizeText(payload.mode),
    platform: normalizeText(payload.platform),
    webinarLink: normalizeText(payload.webinarLink),
    location: normalizeText(payload.location),
    isActive: normalizeBoolean(payload.isActive),
    status: normalizeText(payload.status),
  };

  if (!partial || normalized.title !== undefined) {
    if (!normalized.title) {
      throw new HttpError(400, "Webinar title is required");
    }
  }

  if (!partial || normalized.eventDate !== undefined) {
    normalized.eventDate = ensureValidDate(normalized.eventDate, "Event date");
  }

  if (!partial || normalized.startTime !== undefined) {
    if (!normalized.startTime || !TIME_24H_REGEX.test(normalized.startTime)) {
      throw new HttpError(400, "Start time must be in HH:mm format");
    }
  }

  if (!partial || normalized.durationMinutes !== undefined) {
    const duration = Number(normalized.durationMinutes);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new HttpError(400, "Duration must be a positive number");
    }
    normalized.durationMinutes = duration;
  }

  if (!partial || normalized.mode !== undefined) {
    if (!WEBINAR_MODES.includes(normalized.mode)) {
      throw new HttpError(400, "Invalid webinar mode");
    }
  }

  if (normalized.status !== undefined && !WEBINAR_STATUSES.includes(normalized.status)) {
    throw new HttpError(400, "Invalid webinar status");
  }

  if (normalized.maxAttendees !== undefined && normalized.maxAttendees !== null) {
    const maxAttendees = Number(normalized.maxAttendees);
    if (!Number.isFinite(maxAttendees) || maxAttendees <= 0) {
      throw new HttpError(400, "Max attendees must be a positive number");
    }
    normalized.maxAttendees = maxAttendees;
  }

  if (normalized.isActive !== undefined && typeof normalized.isActive !== "boolean") {
    throw new HttpError(400, "isActive must be a boolean value");
  }

  const effectiveMode = normalized.mode ?? payload.currentMode;
  if (effectiveMode) {
    validateModeSpecificFields({
      mode: effectiveMode,
      platform: normalized.platform ?? payload.currentPlatform,
      webinarLink: normalized.webinarLink ?? payload.currentWebinarLink,
      location: normalized.location ?? payload.currentLocation,
    });
  }

  if (effectiveMode === "OFFLINE") {
    normalized.platform = null;
    normalized.webinarLink = "";
  }

  if (effectiveMode === "ONLINE") {
    normalized.location = normalized.location || "";
  }

  return normalized;
};

const buildFilters = (query) => {
  const filters = {};

  if (query.status && WEBINAR_STATUSES.includes(query.status)) {
    filters.status = query.status;
  }

  if (query.mode && WEBINAR_MODES.includes(query.mode)) {
    filters.mode = query.mode;
  }

  if (query.platform && WEBINAR_PLATFORMS.includes(query.platform)) {
    filters.platform = query.platform;
  }

  if (query.isActive !== undefined) {
    const normalizedIsActive = normalizeBoolean(query.isActive);
    if (typeof normalizedIsActive === "boolean") {
      filters.isActive = normalizedIsActive;
    }
  }

  if (query.dateFrom || query.dateTo) {
    filters.eventDate = {};

    if (query.dateFrom) {
      filters.eventDate.$gte = ensureValidDate(query.dateFrom, "dateFrom");
    }

    if (query.dateTo) {
      filters.eventDate.$lte = ensureValidDate(query.dateTo, "dateTo");
    }
  }

  if (query.search) {
    const searchRegex = new RegExp(query.search.trim(), "i");
    filters.$or = [{ title: searchRegex }, { speakerName: searchRegex }];
  }

  return filters;
};

const buildSort = (sortBy = "eventDate", sortOrder = "asc") => {
  const allowedSortFields = ["eventDate", "createdAt", "updatedAt", "title"];
  const field = allowedSortFields.includes(sortBy) ? sortBy : "eventDate";
  const order = sortOrder === "desc" ? -1 : 1;

  return { [field]: order, startTime: order };
};

const ensureValidId = (id, label = "webinar id") => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new HttpError(400, `Invalid ${label}`);
  }
};

const getWebinarByIdOrThrow = async (webinarId) => {
  ensureValidId(webinarId);

  const webinar = await Webinar.findById(webinarId)
    .populate("createdBy", "name email")
    .populate("updatedBy", "name email");

  if (!webinar) {
    throw new HttpError(404, "Webinar not found");
  }

  return webinar;
};

const ensureSingleActiveWebinar = async (webinarId, actorId) => {
  const filters = {
    isActive: true,
  };

  if (webinarId) {
    filters._id = { $ne: webinarId };
  }

  await Webinar.updateMany(filters, {
    $set: {
      isActive: false,
      updatedBy: actorId,
    },
  });
};

const saveWebinarWithActiveGuard = async (webinar) => {
  try {
    await webinar.save();
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.isActive) {
      throw new HttpError(409, "Another webinar is already active. Please try again.");
    }

    throw error;
  }
};

const createWebinar = async (payload, actorId) => {
  const validatedPayload = validatePayload(payload);

  if (validatedPayload.isActive === true) {
    await ensureSingleActiveWebinar(null, actorId);
  }

  const webinar = new Webinar({
    ...validatedPayload,
    createdBy: actorId,
    updatedBy: actorId,
  });

  await saveWebinarWithActiveGuard(webinar);

  return getWebinarByIdOrThrow(webinar._id);
};

const listWebinars = async (query) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const filters = buildFilters(query);
  const sort = buildSort(query.sortBy, query.sortOrder);

  const [items, total] = await Promise.all([
    Webinar.find(filters)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit),
    Webinar.countDocuments(filters),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const updateWebinar = async (webinarId, payload, actorId) => {
  const webinar = await getWebinarByIdOrThrow(webinarId);
  const validatedPayload = validatePayload(
    {
      ...payload,
      currentMode: webinar.mode,
      currentPlatform: webinar.platform,
      currentWebinarLink: webinar.webinarLink,
      currentLocation: webinar.location,
    },
    { partial: true }
  );

  Object.assign(webinar, pickAllowedFields(validatedPayload), { updatedBy: actorId });

  if (validatedPayload.isActive === true) {
    await ensureSingleActiveWebinar(webinar._id, actorId);
  }

  await saveWebinarWithActiveGuard(webinar);

  return getWebinarByIdOrThrow(webinarId);
};

const updateWebinarStatus = async (webinarId, status, actorId) => {
  if (!WEBINAR_STATUSES.includes(status)) {
    throw new HttpError(400, "Invalid webinar status");
  }

  const webinar = await getWebinarByIdOrThrow(webinarId);
  webinar.status = status;
  webinar.updatedBy = actorId;
  await webinar.save();

  return getWebinarByIdOrThrow(webinarId);
};

module.exports = {
  WEBINAR_MODES,
  WEBINAR_PLATFORMS,
  WEBINAR_STATUSES,
  createWebinar,
  getWebinarByIdOrThrow,
  listWebinars,
  updateWebinar,
  updateWebinarStatus,
};
