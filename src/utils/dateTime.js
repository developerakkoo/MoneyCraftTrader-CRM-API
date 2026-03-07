const formatEventDate = (date, timezone = "Asia/Kolkata") =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: timezone,
  }).format(new Date(date));

const formatDateTimeWithTimezone = (date, timezone = "Asia/Kolkata") =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: timezone,
    timeZoneName: "short",
  }).format(new Date(date));

const getTimeZoneDateParts = (date, timezone = "Asia/Kolkata") => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(date)).reduce((result, part) => {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
    return result;
  }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
};

const getTimeZoneOffsetMillis = (date, timezone = "Asia/Kolkata") => {
  const parts = getTimeZoneDateParts(date, timezone);
  const utcFromZoneParts = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return utcFromZoneParts - new Date(date).getTime();
};

const getWebinarStartDateTime = (eventDate, startTime, timezone = "Asia/Kolkata") => {
  const eventParts = getTimeZoneDateParts(eventDate, timezone);
  const [hourString = "00", minuteString = "00"] = String(startTime || "00:00").split(":");
  const hour = Number(hourString);
  const minute = Number(minuteString);
  const utcGuess = new Date(
    Date.UTC(eventParts.year, eventParts.month - 1, eventParts.day, hour, minute, 0)
  );
  const offset = getTimeZoneOffsetMillis(utcGuess, timezone);

  return new Date(utcGuess.getTime() - offset);
};

const formatEventTime = (startTime) => String(startTime || "").trim();

const formatDuration = (durationMinutes) => {
  const duration = Number(durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) {
    return "";
  }

  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;

  if (hours && minutes) {
    return `${hours}h ${minutes}m`;
  }

  if (hours) {
    return `${hours}h`;
  }

  return `${minutes}m`;
};

module.exports = {
  formatDateTimeWithTimezone,
  formatEventTime,
  formatDuration,
  formatEventDate,
  getTimeZoneDateParts,
  getTimeZoneOffsetMillis,
  getWebinarStartDateTime,
};
