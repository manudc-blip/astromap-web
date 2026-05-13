import { DateTime } from "luxon";
import { useEffect, useMemo, useRef, useState } from "react";
import AstroSidebar, {
  type AstroSidebarForm,
  type CoordsDisplayMode,
  type IdentMode,
} from "../components/AstroSidebar";
import { DetailsPanel } from "../components/DetailsPanel";
import {
  buildThemeRequestPayload,
  buildTransitsRequestPayload,
  createDefaultFormState,
} from "../lib/datetime";
import {
  getInterpretationHtml,
  getSvgForTab,
  getThemeJson,
  getTransitsJson,
  getTransitsSvg,
} from "../lib/api";
import { buildPlanetDetails, getPlanetNames } from "../lib/details";
import type {
  AstroFormState,
  ChartPayload,
  DetailOrigin,
  TabKey,
} from "../types/astromap";

const TABS: { key: TabKey; fr: string; en: string }[] = [
  { key: "ecliptic", fr: "Écliptique", en: "Ecliptic" },
  { key: "domitude", fr: "Domitude", en: "Domitude" },
  { key: "ret", fr: "RET / HP", en: "RET / HP" },
  { key: "transits", fr: "Transits", en: "Transits" },
  { key: "aspects", fr: "Aspects", en: "Aspects" },
  { key: "interpretation", fr: "Interprétation", en: "Interpretation" },
];

type CacheState = Partial<Record<TabKey, string>>;

type PageFormState = AstroFormState & {
  transitPanelExpanded: boolean;
};

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function withUiDefaults(base: AstroFormState): PageFormState {
  return {
    ...base,
    timeRef: base.timeRef ?? "HO",
    transitAspectMode: base.transitAspectMode ?? "TN",
    transitDay: base.transitDay ?? base.day ?? "",
    transitMonth: base.transitMonth ?? base.month ?? "",
    transitYear: base.transitYear ?? base.year ?? "",
    transitPanelExpanded: true,
  };
}

function shiftDate(
  source: PageFormState,
  prefix: "" | "transit",
  stepDays: number
): PageFormState {
  const next = { ...source } as PageFormState & Record<string, string | boolean>;
  const dayKey = prefix ? `${prefix}Day` : "day";
  const monthKey = prefix ? `${prefix}Month` : "month";
  const yearKey = prefix ? `${prefix}Year` : "year";

  const day = Number(next[dayKey]);
  const month = Number(next[monthKey]);
  const year = Number(next[yearKey]);

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return source;
  }

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return source;
  }

  date.setDate(date.getDate() + stepDays);

  next[dayKey] = pad2(date.getDate());
  next[monthKey] = pad2(date.getMonth() + 1);
  next[yearKey] = String(date.getFullYear());

  return next as PageFormState;
}

function shiftTime(source: PageFormState, stepMinutes: number): PageFormState {
  const hour = Number(source.hour);
  const minute = Number(source.minute);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return source;
  }

  const date = new Date(2000, 0, 1, hour, minute);
  if (Number.isNaN(date.getTime())) {
    return source;
  }

  date.setMinutes(date.getMinutes() + stepMinutes);

  return {
    ...source,
    hour: pad2(date.getHours()),
    minute: pad2(date.getMinutes()),
  };
}

function shiftDatePart(
  source: PageFormState,
  part: "day" | "month" | "year" | "transitDay" | "transitMonth" | "transitYear",
  step: number
): PageFormState {
  const next = { ...source } as PageFormState & Record<string, string | boolean>;

  const isTransit = part.startsWith("transit");
  const dayKey = (isTransit ? "transitDay" : "day") as keyof typeof next;
  const monthKey = (isTransit ? "transitMonth" : "month") as keyof typeof next;
  const yearKey = (isTransit ? "transitYear" : "year") as keyof typeof next;

  const day = Number(next[dayKey]);
  const month = Number(next[monthKey]);
  const year = Number(next[yearKey]);

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return source;
  }

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return source;
  }

  if (part === "day" || part === "transitDay") {
    date.setDate(date.getDate() + step);
  } else if (part === "month" || part === "transitMonth") {
    date.setMonth(date.getMonth() + step);
  } else {
    date.setFullYear(date.getFullYear() + step);
  }

  next[dayKey] = pad2(date.getDate());
  next[monthKey] = pad2(date.getMonth() + 1);
  next[yearKey] = String(date.getFullYear());

  return next as PageFormState;
}

function shiftTimePart(
  source: PageFormState,
  part: "hour" | "minute",
  step: number
): PageFormState {
  const hour = Number(source.hour);
  const minute = Number(source.minute);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return source;
  }

  const date = new Date(2000, 0, 1, hour, minute);
  if (Number.isNaN(date.getTime())) {
    return source;
  }

  if (part === "hour") {
    date.setHours(date.getHours() + step);
  } else {
    date.setMinutes(date.getMinutes() + step);
  }

  return {
    ...source,
    hour: pad2(date.getHours()),
    minute: pad2(date.getMinutes()),
  };
}

function normalizeLuxonZoneUi(tz: string) {
  const trimmed = (tz || "").trim();
  if (!trimmed) return "Europe/Paris";
  if (/^[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return `UTC${trimmed}`;
  }
  return trimmed;
}

function parseCoordText(raw: string): number | null {
  const source = (raw || "").trim();
  if (!source) return null;

  const decimal = Number(source.replace(",", "."));
  if (Number.isFinite(decimal)) return decimal;

  const signFromDir = /[SsWwOo]/.test(source) ? -1 : /[NnEe]/.test(source) ? 1 : 0;

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
}

function formatCoordDecimal(value: number) {
  const rounded = Math.round(value * 10000) / 10000;
  return String(rounded);
}

function formatCoordDms(value: number) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  let deg = Math.floor(abs);
  let minFloat = (abs - deg) * 60;
  let min = Math.floor(minFloat);
  let sec = Math.round((minFloat - min) * 60);

  if (sec === 60) {
    sec = 0;
    min += 1;
  }
  if (min === 60) {
    min = 0;
    deg += 1;
  }

  return `${sign}${deg}° ${pad2(min)}' ${pad2(sec)}"`;
}

function convertCoordsDisplay(
  source: PageFormState,
  targetMode: CoordsDisplayMode
): PageFormState {
  const lat = parseCoordText(source.latitude);
  const lon = parseCoordText(source.longitude);

  if (lat === null || lon === null) {
    return source;
  }

  return {
    ...source,
    latitude: targetMode === "DMS" ? formatCoordDms(lat) : formatCoordDecimal(lat),
    longitude: targetMode === "DMS" ? formatCoordDms(lon) : formatCoordDecimal(lon),
  };
}

function toggleDisplayedTimeRef(source: PageFormState): PageFormState {
  const zone = normalizeLuxonZoneUi(source.tz);

  const year = Number(source.year);
  const month = Number(source.month);
  const day = Number(source.day);
  const hour = Number(source.hour);
  const minute = Number(source.minute);

  if (![year, month, day, hour, minute].every(Number.isFinite)) {
    return source;
  }

  const base =
    source.timeRef === "HO"
      ? DateTime.fromObject({ year, month, day, hour, minute }, { zone })
      : DateTime.fromObject({ year, month, day, hour, minute }, { zone: "utc" });

  if (!base.isValid) {
    return source;
  }

  const next = source.timeRef === "HO" ? base.toUTC() : base.setZone(zone);

  if (!next.isValid) {
    return source;
  }

  return {
    ...source,
    day: pad2(next.day),
    month: pad2(next.month),
    year: String(next.year),
    hour: pad2(next.hour),
    minute: pad2(next.minute),
    timeRef: source.timeRef === "HO" ? "TU" : "HO",
  };
}

type PlanetMatcher = {
  actualName: string;
  aliases: string[];
};

const PLANET_ALIAS_GROUPS = [
  ["soleil", "sun"],
  ["lune", "moon"],
  ["mercure", "mercury"],
  ["vénus", "venus"],
  ["mars"],
  ["jupiter"],
  ["saturne", "saturn"],
  ["uranus"],
  ["neptune"],
  ["pluton", "pluto"],
];

function buildPlanetMatchers(names: string[]): PlanetMatcher[] {
  return names.map((name) => {
    const key = name.toLowerCase().trim();
    const aliasSet = new Set<string>([key]);

    for (const group of PLANET_ALIAS_GROUPS) {
      if (group.includes(key)) {
        group.forEach((item) => aliasSet.add(item));
      }
    }

    return {
      actualName: name,
      aliases: Array.from(aliasSet),
    };
  });
}

function getElementHints(el: Element) {
  const titleNode = el.querySelector("title");
  return [
    el.getAttribute("id") || "",
    el.getAttribute("class") || "",
    el.getAttribute("data-planet") || "",
    el.getAttribute("data-name") || "",
    el.getAttribute("aria-label") || "",
    el.getAttribute("href") || "",
    el.getAttribute("xlink:href") || "",
    titleNode?.textContent || "",
  ]
    .join(" ")
    .toLowerCase();
}

function findPlanetFromSvgTarget(
  start: Element | null,
  matchers: PlanetMatcher[],
  activeTab: TabKey
): { planet: string; origin: DetailOrigin } | null {
  let node: Element | null = start;

  while (node) {
    const hints = getElementHints(node);

    for (const matcher of matchers) {
      if (matcher.aliases.some((alias) => hints.includes(alias))) {
        const origin: DetailOrigin =
          hints.includes("transit_planet") ||
          hints.includes("transit") ||
          hints.includes("_transit")
            ? "transits"
            : "natal";

        return {
          planet: matcher.actualName,
          origin: activeTab === "transits" ? origin : "natal",
        };
      }
    }

    node = node.parentElement;
  }

  return null;
}

function circDistDeg(a: number, b: number) {
  const d = Math.abs(norm360(a - b));
  return d > 180 ? 360 - d : d;
}

function clickAngleDeg(clientX: number, clientY: number, cx: number, cy: number) {
  const dx = clientX - cx;
  const dy = clientY - cy;
  return norm360((Math.atan2(-dy, dx) * 180) / Math.PI);
}

function norm360(v: number) {
  return ((v % 360) + 360) % 360;
}

const TRANSIT_PERCEPTION_COEFFS: Record<string, number> = {
  Soleil: 1.0,
  Sun: 1.0,
  Lune: 1.0,
  Moon: 1.0,
  Mercure: 1.2,
  Mercury: 1.2,
  Vénus: 1.1,
  Venus: 1.1,
  Mars: 1.05,
  Jupiter: 1.05,
  Saturne: 1.15,
  Saturn: 1.15,
  Uranus: 1.15,
  Neptune: 1.05,
  Pluton: 1.1,
  Pluto: 1.1,
};

function polToXY(cx: number, cy: number, r: number, deg: number) {
  const th = (deg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(th),
    y: cy - r * Math.sin(th),
  };
}

function degFromPx(px: number, r: number) {
  return (px / Math.max(r, 1)) * (180 / Math.PI);
}

function circMean(degs: number[]) {
  const sx = degs.reduce((s, d) => s + Math.cos((d * Math.PI) / 180), 0);
  const sy = degs.reduce((s, d) => s + Math.sin((d * Math.PI) / 180), 0);
  if (sx === 0 && sy === 0) return norm360(degs[0] ?? 0);
  return norm360((Math.atan2(sy, sx) * 180) / Math.PI);
}

function unwrapAround(ref: number, degs: number[]) {
  return degs.map((d) => {
    let x = d;
    while (x - ref >= 180) x -= 360;
    while (x - ref < -180) x += 360;
    return x;
  });
}

function toScreenAngle(lonRaw: unknown, ascRaw: unknown) {
  const lon = Number(lonRaw);
  const asc = Number(ascRaw);
  if (!Number.isFinite(lon) || !Number.isFinite(asc)) return null;
  return norm360(lon - asc + 180);
}

function findTransitPlanetByPackedFallback(args: {
  host: HTMLDivElement;
  event: MouseEvent;
  themePayload: ChartPayload | null;
  transitsPayload: ChartPayload | null;
}) {
  const { host, event, themePayload, transitsPayload } = args;

  const svg = host.querySelector("svg");
  const rect = (svg || host).getBoundingClientRect();

  const w = rect.width;
  const h = rect.height;
  const cx = rect.left + w / 2;
  const cy = rect.top + h / 2;

  const margin = 30;
  const size0 = Math.min(w, h) - 2 * margin;
  const size = size0 * 0.8;

  const rOuter = size * 0.36;
  const pxPlanetBase = size * 0.05;
  const outerGapMin = size * 0.03;
  const outerGapFactor = 1.3;
  const outerGap = Math.max(outerGapMin, pxPlanetBase * outerGapFactor);
  const rPlanetTransit = rOuter + outerGap + size * 0.13;

  const asc = Number(themePayload?.axes?.AS);
  if (!Number.isFinite(asc)) return null;

  const planets = (transitsPayload?.planets || [])
    .map((p) => {
      const name = String(p?.name || "").trim();
      const ang = toScreenAngle(p?.lon, asc);
      if (!name || ang === null) return null;

      const coeff = TRANSIT_PERCEPTION_COEFFS[name] ?? 1.0;
      const px = pxPlanetBase * coeff * 0.9;

      return {
        name,
        real: ang,
        adj: ang,
        px,
      };
    })
    .filter(Boolean) as { name: string; real: number; adj: number; px: number }[];

  if (!planets.length) return null;

  const anglesReal = planets.map((d) => d.real);
  const ref = circMean(anglesReal);
  const lin = unwrapAround(ref, anglesReal);

  const order = [...planets.keys()].sort((a, b) => lin[a] - lin[b]);
  const maxPx = Math.max(...planets.map((d) => d.px));
  const minGap = degFromPx(0.85 * (2 * maxPx), rPlanetTransit);

  const adjLin = [...lin];

  for (let iter = 0; iter < 2; iter += 1) {
    for (let k = 1; k < order.length; k += 1) {
      const iPrev = order[k - 1];
      const iCur = order[k];
      const gap = adjLin[iCur] - adjLin[iPrev];
      if (gap < minGap) {
        const shift = minGap - gap;
        adjLin[iPrev] -= 0.5 * shift;
        adjLin[iCur] += 0.5 * shift;
      }
    }

    for (let k = order.length - 2; k >= 0; k -= 1) {
      const iCur = order[k];
      const iNext = order[k + 1];
      const gap = adjLin[iNext] - adjLin[iCur];
      if (gap < minGap) {
        const shift = minGap - gap;
        adjLin[iCur] -= 0.5 * shift;
        adjLin[iNext] += 0.5 * shift;
      }
    }
  }

  const mean0 = lin.reduce((a, b) => a + b, 0) / lin.length;
  const mean1 = adjLin.reduce((a, b) => a + b, 0) / adjLin.length;
  const drift = mean1 - mean0;

  for (let i = 0; i < planets.length; i += 1) {
    planets[i].adj = norm360(adjLin[i] - drift);
  }

  const clickX = event.clientX;
  const clickY = event.clientY;

  let best: { name: string; dist: number; hitR: number } | null = null;

  for (const p of planets) {
    const pos = polToXY(cx, cy, rPlanetTransit, p.adj);
    const dx = clickX - pos.x;
    const dy = clickY - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const hitR = Math.max(16, p.px * 0.85);

    if (!best || dist < best.dist) {
      best = { name: p.name, dist, hitR };
    }
  }

  if (best && best.dist <= best.hitR) {
    return best.name;
  }

  return null;
}

function keepOnlyActiveTabCache(
  prev: CacheState,
  activeTab: TabKey
): CacheState {
  const current = prev[activeTab];
  return current ? ({ [activeTab]: current } as CacheState) : {};
}

export default function AstroMapPage() {
  const [form, setForm] = useState<PageFormState>(() =>
    withUiDefaults(createDefaultFormState())
  );
  const [submittedForm, setSubmittedForm] = useState<PageFormState | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("ecliptic");
  const [cache, setCache] = useState<CacheState>({});
  const [themePayload, setThemePayload] = useState<ChartPayload | null>(null);
  const [transitsPayload, setTransitsPayload] = useState<ChartPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coordsLocked, setCoordsLocked] = useState(false);
  const [selectedPlanet, setSelectedPlanet] = useState<string | null>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<DetailOrigin>("natal");
  const svgHostRef = useRef<HTMLDivElement | null>(null);
  const autoCalcTimerRef = useRef<number | null>(null);

  const [identMode, setIdentMode] = useState<IdentMode>("ID");
  const [coordsDisplayMode, setCoordsDisplayMode] =
    useState<CoordsDisplayMode>("DEC");

  const language = form.language;
  const isEn = language === "en";

  const patchForm = (patch: Partial<AstroSidebarForm>) => {
    setForm((prev) => ({
      ...prev,
      ...patch,
    }));

    if ("latitude" in patch || "longitude" in patch) {
      setCoordsLocked(false);
    }
  };

  const sidebarForm = useMemo<AstroSidebarForm>(
    () => ({
      name: form.name,
      day: form.day,
      month: form.month,
      year: form.year,
      hour: form.hour,
      minute: form.minute,
      timeRef: form.timeRef,

      cityQuery: form.cityQuery,
      latitude: form.latitude,
      longitude: form.longitude,
      tz: form.tz,

      language: form.language,

      transitDay: form.transitDay,
      transitMonth: form.transitMonth,
      transitYear: form.transitYear,
      transitAspectMode: form.transitAspectMode,
      transitPanelExpanded: form.transitPanelExpanded,
    }),
    [form]
  );

  const autoCalcKey = useMemo(
    () =>
      [
        form.day,
        form.month,
        form.year,
        form.hour,
        form.minute,
        form.timeRef,
        form.latitude,
        form.longitude,
        form.tz,
        form.transitDay,
        form.transitMonth,
        form.transitYear,
        form.transitAspectMode,
      ].join("|"),
    [form]
  );

  const submittedAutoCalcKey = useMemo(() => {
    if (!submittedForm) return "";

    return [
      submittedForm.day,
      submittedForm.month,
      submittedForm.year,
      submittedForm.hour,
      submittedForm.minute,
      submittedForm.timeRef,
      submittedForm.latitude,
      submittedForm.longitude,
      submittedForm.tz,
      submittedForm.transitDay,
      submittedForm.transitMonth,
      submittedForm.transitYear,
      submittedForm.transitAspectMode,
    ].join("|");
  }, [submittedForm]);

  const loadTab = async (
    tab: TabKey,
    currentForm: AstroFormState,
    force = false
  ) => {
    if (!force && cache[tab]) return;

    const themeReq = buildThemeRequestPayload(currentForm);

    if (tab === "interpretation") {
      const html = await getInterpretationHtml(themeReq);
      setCache((prev) => ({ ...prev, interpretation: html }));
      return;
    }

    if (tab === "transits") {
      const transitReq = buildTransitsRequestPayload(currentForm);
      const [svg, json] = await Promise.all([
        getTransitsSvg(transitReq),
        getTransitsJson(transitReq),
      ]);

      const root = (json as any)?.data ?? (json as any);
      const transitPart = root?.transit ?? root;

      setTransitsPayload(transitPart as ChartPayload);
      setCache((prev) => ({ ...prev, transits: svg }));
      return;
    }

    const svg = await getSvgForTab(
      tab as Exclude<TabKey, "interpretation" | "transits">,
      themeReq
    );
    setCache((prev) => ({ ...prev, [tab]: svg }));
  };

  const handleCalculate = async () => {
    setError(null);
    setLoading(true);

    try {
      const nextSubmitted = { ...form };
      const themeReq = buildThemeRequestPayload(nextSubmitted);
      const themeData = await getThemeJson(themeReq);

      setSubmittedForm(nextSubmitted);
      setThemePayload(themeData.data as ChartPayload);
      setTransitsPayload(null);
      setCache((prev) => keepOnlyActiveTabCache(prev, activeTab));
      setSelectedPlanet(null);
      setSelectedOrigin(activeTab === "transits" ? "transits" : "natal");

      await loadTab(activeTab, nextSubmitted, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!submittedForm) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        await loadTab(activeTab, submittedForm, false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erreur inconnue");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, submittedForm]);

  useEffect(() => {
    if (!submittedForm) return;
    if (autoCalcKey === submittedAutoCalcKey) return;

    if (autoCalcTimerRef.current !== null) {
      window.clearTimeout(autoCalcTimerRef.current);
    }

    autoCalcTimerRef.current = window.setTimeout(async () => {
      try {
        setError(null);
        setLoading(true);

        const nextSubmitted = { ...form };
        const themeReq = buildThemeRequestPayload(nextSubmitted);
        const themeData = await getThemeJson(themeReq);

        setSubmittedForm(nextSubmitted);
        setThemePayload(themeData.data as ChartPayload);
        setTransitsPayload(null);
        setCache((prev) => keepOnlyActiveTabCache(prev, activeTab));
        setSelectedPlanet(null);
        setSelectedOrigin(activeTab === "transits" ? "transits" : "natal");

        await loadTab(activeTab, nextSubmitted, true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        setLoading(false);
      }
    }, 450);

    return () => {
      if (autoCalcTimerRef.current !== null) {
        window.clearTimeout(autoCalcTimerRef.current);
        autoCalcTimerRef.current = null;
      }
    };
  }, [autoCalcKey, submittedAutoCalcKey, submittedForm, activeTab]);

  useEffect(() => {
    setSelectedOrigin(activeTab === "transits" ? "transits" : "natal");
    setSelectedPlanet(null);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "transits") return;
    if (!submittedForm) return;
    if (submittedForm.transitAspectMode === form.transitAspectMode) return;

    setError(null);
    setSelectedPlanet(null);
    setSelectedOrigin("transits");
    setTransitsPayload(null);

    setCache((prev) => {
      const next = { ...prev };
      delete next.transits;
      return next;
    });

    setSubmittedForm((prev) =>
      prev ? { ...prev, transitAspectMode: form.transitAspectMode } : prev
    );
  }, [activeTab, form.transitAspectMode, submittedForm]);

  const handleReset = () => {
    if (autoCalcTimerRef.current !== null) {
      window.clearTimeout(autoCalcTimerRef.current);
      autoCalcTimerRef.current = null;
    }

    setForm(withUiDefaults(createDefaultFormState()));
    setSubmittedForm(null);
    setThemePayload(null);
    setTransitsPayload(null);
    setCache({});
    setError(null);
    setCoordsLocked(false);
    setSelectedPlanet(null);
    setSelectedOrigin("natal");
    setActiveTab("ecliptic");
    setIdentMode("ID");
    setCoordsDisplayMode("DEC");
  };

  const handleExport = () => {
    const current = cache[activeTab];
    if (!current) return;

    if (activeTab === "interpretation") {
      downloadTextFile(
        "astromap-interpretation.html",
        current,
        "text/html;charset=utf-8"
      );
      return;
    }

    downloadTextFile(
      `astromap-${activeTab}.svg`,
      current,
      "image/svg+xml;charset=utf-8"
    );
  };

  const currentContent = useMemo(() => cache[activeTab] || "", [cache, activeTab]);

  const detailsPayload =
    selectedOrigin === "transits" ? transitsPayload : themePayload;

  const availablePlanets = useMemo(
    () => getPlanetNames(detailsPayload),
    [detailsPayload]
  );

  const detailState = useMemo(
    () =>
      buildPlanetDetails(
        detailsPayload,
        selectedPlanet,
        language,
        selectedOrigin
      ),
    [detailsPayload, selectedPlanet, language, selectedOrigin]
  );


  const allPlanetNames = useMemo(() => {
    const out = new Map<string, string>();

    for (const payload of [themePayload, transitsPayload]) {
      for (const p of payload?.planets || []) {
        const raw = String(p?.name || "").trim();
        if (raw) out.set(raw.toLowerCase(), raw);
      }
    }

    return Array.from(out.values());
  }, [themePayload, transitsPayload]);

  const planetMatchers = useMemo(
    () => buildPlanetMatchers(allPlanetNames),
    [allPlanetNames]
  );


  useEffect(() => {
    const host = svgHostRef.current;
    if (!host || !currentContent) return;

    const clickableNodes: HTMLElement[] = [];
    const allNodes = Array.from(host.querySelectorAll("*"));

    for (const node of allNodes) {
      const match = findPlanetFromSvgTarget(node, planetMatchers, activeTab);
      if (!match) continue;

      const el = node as HTMLElement;
      el.style.cursor = "pointer";
      el.setAttribute("data-clickable-planet", "1");
      clickableNodes.push(el);
    }

    const onClick = (event: Event) => {
      const target = event.target as Element | null;
      const match = findPlanetFromSvgTarget(target, planetMatchers, activeTab);

      if (match) {
        setSelectedPlanet(match.planet);
        setSelectedOrigin(match.origin);
        return;
      }

      if (activeTab === "transits") {
        const fallbackPlanet = findTransitPlanetByPackedFallback({
          host,
          event: event as MouseEvent,
          themePayload,
          transitsPayload,
        });

        if (fallbackPlanet) {
          setSelectedPlanet(fallbackPlanet);
          setSelectedOrigin("transits");
        }
      }
    };

    host.addEventListener("click", onClick);

    return () => {
      host.removeEventListener("click", onClick);
      clickableNodes.forEach((el) => {
        el.style.cursor = "";
        el.removeAttribute("data-clickable-planet");
      });
    };
  }, [currentContent, planetMatchers, activeTab, themePayload, transitsPayload]);

  const showDetails =
    !!submittedForm &&
    (activeTab === "ecliptic" ||
      activeTab === "domitude" ||
      activeTab === "transits");

  return (
    <div className="astromap-app">
      <div className="astromap-sidebar-shell">
        <AstroSidebar
          form={sidebarForm}
          activeTab={activeTab}
          identMode={identMode}
          coordsLocked={coordsLocked}
          coordsDisplayMode={coordsDisplayMode}
          onFormChange={patchForm}
          onToggleIdentMode={() =>
            setIdentMode((prev) => (prev === "ID" ? "WORLD" : "ID"))
          }

          onToggleTimeRef={() =>
            setForm((prev) => toggleDisplayedTimeRef(prev))
          }
          onToggleCoordsDisplay={() => {
            const nextMode: CoordsDisplayMode =
              coordsDisplayMode === "DEC" ? "DMS" : "DEC";

            setForm((prev) => convertCoordsDisplay(prev, nextMode));
            setCoordsDisplayMode(nextMode);
          }}

          onToggleTransitPanel={() =>
            patchForm({
              transitPanelExpanded: !sidebarForm.transitPanelExpanded,
            })
          }
          onShiftNatalDate={(part, step) =>
            setForm((prev) => shiftDatePart(prev, part, step))
          }
          onShiftNatalTime={(part, step) =>
            setForm((prev) => shiftTimePart(prev, part, step))
          }
          onShiftTransitDate={(part, step) =>
            setForm((prev) => shiftDatePart(prev, part, step))
          }

          onCompute={handleCalculate}
          onReset={handleReset}
          onExport={handleExport}
        />
      </div>

      <main className="astromap-main">
        <div className="astromap-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`astromap-tab ${
                activeTab === tab.key ? "astromap-tab--active" : ""
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {isEn ? tab.en : tab.fr}
            </button>
          ))}
        </div>

        <div className="astromap-stage">
          <div className="astromap-canvas-host">
            <div className="gm-main-grid">
              <div className="gm-result-wrap">

                {showDetails && (
                  <DetailsPanel
                    language={language}
                    selectedPlanet={selectedPlanet}
                    details={detailState}
                  />
                )}

                {error && (
                  <div style={{ padding: 16, color: "#b91c1c" }}>{error}</div>
                )}

                {!submittedForm && !error && !loading && (
                  <div style={{ padding: 16, color: "#6b7280" }}>
                    {isEn
                      ? "Fill the sidebar and click Compute."
                      : "Renseigne la sidebar puis clique sur Calculer."}
                  </div>
                )}

                {loading && (
                  <div style={{ padding: 16, color: "#6b7280" }}>
                    {isEn ? "Loading…" : "Chargement…"}
                  </div>
                )}


                {loading && (
                  <div
                    style={{
                      position: "absolute",
                      top: 12,
                      right: 18,
                      fontSize: 12,
                      color: "#6b7280",
                      background: "rgba(255,255,255,0.85)",
                      padding: "2px 8px",
                      border: "1px solid #d4d4d4",
                      borderRadius: 3,
                      zIndex: 5,
                    }}
                  >
                    {isEn ? "Loading…" : "Chargement…"}
                  </div>
                )}

                  {!!submittedForm &&
                    !error &&
                    activeTab !== "interpretation" &&
                    !!currentContent && (
                      <div
                        ref={svgHostRef}
                        className="gm-svg-panel"
                        dangerouslySetInnerHTML={{ __html: currentContent }}
                      />
                    )}

                {!!submittedForm &&
                  !error &&
                  activeTab === "interpretation" &&
                  !!currentContent && (
                    <iframe
                      title="interpretation"
                      className="gm-interpretation-frame"
                      srcDoc={currentContent}
                      style={{
                        width: "100%",
                        minHeight: "720px",
                        border: "none",
                        background: "#ffffff",
                      }}
                    />
                  )}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            borderTop: "1px solid #c9c9c9",
            padding: "4px 8px",
            fontSize: 12,
            color: "#374151",
            background: "#fafaf7",
          }}
        >
          {themePayload
            ? isEn
              ? "Backend connected"
              : "Backend connecté"
            : isEn
            ? "No calculated chart yet"
            : "Aucun thème calculé pour l’instant"}
        </div>
      </main>
    </div>
  );
}