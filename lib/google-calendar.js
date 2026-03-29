// Aca concentro toda la integracion con Google Calendar: estado, lectura y alta de eventos.

import { getDateKeyInTimeZone, getTimeLabelInTimeZone, shiftDateKey } from "@/lib/date-format";

function sanitize(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Aca acepto IDs puros, IDs codificados y URLs completas para no depender de un solo formato.
function decodeCalendarId(value) {
  if (!value) {
    return "";
  }

  if (value.includes("@")) {
    return value;
  }

  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);

    return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
  } catch {
    return value;
  }
}

function normalizeCalendarId(value) {
  const sanitized = sanitize(value);

  if (!sanitized) {
    return "";
  }

  if (!sanitized.startsWith("http")) {
    return decodeCalendarId(sanitized);
  }

  try {
    const url = new URL(sanitized);
    const cid = sanitize(url.searchParams.get("cid"));

    return cid ? decodeCalendarId(cid) : sanitized;
  } catch {
    return sanitized;
  }
}

function buildEmbedUrl(calendarId, timezone) {
  if (!calendarId) {
    return "";
  }

  return `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarId)}&ctz=${encodeURIComponent(timezone)}`;
}

function buildOpenUrl(calendarId) {
  if (!calendarId) {
    return "https://calendar.google.com/calendar/u/0/r";
  }

  return `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(calendarId)}`;
}

// Desde aca tomo la configuracion compartida para leer o escribir en Google Calendar desde backend.
function getSharedOAuthConfig() {
  return {
    clientId: sanitize(process.env.GOOGLE_CALENDAR_CLIENT_ID),
    clientSecret: sanitize(process.env.GOOGLE_CALENDAR_CLIENT_SECRET),
    refreshToken: sanitize(process.env.GOOGLE_CALENDAR_REFRESH_TOKEN)
  };
}

function hasSharedOAuthConfig() {
  const config = getSharedOAuthConfig();

  return Boolean(config.clientId && config.clientSecret && config.refreshToken);
}

function buildGoogleCalendarDateTime(date, time) {
  return `${date}T${time}:00`;
}

// Esta parte parsea feeds iCal a mano porque para este caso no necesito otra dependencia.
function unescapeIcsText(value) {
  return sanitize(value)
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function unfoldIcsContent(content) {
  return content.replace(/\r?\n[ \t]/g, "");
}

function parseIcsPropertyLine(line) {
  const separatorIndex = line.indexOf(":");

  if (separatorIndex < 0) {
    return null;
  }

  const left = line.slice(0, separatorIndex);
  const value = line.slice(separatorIndex + 1);
  const [rawKey, ...rawParams] = left.split(";");
  const params = {};

  rawParams.forEach((entry) => {
    const [name, ...rest] = entry.split("=");

    if (!name) {
      return;
    }

    params[name.toUpperCase()] = rest.join("=");
  });

  return {
    key: rawKey.toUpperCase(),
    params,
    value: unescapeIcsText(value)
  };
}

function compactToDateKey(value) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function normalizeTimeValue(value) {
  const digits = value.replace(/[^0-9]/g, "");

  if (digits.length < 4) {
    return "";
  }

  return digits.padEnd(6, "0").slice(0, 6);
}

function parseIcsDateValue(value, params, defaultTimeZone) {
  const rawValue = sanitize(value);

  if (!rawValue) {
    return null;
  }

  const valueType = sanitize(params.VALUE).toUpperCase();
  const timeZone = sanitize(params.TZID) || defaultTimeZone;

  if (valueType === "DATE" || /^\d{8}$/.test(rawValue)) {
    const date = compactToDateKey(rawValue);

    return {
      allDay: true,
      date,
      time: "Todo el dia",
      timeZone,
      sortKey: `${date}T00:00`
    };
  }

  const match = rawValue.match(/^(\d{8})T(\d{4,6})(Z)?$/);

  if (!match) {
    return null;
  }

  const [, datePart, timePartRaw, utcMarker] = match;
  const timePart = normalizeTimeValue(timePartRaw);

  if (!timePart) {
    return null;
  }

  if (utcMarker) {
    const utcDate = new Date(
      Date.UTC(
        Number(datePart.slice(0, 4)),
        Number(datePart.slice(4, 6)) - 1,
        Number(datePart.slice(6, 8)),
        Number(timePart.slice(0, 2)),
        Number(timePart.slice(2, 4)),
        Number(timePart.slice(4, 6))
      )
    );
    const zonedDate = getDateKeyInTimeZone(utcDate, timeZone);
    const zonedTime = getTimeLabelInTimeZone(utcDate, timeZone);

    return {
      allDay: false,
      date: zonedDate,
      time: zonedTime,
      timeZone,
      sortKey: `${zonedDate}T${zonedTime}`
    };
  }

  const date = compactToDateKey(datePart);
  const time = `${timePart.slice(0, 2)}:${timePart.slice(2, 4)}`;

  return {
    allDay: false,
    date,
    time,
    timeZone,
    sortKey: `${date}T${time}`
  };
}

function parseIcsEvents(content, defaultTimeZone) {
  const events = [];
  const lines = unfoldIcsContent(content).split(/\r?\n/);
  let currentEvent = null;

  lines.forEach((line) => {
    if (line === "BEGIN:VEVENT") {
      currentEvent = {};
      return;
    }

    if (line === "END:VEVENT") {
      if (!currentEvent?.DTSTART) {
        currentEvent = null;
        return;
      }

      const start = parseIcsDateValue(
        currentEvent.DTSTART.value,
        currentEvent.DTSTART.params || {},
        defaultTimeZone
      );

      if (!start) {
        currentEvent = null;
        return;
      }

      const end = currentEvent.DTEND
        ? parseIcsDateValue(currentEvent.DTEND.value, currentEvent.DTEND.params || {}, defaultTimeZone)
        : null;
      const title = currentEvent.SUMMARY?.value || "Evento sin titulo";
      const description = currentEvent.DESCRIPTION?.value || "";
      const location = currentEvent.LOCATION?.value || "";
      const status = sanitize(currentEvent.STATUS?.value).toUpperCase() || "CONFIRMED";

      if (status === "CANCELLED") {
        currentEvent = null;
        return;
      }

      events.push({
        id: currentEvent.UID?.value || `${start.date}-${start.time}-${title}`,
        title,
        description,
        location,
        status,
        start,
        end
      });

      currentEvent = null;
      return;
    }

    if (!currentEvent) {
      return;
    }

    const property = parseIcsPropertyLine(line);

    if (!property) {
      return;
    }

    currentEvent[property.key] = property;
  });

  return events;
}

// Con estas utilidades convierto eventos crudos en bloques chicos para la agenda interna.
function buildAgendaDays(baseDate) {
  return [
    {
      id: "day-0",
      label: "Hoy",
      date: baseDate,
      slots: []
    },
    {
      id: "day-1",
      label: "Manana",
      date: shiftDateKey(baseDate, 1),
      slots: []
    }
  ];
}

function getEventDatesForAgenda(event) {
  if (!event.start.allDay) {
    return [event.start.date];
  }

  if (!event.end?.date || event.end.date <= event.start.date) {
    return [event.start.date];
  }

  const dates = [];
  let currentDate = event.start.date;

  while (currentDate < event.end.date && dates.length < 7) {
    dates.push(currentDate);
    currentDate = shiftDateKey(currentDate, 1);
  }

  return dates;
}

function mapEventToSlot(event) {
  const descriptionLine = event.description
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return {
    time: event.start.allDay ? "Todo el dia" : event.start.time,
    patient: event.title,
    doctor: event.location || "Google Calendar",
    type: descriptionLine || (event.start.allDay ? "Evento de dia completo" : "Evento sincronizado"),
    status: event.status === "CONFIRMED" ? "confirmed" : "pending"
  };
}

function parseGoogleApiDateValue(value, defaultTimeZone) {
  if (!value) {
    return null;
  }

  if (typeof value.date === "string") {
    return {
      allDay: true,
      date: value.date,
      time: "Todo el dia",
      timeZone: sanitize(value.timeZone) || defaultTimeZone,
      sortKey: `${value.date}T00:00`
    };
  }

  if (typeof value.dateTime === "string") {
    const date = new Date(value.dateTime);
    const timeZone = sanitize(value.timeZone) || defaultTimeZone;
    const zonedDate = getDateKeyInTimeZone(date, timeZone);
    const zonedTime = getTimeLabelInTimeZone(date, timeZone);

    return {
      allDay: false,
      date: zonedDate,
      time: zonedTime,
      timeZone,
      sortKey: `${zonedDate}T${zonedTime}`
    };
  }

  return null;
}

function parseGoogleApiEvents(items, defaultTimeZone) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => sanitize(item?.status).toLowerCase() !== "cancelled")
    .map((item) => {
      const start = parseGoogleApiDateValue(item.start, defaultTimeZone);

      if (!start) {
        return null;
      }

      return {
        id: sanitize(item.id) || `${start.date}-${start.time}-${sanitize(item.summary)}`,
        title: sanitize(item.summary) || "Evento sin titulo",
        description: sanitize(item.description),
        location: sanitize(item.location),
        status: sanitize(item.status).toUpperCase() || "CONFIRMED",
        start,
        end: parseGoogleApiDateValue(item.end, defaultTimeZone)
      };
    })
    .filter(Boolean);
}

// Desde aca salgo a buscar eventos reales, ya sea por iCal o por Google Calendar API.
async function readEventsFromIcs(icsUrl, timeZone) {
  try {
    const response = await fetch(icsUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000) // Timeout de 5 segundos
    });

    if (!response.ok) {
      throw new Error(`No se pudo leer el feed iCal (${response.status}).`);
    }

    const icsContent = await response.text();
    
    // Si el contenido es sospechosamente grande, abortamos para evitar crash de memoria
    if (icsContent.length > 1024 * 1024) { 
      throw new Error("El archivo de calendario es demasiado grande (>1MB).");
    }

    return parseIcsEvents(icsContent, timeZone);
  } catch (error) {
    console.error("Error leyendo ICS:", error.message);
    return []; // Devolvemos lista vacía en lugar de dejar que el crash propague
  }
}

async function getGoogleAccessToken() {
  const { clientId, clientSecret, refreshToken } = getSharedOAuthConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!response.ok) {
    throw new Error(`No se pudo renovar el token de Google (${response.status}).`);
  }

  const payload = await response.json();
  const accessToken = sanitize(payload?.access_token);

  if (!accessToken) {
    throw new Error("Google no devolvio access_token.");
  }

  return accessToken;
}

async function readEventsFromGoogleApi(calendarId, timeZone) {
  if (!calendarId) {
    throw new Error("Falta GOOGLE_CALENDAR_ID para usar Google Calendar API.");
  }

  const accessToken = await getGoogleAccessToken();
  const timeMin = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 60 * 60 * 60 * 1000).toISOString();
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
  );

  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("timeZone", timeZone);
  url.searchParams.set("maxResults", "100");

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Google Calendar API devolvio ${response.status}.`);
  }

  const payload = await response.json();

  return parseGoogleApiEvents(payload?.items, timeZone);
}

// Aca expongo el estado publico de la integracion para que la UI no tenga que adivinar nada.
export function getGoogleCalendarStatus() {
  const rawCalendarId = sanitize(process.env.GOOGLE_CALENDAR_ID);
  const calendarId = normalizeCalendarId(rawCalendarId);
  const timezone = sanitize(process.env.GOOGLE_CALENDAR_TIMEZONE) || "America/Argentina/Buenos_Aires";
  const explicitEmbedUrl = sanitize(process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_EMBED_URL);
  const explicitOpenUrl = sanitize(process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_OPEN_URL);
  const explicitIcsUrl = sanitize(process.env.GOOGLE_CALENDAR_ICS_URL);
  const sharedOAuth = hasSharedOAuthConfig();
  const embedUrl = explicitEmbedUrl || buildEmbedUrl(calendarId, timezone);
  const openUrl = explicitOpenUrl || (rawCalendarId.startsWith("http") ? rawCalendarId : buildOpenUrl(calendarId));

  return {
    connected: Boolean(embedUrl),
    mode: explicitEmbedUrl
      ? "embed_url"
      : rawCalendarId.startsWith("http")
        ? "calendar_url"
        : calendarId
          ? "calendar_id"
          : "manual",
    calendarId: calendarId || null,
    timezone,
    embedUrl: embedUrl || null,
    openUrl,
    createEventUrl: `https://calendar.google.com/calendar/render?action=TEMPLATE&src=${encodeURIComponent(calendarId || "")}&ctz=${encodeURIComponent(timezone)}`,
    agendaFeedMode: sharedOAuth ? "oauth_refresh_token" : explicitIcsUrl ? "ics_url" : "none",
    agendaFeedUrl: sharedOAuth ? null : explicitIcsUrl || null,
    agendaSharedAccess: sharedOAuth,
    canCreateFromApp: sharedOAuth,
    guidance: {
      easy:
        "La conexion mas simple es pegar el enlace de insercion de Google Calendar o definir el calendar ID en variables de entorno.",
      honest:
        "Si queres que la agenda izquierda sea consistente para todos los usuarios, la mejor salida intermedia es leer Google Calendar desde backend con refresh token compartido."
    }
  };
}

// Aca bajo eventos reales y los traduzco al formato simple que usa la agenda rapida.
export async function getGoogleCalendarAgenda(fallbackCalendar = []) {
  const googleCalendar = getGoogleCalendarStatus();
  const today = getDateKeyInTimeZone(new Date(), googleCalendar.timezone);
  const agendaDays = buildAgendaDays(today);
  const explicitIcsUrl = sanitize(process.env.GOOGLE_CALENDAR_ICS_URL);
  const sourceMode = googleCalendar.agendaFeedMode;

  if (sourceMode === "none") {
    return {
      calendar: Array.isArray(fallbackCalendar) && fallbackCalendar.length > 0 ? fallbackCalendar : agendaDays,
      meta: {
        source: "fallback",
        label: "Demo local",
        note:
          "El embed esta conectado, pero la agenda rapida no puede leer eventos solo con GOOGLE_CALENDAR_ID. Para multiusuario, configura OAuth compartido o usa GOOGLE_CALENDAR_ICS_URL."
      }
    };
  }

  try {
    const events =
      sourceMode === "oauth_refresh_token"
        ? await readEventsFromGoogleApi(googleCalendar.calendarId, googleCalendar.timezone)
        : await readEventsFromIcs(explicitIcsUrl, googleCalendar.timezone);
    const dayMap = new Map(agendaDays.map((day) => [day.date, day]));

    events
      .sort(
        (left, right) =>
          left.start.sortKey.localeCompare(right.start.sortKey) || left.title.localeCompare(right.title)
      )
      .forEach((event) => {
        getEventDatesForAgenda(event).forEach((date) => {
          const day = dayMap.get(date);

          if (!day) {
            return;
          }

          day.slots.push(mapEventToSlot(event));
        });
      });

    agendaDays.forEach((day) => {
      day.slots.sort(
        (left, right) => left.time.localeCompare(right.time) || left.patient.localeCompare(right.patient)
      );
    });

    return {
      calendar: agendaDays,
      meta: {
        source: sourceMode === "oauth_refresh_token" ? "google_api" : "google_ics",
        label: sourceMode === "oauth_refresh_token" ? "Google API" : "Google Calendar",
        note:
          sourceMode === "oauth_refresh_token"
            ? "La agenda rapida esta leyendo Google Calendar desde backend con acceso compartido. Eso la hace mucho mas consistente entre usuarios."
            : "La agenda rapida esta leyendo eventos reales desde tu feed iCal configurado."
      }
    };
  } catch (error) {
    return {
      calendar: agendaDays,
      meta: {
        source: "google_error",
        label: "Sin lectura real",
        note:
          error instanceof Error
            ? `${error.message} Si buscas consistencia multiusuario, usa OAuth compartido en backend o revisa GOOGLE_CALENDAR_ICS_URL.`
            : "No se pudieron leer eventos del calendario. Si buscas consistencia multiusuario, usa OAuth compartido en backend o revisa GOOGLE_CALENDAR_ICS_URL."
      }
    };
  }
}

// Este alta crea un evento real en Google Calendar cuando existe acceso compartido por backend.
export async function createGoogleCalendarEvent(input) {
  const googleCalendar = getGoogleCalendarStatus();

  if (!googleCalendar.agendaSharedAccess) {
    throw new Error(
      "Falta configurar GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET y GOOGLE_CALENDAR_REFRESH_TOKEN para crear eventos desde la app."
    );
  }

  if (!googleCalendar.calendarId) {
    throw new Error("Falta GOOGLE_CALENDAR_ID.");
  }

  const title = sanitize(input?.title);
  const date = sanitize(input?.date);
  const startTime = sanitize(input?.startTime);
  const endTime = sanitize(input?.endTime);
  const location = sanitize(input?.location);
  const description = sanitize(input?.description);

  if (!title || !date || !startTime || !endTime) {
    throw new Error("Titulo, fecha, hora de inicio y hora de fin son obligatorios.");
  }

  if (endTime <= startTime) {
    throw new Error("La hora de fin debe ser mayor que la hora de inicio.");
  }

  const accessToken = await getGoogleAccessToken();
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(googleCalendar.calendarId)}/events`
  );

  url.searchParams.set("sendUpdates", "none");

  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      summary: title,
      description,
      location,
      start: {
        dateTime: buildGoogleCalendarDateTime(date, startTime),
        timeZone: googleCalendar.timezone
      },
      end: {
        dateTime: buildGoogleCalendarDateTime(date, endTime),
        timeZone: googleCalendar.timezone
      }
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = sanitize(payload?.error?.message);

    throw new Error(message || `Google Calendar API devolvio ${response.status} al crear el evento.`);
  }

  const payload = await response.json();

  return {
    id: sanitize(payload?.id),
    htmlLink: sanitize(payload?.htmlLink),
    summary: sanitize(payload?.summary)
  };
}
