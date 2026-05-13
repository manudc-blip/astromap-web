import { DateTime } from "luxon";
import type {
  AstroFormState,
  ThemeRequestPayload,
  TransitsRequestPayload,
} from "../types/astromap";

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

const parseCoordinate = (raw: string): number | null => {
  const source = (raw || "").trim();
  if (!source) return null;

  const decimal = Number(source.replace(",", "."));
  if (Number.isFinite(decimal)) return decimal;

  const signFromDir =
    /[SsWwOo]/.test(source) ? -1 : /[NnEe]/.test(source) ? 1 : 0;

  const cleaned = source
    .replace(/,/g, ".")
    .replace(/[NSEWnsewOo]/g, " ")
    .replace(/[°º]/g, " ")
    .replace(/[′']/g, " ")
    .replace(/[″"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;

  const negative = signFromDir < 0 || cleaned.startsWith("-");
  const tokens = cleaned
    .replace(/^[+-]/, "")
    .split(" ")
    .filter(Boolean)
    .map(Number);

  if (!tokens.length || tokens.some((n) => !Number.isFinite(n))) {
    return null;
  }

  const [deg, min = 0, sec = 0] = tokens;
  const value = Math.abs(deg) + min / 60 + sec / 3600;

  return negative ? -value : value;
};

export const buildBackendLocalDateTime = (
  form: AstroFormState
): string => {
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

export const buildBackendTransitDateTime = (
  form: AstroFormState
): string => {
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

export const buildThemeRequestPayload = (
  form: AstroFormState
): ThemeRequestPayload => {
  const latitude = parseCoordinate(form.latitude);
  const longitude = parseCoordinate(form.longitude);

  if (latitude === null || longitude === null) {
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

export const buildTransitsRequestPayload = (
  form: AstroFormState
): TransitsRequestPayload => {
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