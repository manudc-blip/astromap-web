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

const PLANET_LABELS_FR: Record<string, string> = {
  Soleil: "Soleil",
  Sun: "Soleil",
  Lune: "Lune",
  Moon: "Lune",
  Mercure: "Mercure",
  Mercury: "Mercure",
  Vénus: "Vénus",
  Venus: "Vénus",
  Mars: "Mars",
  Jupiter: "Jupiter",
  Saturne: "Saturne",
  Saturn: "Saturne",
  Uranus: "Uranus",
  Neptune: "Neptune",
  Pluton: "Pluton",
  Pluto: "Pluton",
};

const PLANET_LABELS_EN: Record<string, string> = {
  Soleil: "Sun",
  Sun: "Sun",
  Lune: "Moon",
  Moon: "Moon",
  Mercure: "Mercury",
  Mercury: "Mercury",
  Vénus: "Venus",
  Venus: "Venus",
  Mars: "Mars",
  Jupiter: "Jupiter",
  Saturne: "Saturn",
  Saturn: "Saturn",
  Uranus: "Uranus",
  Neptune: "Neptune",
  Pluton: "Pluto",
  Pluto: "Pluto",
};

function norm360(v: number) {
  return ((v % 360) + 360) % 360;
}

function cleanPlanetName(name?: string) {
  return String(name || "")
    .replace(/\s*\(.*?\)\s*/g, "")
    .trim();
}

function planetColor(name?: string) {
  const k = cleanPlanetName(name).toLowerCase();

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

function aspectLabel(type: string = "", language: UiLanguage) {
  const t = (type || "").toUpperCase();

  const fr: Record<string, string> = {
    CONJ: "Conjonction",
    OPP: "Opposition",
    TRI: "Trigone",
    SQR: "Carré",
    SEX: "Sextile",
  };

  const en: Record<string, string> = {
    CONJ: "Conjunction",
    OPP: "Opposition",
    TRI: "Trine",
    SQR: "Square",
    SEX: "Sextile",
  };

  return (language === "en" ? en : fr)[t] || t;
}

function localizePlanetName(name: string, language: UiLanguage) {
  return (language === "en" ? PLANET_LABELS_EN : PLANET_LABELS_FR)[name] || name;
}

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function degToDmsStr(
  valueRaw: unknown,
  opts?: { showSign?: boolean; normalize?: boolean }
) {
  const valueNum = toFiniteNumber(valueRaw);
  if (valueNum === null) return "";

  const showSign = !!opts?.showSign;
  const normalize = !!opts?.normalize;

  let value = valueNum;
  if (normalize) value = norm360(value);

  const sign = value < 0 ? "-" : "+";
  const abs = Math.abs(value);

  let deg = Math.floor(abs);
  let min = Math.round((abs - deg) * 60);

  if (min >= 60) {
    deg += 1;
    min = 0;
  }

  const prefix = showSign ? sign : "";
  return `${prefix}${deg}°${String(min).padStart(2, "0")}'`;
}

function zodiacPositionText(lonRaw: unknown, language: UiLanguage) {
  const lon = toFiniteNumber(lonRaw);
  if (lon === null) return "";

  const signs = language === "en" ? EN_SIGNS : FR_SIGNS;
  const n = norm360(lon);
  const signIndex = Math.floor(n / 30);
  const inSign = n % 30;
  const sign = signs[signIndex] || "";

  return `${degToDmsStr(inSign)} ${sign}`;
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
      if (raw.toUpperCase().startsWith("R") || raw === "1") {
        retro = true;
        break;
      }
    }
  }

  if (!retro) {
    const dm = Number(planet.daily_motion);
    if (!Number.isNaN(dm) && dm < 0) retro = true;
  }

  if (!retro) return null;
  return language === "en" ? "Retrograde" : "Rétrograde";
}

function getRhythmSign(
  declRaw: unknown,
  lonRaw: unknown,
  language: UiLanguage
): string | null {
  const decl = toFiniteNumber(declRaw);
  const lon = toFiniteNumber(lonRaw);
  if (decl === null || lon === null) return null;

  try {
    const EPS = 23.4392911;

    let s = Math.sin((decl * Math.PI) / 180) / Math.sin((EPS * Math.PI) / 180);
    s = Math.max(-1, Math.min(1, s));

    let lam1 = (Math.asin(s) * 180) / Math.PI;
    lam1 = norm360(lam1);
    const lam2 = norm360(180 - lam1);

    const angDist = (a: number, b: number) => {
      const diff = Math.abs(a - b) % 360;
      return diff <= 180 ? diff : 360 - diff;
    };

    const lam = angDist(norm360(lon), lam1) <= angDist(norm360(lon), lam2) ? lam1 : lam2;
    const idx = Math.floor(lam / 30) % 12;

    return (language === "en" ? EN_SIGNS : FR_SIGNS)[idx] || null;
  } catch {
    return null;
  }
}

function resolveHouseInfo(payload: ChartPayload | null, planet: PlanetPayload) {
  let houseNum = planet.house;
  let housePos =
    (planet as any).house_pos_deg ??
    (planet as any).pos_maison_deg ??
    (planet as any).house_pos;

  let isDomitudeHouse = false;

  const domList =
    (payload as any)?.domitudes ||
    (payload as any)?.domitude ||
    (payload as any)?.dom;

  if (Array.isArray(domList)) {
    const planetName = planet.name;
    const found = domList.find((item: any) => {
      const n = item?.planete || item?.planet || item?.name;
      return n === planetName;
    });

    if (found) {
      if (found.maison != null) {
        houseNum = found.maison;
        isDomitudeHouse = true;
      }
      if (found.pos_maison_deg != null) {
        housePos = found.pos_maison_deg;
        isDomitudeHouse = true;
      }
    }
  }

  return { houseNum, housePos, isDomitudeHouse };
}

function buildAspectLines(
  payload: ChartPayload | null,
  selectedPlanet: string,
  language: UiLanguage
) {
  const aspects = (payload?.aspects || []) as AspectPayload[];
  const tmp: { orbAbs: number; line: string }[] = [];

  for (const asp of aspects) {
    const p1 = asp.p1 || "";
    const p2 = asp.p2 || "";
    if (p1 !== selectedPlanet && p2 !== selectedPlanet) continue;

    const other = p1 === selectedPlanet ? p2 : p1;
    const otherDisp = localizePlanetName(other, language);
    const label = aspectLabel(asp.type, language);

    const orbNum = Number(asp.orb);
    const orbTxt = degToDmsStr(asp.orb);
    const orbAbs = Number.isFinite(orbNum) ? Math.abs(orbNum) : 9999;

    const line =
      language === "en"
        ? `• ${label} ${otherDisp} (orb ${orbTxt})`
        : `• ${label} ${otherDisp} (orbe ${orbTxt})`;

    tmp.push({ orbAbs, line });
  }

  tmp.sort((a, b) => a.orbAbs - b.orbAbs);
  return tmp.map((x) => x.line);
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
  const emptyText = language === "en" ? "Click a planet." : "Cliquez sur une planète.";

  if (!payload || !selectedPlanet) {
    return { emptyText };
  }

  const planets = (payload.planets || []) as PlanetPayload[];
  const planet = planets.find((p) => p.name === selectedPlanet);

  if (!planet) {
    return { emptyText };
  }

  let title = localizePlanetName(String(planet.name || selectedPlanet), language);
  if (origin === "transits") {
    title += language === "en" ? " (Transit)" : " (Transit)";
  }

  const color = planetColor(title);

  // ===== Position =====
  const positionLines: string[] = [];

  const signText = zodiacPositionText(planet.lon, language);
  if (signText) {
    positionLines.push(signText);
  }

  const { houseNum, housePos, isDomitudeHouse } = resolveHouseInfo(payload, planet);

  if (houseNum != null && String(houseNum).trim() !== "") {
    const houseLabel = language === "en" ? "House" : "Maison";
    const suffix = isDomitudeHouse ? " (domitude)" : "";

    if (housePos != null) {
      positionLines.push(
        `${degToDmsStr(housePos)} ${houseLabel} ${parseInt(String(houseNum), 10)}${suffix}`
      );
    } else {
      positionLines.push(
        `${houseLabel} ${parseInt(String(houseNum), 10)}${suffix}`
      );
    }
  }

  // ===== Aspects =====
  const aspectLines = buildAspectLines(payload, selectedPlanet, language);
  const aspects =
    aspectLines.length > 0
      ? aspectLines.join("\n")
      : language === "en"
      ? "No major aspects"
      : "Pas d’aspects majeurs";

  // ===== Éphémérides =====
  const lon = toFiniteNumber(planet.lon);
  const latEcl = toFiniteNumber((planet as any).lat);
  const decl =
    toFiniteNumber((planet as any).decl) ??
    toFiniteNumber((planet as any).dec) ??
    toFiniteNumber((planet as any).declination);
  const ra = toFiniteNumber((planet as any).ra);
  const height =
    toFiniteNumber((planet as any).height) ??
    toFiniteNumber((planet as any).alt);
  const azimut =
    toFiniteNumber((planet as any).azimut) ??
    toFiniteNumber((planet as any).azimuth);
  const dailyMotion = toFiniteNumber((planet as any).daily_motion);

  const ephLines: string[] = [];

  if (dailyMotion !== null) {
    ephLines.push(
      language === "en"
        ? `Motion: ${degToDmsStr(dailyMotion, { showSign: true })}/day`
        : `Mouvement : ${degToDmsStr(dailyMotion, { showSign: true })}/j`
    );
  }

  if (lon !== null) {
    ephLines.push(
      language === "en"
        ? `Ecl. lon: ${degToDmsStr(lon, { normalize: true })}`
        : `Lon. écl. : ${degToDmsStr(lon, { normalize: true })}`
    );
  }

  if (latEcl !== null) {
    ephLines.push(
      language === "en"
        ? `Ecl. lat: ${degToDmsStr(latEcl, { showSign: true })}`
        : `Lat. écl. : ${degToDmsStr(latEcl, { showSign: true })}`
    );
  }

  if (decl !== null) {
    ephLines.push(
      language === "en"
        ? `Declination: ${degToDmsStr(decl, { showSign: true })}`
        : `Déclinaison : ${degToDmsStr(decl, { showSign: true })}`
    );

    const rhythm = getRhythmSign(decl, lon, language);
    if (rhythm) {
      ephLines.push(
        language === "en"
          ? `            (${rhythm} rhythm)`
          : `            (rythme ${rhythm})`
      );
    }
  }

  if (ra !== null) {
    ephLines.push(
      language === "en"
        ? `RA: ${degToDmsStr(ra, { normalize: true })}`
        : `AD : ${degToDmsStr(ra, { normalize: true })}`
    );
  }

  if (height !== null) {
    ephLines.push(
      language === "en"
        ? `Alt: ${degToDmsStr(height, { showSign: true })}`
        : `Hauteur : ${degToDmsStr(height, { showSign: true })}`
    );
  }

  if (azimut !== null) {
    ephLines.push(
      language === "en"
        ? `Az: ${degToDmsStr(azimut, { normalize: true })}`
        : `Azimut : ${degToDmsStr(azimut, { normalize: true })}`
    );
  }

  const retro = retroText(planet, language);
  if (retro && !ephLines.includes(retro)) {
    ephLines.push(retro);
  }

  if (origin === "transits" && ephLines.length === 0) {
    ephLines.push(
      language === "en"
        ? "Transit data available."
        : "Données de transit disponibles."
    );
  }

  return {
    title,
    color,
    position: positionLines.join("\n").trim(),
    aspects,
    ephemeris: ephLines.join("\n").trim(),
    emptyText,
  };
}
