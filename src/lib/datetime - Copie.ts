import { DateTime } from "luxon";
import type { AstroFormState, ThemeRequestPayload, TransitsRequestPayload } from "../types/astromap";

const pad2 = (v: string | number) => String(v).padStart(2, "0");

const normalizeLuxonZone = (tz: string) => {
  const trimmed = (tz || "").trim();
  if (!trimmed) return "Europe/Paris";
  if (/^[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return `UTC${trimmed}`;
  }
  return trimmed;
};

const assertDateParts = (day: string, month: string, year: string) => {
  if (!day || !month || !year) {
    throw new Error("Veuillez compléter la date.");
  }
};

const assertTimeParts = (hour: string, minute: string) => {
  if (!hour || !minute) {
    throw new Error("Veuillez compléter l’heure.");
  }
};

export const buildBackendLocalDateTime = (form: AstroFormState): string => {
  assertDateParts(form.day, form.month, form.year);
  assertTimeParts(form.hour, form.minute);

  const zone = normalizeLuxonZone(form.tz);
  const year = Number(form.year);
  const month = Number(form.month);
  const day = Number(form.day);
  const hour = Number(form.hour);
  const minute = Number(form.minute);

  let dt: DateTime;

  if (form.timeRef === "TU") {
    dt = DateTime.fromObject(
      { year, month, day, hour, minute },
      { zone: "utc" }
    ).setZone(zone);
  } else {
    dt = DateTime.fromObject(
      { year, month, day, hour, minute },
      { zone }
    );
  }

  if (!dt.isValid) {
    throw new Error("Date ou heure invalide.");
  }

  return dt.toFormat("yyyy-LL-dd HH:mm");
};

export const buildBackendTransitDateTime = (form: AstroFormState): string => {
  assertDateParts(form.transitDay, form.transitMonth, form.transitYear);

  const zone = normalizeLuxonZone(form.tz);
  const dt = DateTime.fromObject(
    {
      year: Number(form.transitYear),
      month: Number(form.transitMonth),
      day: Number(form.transitDay),
      hour: 12,
      minute: 0,
    },
    { zone }
  );

  if (!dt.isValid) {
    throw new Error("Date de transit invalide.");
  }

  return dt.toFormat("yyyy-LL-dd HH:mm");
};

export const buildThemeRequestPayload = (form: AstroFormState): ThemeRequestPayload => {
  const latitude = Number(form.latitude.replace(",", "."));
  const longitude = Number(form.longitude.replace(",", "."));

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    throw new Error("Latitude / longitude invalides.");
  }

  return {
    name: form.name.trim(),
    datetime_local: buildBackendLocalDateTime(form),
    latitude,
    longitude,
    tz: form.tz.trim(),
    settings: {
      house_system: "Placidus",
      language: form.language,
    },
  };
};

export const buildTransitsRequestPayload = (form: AstroFormState): TransitsRequestPayload => {
  return {
    ...buildThemeRequestPayload(form),
    transit_datetime_local: buildBackendTransitDateTime(form),
    aspect_mode: form.transitAspectMode,
  };
};

export const createDefaultFormState = (): AstroFormState => {
  const now = new Date();

  return {
    name: "",

    day: pad2(now.getDate()),
    month: pad2(now.getMonth() + 1),
    year: String(now.getFullYear()),

    hour: pad2(now.getHours()),
    minute: pad2(now.getMinutes()),
    timeRef: "HO",

    cityQuery: "",
    latitude: "49.1193",
    longitude: "6.1757",
    tz: "Europe/Paris",

    language: "fr",

    transitDay: pad2(now.getDate()),
    transitMonth: pad2(now.getMonth() + 1),
    transitYear: String(now.getFullYear()),
    transitAspectMode: "TN",
  };
};