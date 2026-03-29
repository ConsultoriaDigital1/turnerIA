// Aca junto helpers de fechas para no repetir formato en cada pantalla.

const SHORT_MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function pad(value) {
  return String(value).padStart(2, "0");
}

function getPartValue(parts, type) {
  return parts.find((part) => part.type === type)?.value || "";
}

export function formatShortSpanishDate(value) {
  if (typeof value !== "string") {
    return "";
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return `${pad(day)} ${SHORT_MONTHS_ES[month - 1] || ""}`.trim();
}

export function getZonedDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  return {
    year: getPartValue(parts, "year"),
    month: getPartValue(parts, "month"),
    day: getPartValue(parts, "day"),
    hour: getPartValue(parts, "hour"),
    minute: getPartValue(parts, "minute")
  };
}

export function getDateKeyInTimeZone(date, timeZone) {
  const parts = getZonedDateParts(date, timeZone);

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getTimeLabelInTimeZone(date, timeZone) {
  const parts = getZonedDateParts(date, timeZone);

  return `${parts.hour}:${parts.minute}`;
}

export function shiftDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  utcDate.setUTCDate(utcDate.getUTCDate() + days);

  return `${utcDate.getUTCFullYear()}-${pad(utcDate.getUTCMonth() + 1)}-${pad(utcDate.getUTCDate())}`;
}
