import type {
  AspectPayload,
  ChartPayload,
  DetailOrigin,
  PlanetDetails,
  PlanetPayload,
  UiLanguage,
} from "../types/astromap";

const FR_SIGNS = [
  "Bélier",
  "Taureau",
  "Gémeaux",
  "Cancer",
  "Lion",
  "Vierge",
  "Balance",
  "Scorpion",
  "Sagittaire",
  "Capricorne",
  "Verseau",
  "Poissons",
];

const EN_SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

function norm360(v: number) {
  return ((v % 360) + 360) % 360;
}

function orbToText(value: unknown) {
  const n = Number(value);
  if (Number.isNaN(n)) return "";
  const abs = Math.abs(n);
  const deg = Math.floor(abs);
  const min = Math.round((abs - deg) * 60);
  return `${deg}°${String(min).padStart(2, "0")}'`;
}

function longToSignText(lonRaw: unknown, language: UiLanguage) {
  const lon = Number(lonRaw);
  if (Number.isNaN(lon)) return "";
  const signs = language === "en" ? EN_SIGNS : FR_SIGNS;
  const n = norm360(lon);
  const signIndex = Math.floor(n / 30);
  const inSign = n % 30;
  const deg = Math.floor(inSign);
  const min = Math.round((inSign - deg) * 60);
  const sign = signs[signIndex] || "";
  return `${sign} ${deg}°${String(min).padStart(2, "0")}'`;
}

function planetColor(name?: string) {
  const k = (name || "").toLowerCase().trim();
  const ORANGE = "#d98200";
  const RED = "#cc2b2b";
  const BLUE = "#2f6fff";
  const GREY = "#666666";

  const mapping: Record<string, string> = {
    soleil: ORANGE,
    sun: ORANGE,
    mercure: ORANGE,
    mercury: ORANGE,
    "vénus": ORANGE,
    venus: ORANGE,
    lune: GREY,
    moon: GREY,
    mars: RED,
    jupiter: RED,
    saturne: RED,
    saturn: RED,
    uranus: BLUE,
    neptune: BLUE,
    pluton: BLUE,
    pluto: BLUE,
  };

  return mapping[k] || ORANGE;
}

function aspectLabel(type?: string, language: UiLanguage) {
  const t = (type || "").toUpperCase();
  const fr: Record<string, string> = {
    CONJ: "conjonction",
    OPP: "opposition",
    SQR: "carré",
    TRI: "trigone",
    SEX: "sextile",
  };
  const en: Record<string, string> = {
    CONJ: "conjunction",
    OPP: "opposition",
    SQR: "square",
    TRI: "trine",
    SEX: "sextile",
  };
  return (language === "en" ? en : fr)[t] || t;
}

function retroText(planet: PlanetPayload, language: UiLanguage) {
  const candidates = [planet.retro, planet.retrograde, planet.rflag];
  let retro = false;

  for (const raw of candidates) {
    if (typeof raw === "boolean") {
      retro = raw;
      break;
    }
    if (typeof raw === "number") {
      retro = raw !== 0;
      break;
    }
    if (typeof raw === "string") {
      if (raw.toUpperCase().startsWith("R")) {
        retro = true;
        break;
      }
      if (raw === "1") {
        retro = true;
        break;
      }
    }
  }

  if (!retro) {
    const dm = Number(planet.daily_motion);
    if (!Number.isNaN(dm) && dm < 0) {
      retro = true;
    }
  }

  if (!retro) return null;
  return language === "en" ? "Retrograde" : "Rétrograde";
}

function buildAspectLines(
  payload: ChartPayload | null,
  selectedPlanet: string,
  language: UiLanguage
) {
  const aspects = (payload?.aspects || []) as AspectPayload[];
  const lines: string[] = [];

  for (const asp of aspects) {
    const p1 = asp.p1 || "";
    const p2 = asp.p2 || "";
    if (p1 !== selectedPlanet && p2 !== selectedPlanet) continue;

    const other = p1 === selectedPlanet ? p2 : p1;
    const label = aspectLabel(asp.type, language);
    const orb = orbToText(asp.orb);

    lines.push(orb ? `${other} — ${label} (${orb})` : `${other} — ${label}`);
  }

  return lines;
}

export function getPlanetNames(payload: ChartPayload | null) {
  return ((payload?.planets || []) as PlanetPayload[])
    .map((p) => p.name || "")
    .filter(Boolean);
}

export function buildPlanetDetails(
  payload: ChartPayload | null,
  selectedPlanet: string | null,
  language: UiLanguage,
  origin: DetailOrigin
): PlanetDetails | null {
  if (!payload) {
    return {
      emptyText: language === "en" ? "Click a planet." : "Clique sur une planète.",
    };
  }

  if (!selectedPlanet) {
    return {
      emptyText: language === "en" ? "Click a planet." : "Clique sur une planète.",
    };
  }

  const planets = (payload.planets || []) as PlanetPayload[];
  const planet = planets.find((p) => p.name === selectedPlanet);

  if (!planet) {
    return {
      emptyText: language === "en" ? "Click a planet." : "Clique sur une planète.",
    };
  }

  let title = String(planet.name || selectedPlanet);
  if (origin === "transits") {
    title += " (Transit)";
  }

  const color = planetColor(title);

  const positionLines: string[] = [];
  const signText = longToSignText(planet.lon, language);
  if (signText) {
    positionLines.push(signText);
  }

  const house = planet.house;
  if (house !== undefined && house !== null && String(house).trim() !== "") {
    positionLines.push(
      language === "en" ? `House ${house}` : `Maison ${house}`
    );
  }

  const aspectLines = buildAspectLines(payload, selectedPlanet, language);
  const aspectsText =
    aspectLines.length > 0
      ? aspectLines.join("\n")
      : language === "en"
      ? "No major aspects"
      : "Pas d’aspects majeurs";

  const ephemerisLines: string[] = [];
  const dm = Number(planet.daily_motion);
  if (!Number.isNaN(dm)) {
    ephemerisLines.push(
      language === "en"
        ? `Daily motion: ${dm.toFixed(4)}`
        : `Mouvement journalier : ${dm.toFixed(4)}`
    );
  }

  const retro = retroText(planet, language);
  if (retro) ephemerisLines.push(retro);

  const decl = Number(planet.declination);
  if (!Number.isNaN(decl)) {
    ephemerisLines.push(
      language === "en"
        ? `Declination: ${decl.toFixed(2)}`
        : `Déclinaison : ${decl.toFixed(2)}`
    );
  }

  if (origin === "transits" && ephemerisLines.length === 0) {
    ephemerisLines.push(
      language === "en"
        ? "Transit data available."
        : "Données de transit disponibles."
    );
  }

  return {
    title,
    color,
    position: positionLines.join("\n").trim(),
    aspects: aspectsText,
    ephemeris: ephemerisLines.join("\n").trim(),
    emptyText: language === "en" ? "Click a planet." : "Clique sur une planète.",
  };
}