import { DateTime } from "luxon";
import Tooltip from "../components/Tooltip";
import EclipticChart from "../components/EclipticChart";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildGraphicLivrableHtml,
  buildInterpretationLivrableHtml,
  cropSvgViewBox,
  downloadTextFile,
  htmlToPlainText,
  inlineSvgImages,
  openPrintDocument,
  stripSvgChartTitle,
} from "../lib/export";
import AstroSidebar, {
  type AstroSidebarForm,
  type CoordsDisplayMode,
  type IdentMode,
  type SidebarSuggestion,
} from "../components/AstroSidebar";
import { DetailsPanel } from "../components/DetailsPanel";
import {
  buildThemeRequestPayload,
  buildTransitsRequestPayload,
  createDefaultFormState,
} from "../lib/datetime";
import {
  getThemeJson,
  getTransitsJson,
  getSvgForTab,
  getInterpretationHtml,
  getTransitsSvg,
  getEclipticLayout,
  searchCities,
  type EclipticLayoutPayload,
} from "../lib/api";
import {
  buildDnSubLabel,
  loadDnDatabase,
  lonToLmtTz,
  searchDnRecords,
  type DnRecord,
} from "../lib/dn";
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

const TRIAL_QUERY = "trial";
const TRIAL_PERSON = "einstein";

function isTrialMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get(TRIAL_QUERY)?.toLowerCase() === TRIAL_PERSON;
}

type CacheState = Partial<Record<TabKey, string>>;
type CitySuggestion = SidebarSuggestion & {
  name: string;
  lat: number;
  lon: number;
  tz: string;
};

type PageFormState = AstroFormState & {
  transitPanelExpanded: boolean;
};

type DnSuggestionItem = SidebarSuggestion & {
  record: DnRecord;
};

type IdCacheState = Pick<PageFormState, "name" | "cityQuery" | "latitude" | "longitude" | "tz">;

type ExportKind = "svg" | "json" | "pdf" | "txt";

type SvgPlanetPosition = {
  x: number;
  y: number;
};

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

function formatCoordForMode(value: number, mode: CoordsDisplayMode) {
  return mode === "DMS" ? formatCoordDms(value) : formatCoordDecimal(value);
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
  const directTitleNode = Array.from(el.children).find(
    (child) => child.tagName.toLowerCase() === "title"
  );

  return [
    el.getAttribute("id") || "",
    el.getAttribute("class") || "",
    el.getAttribute("data-planet") || "",
    el.getAttribute("data-name") || "",
    el.getAttribute("aria-label") || "",
    el.getAttribute("href") || "",
    el.getAttribute("xlink:href") || "",
    directTitleNode?.textContent || "",
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

function readSvgPlanetPositions(host: HTMLDivElement) {
  const positions = new Map<string, SvgPlanetPosition>();

  host.querySelectorAll<SVGGElement>("g.planet[data-planet]").forEach((group) => {
    const name = group.getAttribute("data-planet");
    const image = group.querySelector<SVGImageElement>("image");

    if (!name || !image) return;

    const x = Number(image.getAttribute("x"));
    const y = Number(image.getAttribute("y"));
    const width = Number(image.getAttribute("width"));
    const height = Number(image.getAttribute("height"));

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      return;
    }

    positions.set(name, {
      x: x + width / 2,
      y: y + height / 2,
    });
  });

  return positions;
}


function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}


export default function AstroMapPage() {
function AstroMapLoader({ isEn }: { isEn: boolean }) {
  return (
    <div className="astromap-loader-overlay" aria-live="polite">
      <div className="astromap-loader-card">
        <div className="astromap-loader-wheel" aria-hidden="true">
          <svg viewBox="0 0 120 120" className="astromap-loader-svg">
            <circle cx="60" cy="60" r="42" className="astromap-loader-ring" />
            <circle cx="60" cy="60" r="28" className="astromap-loader-inner" />

            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i * Math.PI) / 6;
              const x1 = 60 + Math.cos(angle) * 31;
              const y1 = 60 + Math.sin(angle) * 31;
              const x2 = 60 + Math.cos(angle) * 42;
              const y2 = 60 + Math.sin(angle) * 42;

              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  className="astromap-loader-tick"
                />
              );
            })}

            <path
              d="M60 18 A42 42 0 0 1 102 60"
              className="astromap-loader-accent"
            />
          </svg>
        </div>

        <div className="astromap-loader-text">
          {isEn ? "Calculating chart…" : "Calcul du thème…"}
        </div>
      </div>
    </div>
  );
}
  const [form, setForm] = useState<PageFormState>(() =>
    withUiDefaults(createDefaultFormState())
  );
  const [submittedForm, setSubmittedForm] = useState<PageFormState | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("ecliptic");
  const [cache, setCache] = useState<CacheState>({});
  const [themePayload, setThemePayload] = useState<ChartPayload | null>(null);
  const [eclipticLayout, setEclipticLayout] =
    useState<EclipticLayoutPayload | null>(null);
  const [transitsPayload, setTransitsPayload] = useState<ChartPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPremiumLoader, setShowPremiumLoader] = useState(false);
  const [isVisualUpdating, setIsVisualUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coordsLocked, setCoordsLocked] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [dnRecords, setDnRecords] = useState<DnRecord[]>([]);
  const [dnSuggestions, setDnSuggestions] = useState<DnSuggestionItem[]>([]);
  const [showDnSuggestions, setShowDnSuggestions] = useState(false);
  const [dnSource, setDnSource] = useState("");
  const [dnSelectedActive, setDnSelectedActive] = useState(false);
  const [dnBirthSnapshot, setDnBirthSnapshot] = useState<string | null>(null);
  const [currentThemeOwnerTitle, setCurrentThemeOwnerTitle] = useState("");
  const [idStateCache, setIdStateCache] = useState<IdCacheState | null>(null);
  const [selectedPlanet, setSelectedPlanet] = useState<string | null>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<DetailOrigin>("natal");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportKind, setExportKind] = useState<ExportKind>("pdf");
  const [exportBusy, setExportBusy] = useState(false);
  const svgHostRef = useRef<HTMLDivElement | null>(null);
  const autoCalcTimerRef = useRef<number | null>(null);
  const immediateAutoCalcRef = useRef(false);
  const computeSeqRef = useRef(0);
  const autoComputeRunningRef = useRef(false);
  const pendingAutoComputeFormRef = useRef<AstroFormState | null>(null);
  const visualUpdateTimerRef = useRef<number | null>(null);
  const spinPreviewActiveRef = useRef(false);
  const spinPreviewBaseFormRef = useRef<PageFormState | null>(null);
  const previousPlanetPositionsRef = useRef<Map<string, SvgPlanetPosition>>(
    new Map()
  );
  const previousAnimationTabRef = useRef<string | null>(null);
  const stopVisualUpdatingSoon = useCallback(() => {
    if (visualUpdateTimerRef.current !== null) {
      window.clearTimeout(visualUpdateTimerRef.current);
    }

    visualUpdateTimerRef.current = window.setTimeout(() => {
      setIsVisualUpdating(false);
      visualUpdateTimerRef.current = null;
    }, 120);
  }, []);

  useEffect(() => {
    return () => {
      if (visualUpdateTimerRef.current !== null) {
        window.clearTimeout(visualUpdateTimerRef.current);
      }
    };
  }, []);

  const [identMode, setIdentMode] = useState<IdentMode>("ID");
  const [coordsDisplayMode, setCoordsDisplayMode] =
    useState<CoordsDisplayMode>("DEC");

  const language = form.language;
  const isEn = language === "en";
  const trialMode = isTrialMode();

  const goPrevTab = () => {
    const currentIndex = TABS.findIndex((tab) => tab.key === activeTab);
    const prevIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    setActiveTab(TABS[prevIndex].key);
  };

  const goNextTab = () => {
    const currentIndex = TABS.findIndex((tab) => tab.key === activeTab);
    const nextIndex = (currentIndex + 1) % TABS.length;
    setActiveTab(TABS[nextIndex].key);
  };


  const leaveDnMode = () => {
    setIdentMode("ID");
    setDnSelectedActive(false);
    setDnSource("");
    setDnSuggestions([]);
    setShowDnSuggestions(false);
    setDnBirthSnapshot(null);
    setCurrentThemeOwnerTitle("");
  };

const patchForm = (patch: Partial<AstroForm>) => {
  if (
    trialMode &&
    Object.keys(patch).some(
      (key) =>
        key !== "language" &&
        key !== "transitAspectMode" &&
        key !== "transitPanelExpanded"
    )
  ) {
    return;
  }

  if (identMode === "WORLD" && "name" in patch) {
    setDnSelectedActive(false);
    setDnSource("");
    setDnBirthSnapshot(null);
    setCurrentThemeOwnerTitle("");
    setDnSuggestions([]);
    setShowDnSuggestions(false);
  }

    const mustLeaveDnMode =
      identMode === "WORLD" &&
      [
        "day",
        "month",
        "year",
        "hour",
        "minute",
        "timeRef",
        "cityQuery",
        "latitude",
        "longitude",
        "tz",
      ].some((key) => key in patch);

  if (mustLeaveDnMode) {
    leaveDnMode();

    setForm((prev) => ({
      ...prev,
      ...patch,
      name: "",
    }));

    return;
  }

    setForm((prev) => ({
      ...prev,
      ...patch,
    }));
  };

  useEffect(() => {
    if (identMode !== "WORLD" || !dnBirthSnapshot) return;

    const currentBirthKey = [
      form.day,
      form.month,
      form.year,
      form.hour,
      form.minute,
      form.cityQuery,
      form.latitude,
      form.longitude,
      form.tz,
    ].join("|");

    if (currentBirthKey !== dnBirthSnapshot) {
      leaveDnMode();
      setForm((prev) => ({
        ...prev,
        name: "",
      }));
    }
  }, [
    identMode,
    dnBirthSnapshot,
    form.day,
    form.month,
    form.year,
    form.hour,
    form.minute,
    form.cityQuery,
    form.latitude,
    form.longitude,
    form.tz,
  ]);


  useEffect(() => {
    if (identMode !== "WORLD" || dnSelectedActive) {
      setDnSuggestions([]);
      setShowDnSuggestions(false);
      return;
    }

    const query = form.name.trim();

    if (query.length < 2 || !dnRecords.length) {
      setDnSuggestions([]);
      setShowDnSuggestions(false);
      return;
    }

    const timer = window.setTimeout(() => {
      const matches = searchDnRecords(dnRecords, query);

      const items: DnSuggestionItem[] = matches.map((rec, index) => ({
        id: `dn-${rec.nom}-${rec.prenom}-${rec.dateRaw}-${index}`,
        label: rec.displayName,
        subLabel: buildDnSubLabel(rec),
        record: rec,
      }));

      setDnSuggestions(items);
      setShowDnSuggestions(items.length > 0);
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [identMode, dnSelectedActive, form.name, dnRecords]);

  useEffect(() => {
    const query = form.cityQuery.trim();

    if (query.length < 2) {
      setCitySuggestions([]);
      setShowCitySuggestions(false);
      return;
    }

    let cancelled = false;

    const timer = window.setTimeout(async () => {
      try {
        const results = await searchCities(query, language);

        if (cancelled) return;

        const mapped: CitySuggestion[] = results.map((item, index) => ({
          id: `${item.name}-${item.lat}-${item.lon}-${index}`,
          label: item.name || item.display,
          subLabel: item.display,
          name: item.name || item.display,
          lat: item.lat,
          lon: item.lon,
          tz: item.tz,
        }));

        setCitySuggestions(mapped);
        setShowCitySuggestions(mapped.length > 0);
      } catch {
        if (!cancelled) {
          setCitySuggestions([]);
          setShowCitySuggestions(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.cityQuery, language]);


  const handleToggleIdentMode = useCallback(() => {
    if (identMode === "ID") {
      setIdStateCache({
        name: form.name,
        cityQuery: form.cityQuery,
        latitude: form.latitude,
        longitude: form.longitude,
        tz: form.tz,
      });

      setIdentMode("WORLD");
      setDnSelectedActive(false);
      setDnSource("");
      setDnSuggestions([]);
      setShowDnSuggestions(false);

      setForm((prev) => ({
        ...prev,
        name: "",
      }));
      return;
    }

    setIdentMode("ID");
    setDnSelectedActive(false);
    setDnSource("");
    setDnSuggestions([]);
    setShowDnSuggestions(false);

    setForm((prev) => ({
      ...prev,
      name: idStateCache?.name ?? "",
      cityQuery: idStateCache?.cityQuery ?? prev.cityQuery,
      latitude: idStateCache?.latitude ?? prev.latitude,
      longitude: idStateCache?.longitude ?? prev.longitude,
      tz: idStateCache?.tz ?? prev.tz,
    }));

    const latOk = !!(idStateCache?.latitude || "").trim();
    const lonOk = !!(idStateCache?.longitude || "").trim();
    setCoordsLocked(latOk && lonOk);
  }, [identMode, form, idStateCache]);


  const handleSelectDnSuggestion = useCallback(
    async (item: SidebarSuggestion) => {
      const rec = (item as DnSuggestionItem).record;
      if (!rec) return;

      const [dd = "", mm = "", yyyy = ""] = rec.date ? rec.date.split("-") : [];
      const [hh = "", mi = ""] = rec.time ? rec.time.split(":") : [];

      let nextLat = rec.lat;
      let nextLon = rec.lon;
      let nextTz = form.tz;
      let nextCity = [rec.lieu, rec.pays].filter(Boolean).join(", ");

      if (rec.lieu) {
        try {
          const cityMatches = await searchCities(rec.lieu, language);
          const best = cityMatches[0];

          if (best) {
            if (nextLat == null || nextLon == null) {
              nextLat = best.lat;
              nextLon = best.lon;
            }

            if (Number(yyyy) >= 1900 && best.tz) {
              nextTz = best.tz;
            }
          }
        } catch {
          // on garde les valeurs courantes
        }
      }

      if (Number(yyyy) < 1900 && nextLon != null) {
        const lmt = lonToLmtTz(nextLon);
        if (lmt) nextTz = lmt;
      }

      const finalTz = nextTz || form.tz;

      setCurrentThemeOwnerTitle(
        [rec.prenom, rec.nom].filter(Boolean).join(" ").trim()
      );

      setForm((prev) => ({
        ...prev,
        name: rec.displayName,
        day: dd || prev.day,
        month: mm || prev.month,
        year: yyyy || prev.year,
        hour: hh || prev.hour,
        minute: mi || prev.minute,
        cityQuery: nextCity,
        latitude:
          nextLat != null ? formatCoordForMode(nextLat, coordsDisplayMode) : "",
        longitude:
          nextLon != null ? formatCoordForMode(nextLon, coordsDisplayMode) : "",
        tz: finalTz,
      }));

      setCoordsLocked(nextLat != null && nextLon != null);
      setDnSource(language === "en" ? `Source: ${rec.source}` : `Source : ${rec.source}`);
      setDnSelectedActive(true);
      setDnBirthSnapshot(
        [
          dd || "",
          mm || "",
          yyyy || "",
          hh || "",
          mi || "",
          nextCity,
          nextLat != null ? formatCoordForMode(nextLat, coordsDisplayMode) : "",
          nextLon != null ? formatCoordForMode(nextLon, coordsDisplayMode) : "",
          finalTz
        ].join("|")
      );
      setDnSuggestions([]);
      setShowDnSuggestions(false);
    },
    [coordsDisplayMode, form.tz, language]
  );


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
        form.language,
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
      submittedForm.language,
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

    if (tab === "ecliptic") {
      const [svg, layout] = await Promise.all([
        getSvgForTab("ecliptic", themeReq),
        getEclipticLayout(themeReq),
      ]);

      setEclipticLayout(layout);
      setCache((prev) => ({ ...prev, ecliptic: svg }));
      return;
    }

    const svg = await getSvgForTab(
      tab as Exclude<TabKey, "interpretation" | "transits">,
      themeReq
    );

    setCache((prev) => ({ ...prev, [tab]: svg }));
  };

  const handleCalculate = async () => {
    const seq = computeSeqRef.current + 1;
    computeSeqRef.current = seq;

    setError(null);
    setLoading(true);
    setShowPremiumLoader(true);

    try {
      const themeReq = buildThemeRequestPayload(form);
      const themeData = await getThemeJson(themeReq);

      if (seq !== computeSeqRef.current) return;

      setThemePayload(themeData.data as ChartPayload);
      setTransitsPayload(null);
      setCache({});
      setSelectedPlanet(null);
      setSelectedOrigin(activeTab === "transits" ? "transits" : "natal");
      setSubmittedForm(form);

      await loadTab(activeTab, form, true);

      if (seq !== computeSeqRef.current) return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      if (seq === computeSeqRef.current) {
        stopVisualUpdatingSoon();

        await waitForNextPaint();
        setLoading(false);
        setShowPremiumLoader(false);
      }
    }
  };

  const didAutoCalculateOnMountRef = useRef(false);

  useEffect(() => {
    if (didAutoCalculateOnMountRef.current) return;

    didAutoCalculateOnMountRef.current = true;
    immediateAutoCalcRef.current = true;

    window.setTimeout(() => {
      handleCalculate();
    }, 0);
  }, [handleCalculate]);

  const runQueuedAutoCompute = useCallback(
    async (requestedForm: AstroFormState) => {
      pendingAutoComputeFormRef.current = requestedForm;

      if (autoComputeRunningRef.current) {
        return;
      }

      autoComputeRunningRef.current = true;

      try {
        while (pendingAutoComputeFormRef.current) {
          const nextSubmitted = pendingAutoComputeFormRef.current;
          pendingAutoComputeFormRef.current = null;

          const seq = computeSeqRef.current + 1;
          computeSeqRef.current = seq;

          setError(null);
          setLoading(true);
          setIsVisualUpdating(true);

          try {
            const themeReq = buildThemeRequestPayload(nextSubmitted);

            if (spinPreviewActiveRef.current && activeTab === "ecliptic") {
              const layout = await getEclipticLayout(themeReq);

              if (seq !== computeSeqRef.current) return;

              setSubmittedForm(nextSubmitted);
              setEclipticLayout(layout);
            } else if (spinPreviewActiveRef.current && activeTab === "transits") {
              await loadTab("transits", nextSubmitted, true);

              if (seq !== computeSeqRef.current) return;

              setSubmittedForm(nextSubmitted);
              setSelectedOrigin("transits");
            } else {
              const themeData = await getThemeJson(themeReq);

              if (seq !== computeSeqRef.current) return;

              setSubmittedForm(nextSubmitted);
              setThemePayload(themeData.data as ChartPayload);
              setTransitsPayload(null);
              setCache((prev) => keepOnlyActiveTabCache(prev, activeTab));
              setSelectedPlanet(null);
              setSelectedOrigin(activeTab === "transits" ? "transits" : "natal");

              await loadTab(activeTab, nextSubmitted, true);

              if (seq !== computeSeqRef.current) return;
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur inconnue");
          } finally {
            if (seq === computeSeqRef.current) {
              stopVisualUpdatingSoon();
              setLoading(false);
            }
          }
        }
      } finally {
        autoComputeRunningRef.current = false;
      }
    },
    [activeTab, loadTab, stopVisualUpdatingSoon]
  );

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

    const delay = spinPreviewActiveRef.current
      ? 90
      : immediateAutoCalcRef.current
        ? 0
        : 600;

    immediateAutoCalcRef.current = false;

    autoCalcTimerRef.current = window.setTimeout(() => {
      runQueuedAutoCompute({ ...form });
    }, delay);

    return () => {
      if (autoCalcTimerRef.current !== null) {
        window.clearTimeout(autoCalcTimerRef.current);
        autoCalcTimerRef.current = null;
      }
    };
  }, [
    autoCalcKey,
    submittedAutoCalcKey,
    submittedForm,
    form,
    runQueuedAutoCompute,
  ]);

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
    setCitySuggestions([]);
    setShowCitySuggestions(false);
    setSelectedPlanet(null);
    setSelectedOrigin("natal");
    setActiveTab("ecliptic");
    setIdentMode("ID");
    setDnSource("");
    setDnSelectedActive(false);
    setDnSuggestions([]);
    setShowDnSuggestions(false);
    setCoordsDisplayMode("DEC");
  };

  const buildExportJsonPayload = useMemo(() => {
    if (activeTab === "transits") {
      return {
        active_tab: "transits",
        theme_payload: themePayload,
        transit_payload: transitsPayload,
        transit_aspect_mode: form.transitAspectMode,
        transit_date: {
          day: form.transitDay,
          month: form.transitMonth,
          year: form.transitYear,
        },
     };
    }

    return {
      active_tab: activeTab,
      theme_payload: themePayload,
    };
  }, [
    activeTab,
    themePayload,
    transitsPayload,
    form.transitAspectMode,
    form.transitDay,
    form.transitMonth,
    form.transitYear,
  ]);

  const ensureInterpretationExportAssets = useCallback(async () => {
    if (!submittedForm) {
      throw new Error(
        language === "en"
          ? "No chart available for export."
          : "Aucun thème disponible pour l’export."
      );
    }

    const themeReq = buildThemeRequestPayload(submittedForm);

    const interpretationPromise = cache.interpretation
      ? Promise.resolve(cache.interpretation)
      : getInterpretationHtml(themeReq);

    const eclipticPromise = cache.ecliptic
      ? Promise.resolve(cache.ecliptic)
      : getSvgForTab("ecliptic", themeReq);

    const retPromise = cache.ret
      ? Promise.resolve(cache.ret)
      : getSvgForTab("ret", themeReq);

    const aspectsPromise = cache.aspects
      ? Promise.resolve(cache.aspects)
      : getSvgForTab("aspects", themeReq);

    const [interpretation, ecliptic, ret, aspects] = await Promise.all([
      interpretationPromise,
      eclipticPromise,
      retPromise,
      aspectsPromise,
    ]);

    setCache((prev) => ({
      ...prev,
      interpretation,
      ecliptic,
      ret,
      aspects,
    }));

    return {
      interpretation,
      ecliptic,
      ret,
      aspects,
    };
  }, [cache, language, submittedForm]);

  const runInterpretationExport = async () => {
    if (activeTab !== "interpretation") {
      setExportDialogOpen(false);
      return;
    }

    try {
      setExportBusy(true);

      const { interpretation, ecliptic, ret, aspects } =
        await ensureInterpretationExportAssets();

      if (exportKind === "txt") {
        const txt = htmlToPlainText(interpretation);
        downloadTextFile(
          "astromap-interpretation.txt",
          txt,
          "text/plain;charset=utf-8"
        );
        setExportDialogOpen(false);
        return;
      }

      if (exportKind === "json") {
        const jsonPayload = {
          active_tab: "interpretation",
          language,
          submitted_form: submittedForm,
          theme_payload: themePayload,
          interpretation_html: interpretation,
          interpretation_text: htmlToPlainText(interpretation),
        };

        downloadTextFile(
          "astromap-interpretation.json",
          JSON.stringify(jsonPayload, null, 2),
          "application/json;charset=utf-8"
        );
        setExportDialogOpen(false);
        return;
      }

      const [eclipticSvg, retSvg, aspectsSvg] = await Promise.all([
        inlineSvgImages(cropSvgViewBox(stripSvgChartTitle(ecliptic))),
        inlineSvgImages(cropSvgViewBox(stripSvgChartTitle(ret))),
        inlineSvgImages(cropSvgViewBox(stripSvgChartTitle(aspects))),
      ]);

      const documentTitle =
        (themePayload?.meta?.name || submittedForm?.name || "").trim() ||
        (language === "en" ? "Astrological chart" : "Thème astrologique");

      const dateLine = `${submittedForm?.day}/${submittedForm?.month}/${submittedForm?.year} – ${submittedForm?.hour}:${submittedForm?.minute} (${submittedForm?.timeRef}, ${submittedForm?.tz})`;
      const coordsLine = `${submittedForm?.latitude}, ${submittedForm?.longitude}`;

      const printableHtml = buildInterpretationLivrableHtml({
        language,
        documentTitle,
        dateLine,
        coordsLine,
        interpretationHtml: interpretation,
        eclipticSvg,
        retSvg,
        aspectsSvg,
      });

      openPrintDocument(printableHtml);
      setExportDialogOpen(false);
    } catch (err) {
      setExportDialogOpen(false);
      setError(err instanceof Error ? err.message : "Erreur d’export.");
    } finally {
      setExportBusy(false);
    }
  };

  const handleExport = () => {
    if (activeTab === "interpretation") {
      if (!submittedForm) return;
      setExportKind("pdf");
      setExportDialogOpen(true);
      return;
    }

    const current = cache[activeTab];
    if (!current) return;

    setExportKind("pdf");
    setExportDialogOpen(true);
  };

  const runGraphicExport = async () => {
    const current = cache[activeTab];
    const exportCurrent = current ? stripSvgChartTitle(current) : "";
    if (!current || activeTab === "interpretation") {
      setExportDialogOpen(false);
      return;
    }

    try {
      setExportBusy(true);

      if (exportKind === "svg") {
        downloadTextFile(
          `astromap-${activeTab}.svg`,
          exportCurrent,
          "image/svg+xml;charset=utf-8"
        );
        setExportDialogOpen(false);
        return;
      }

      if (exportKind === "json") {
        downloadTextFile(
          `astromap-${activeTab}.json`,
          JSON.stringify(buildExportJsonPayload, null, 2),
          "application/json;charset=utf-8"
        );
        setExportDialogOpen(false);
        return;
      }

      const svgMarkup = await inlineSvgImages(exportCurrent);

      const documentTitle =
        (themePayload?.meta?.name || submittedForm?.name || "").trim() ||
        (language === "en" ? "Astrological chart" : "Thème astrologique");

      const dateLine = `${submittedForm?.day}/${submittedForm?.month}/${submittedForm?.year} – ${submittedForm?.hour}:${submittedForm?.minute} (${submittedForm?.timeRef}, ${submittedForm?.tz})`;
      const coordsLine = `${submittedForm?.latitude}, ${submittedForm?.longitude}`;

      const pageTitleMap: Record<string, string> = {
        ecliptic: language === "en" ? "Ecliptic chart" : "Thème écliptique",
        domitude: "Domitude",
        ret: "RET / HP",
        transits: language === "en" ? "Transits" : "Transits",
        aspects: language === "en" ? "Planetary aspects" : "Aspects planétaires",
      };

      const printableHtml = buildGraphicLivrableHtml({
        language,
        documentTitle,
        dateLine,
        coordsLine,
        pageTitle: pageTitleMap[activeTab] ?? activeTab,
        svgMarkup,
      });

      openPrintDocument(printableHtml);
      setExportDialogOpen(false);
    } catch (err) {
      setExportDialogOpen(false);
      setError(err instanceof Error ? err.message : "Erreur d’export.");
    } finally {
      setExportBusy(false);
    }
  };


  const handleSpinStart = useCallback(() => {
    spinPreviewActiveRef.current = true;
    spinPreviewBaseFormRef.current = form;
  }, [form]);

  const handleSpinEnd = useCallback(() => {
    spinPreviewActiveRef.current = false;
    spinPreviewBaseFormRef.current = null;
    immediateAutoCalcRef.current = true;
    handleCalculate();
  }, [handleCalculate]);


  const currentContent = useMemo(() => {
    const raw = cache[activeTab] || "";
    const owner = currentThemeOwnerTitle.trim();

    if (!owner) return raw;

    const suffix = ` — ${owner}`;

    return raw
      .replace("Thème écliptique", `Thème écliptique${suffix}`)
      .replace("Ecliptic chart", `Ecliptic chart${suffix}`)
      .replace("Thème de domitude", `Thème de domitude${suffix}`)
      .replace("Domitude chart", `Domitude chart${suffix}`)
      .replace("Thème de transit", `Thème de transit${suffix}`)
      .replace("Transit chart", `Transit chart${suffix}`)
      .replace("Aspects planétaires", `Aspects planétaires${suffix}`)
      .replace("Planetary aspects", `Planetary aspects${suffix}`)
      .replace("RET et Hiérarchie Planétaire", `RET et Hiérarchie Planétaire${suffix}`)
      .replace("RET and Planetary Hierarchy", `RET and Planetary Hierarchy${suffix}`)
      .replace("Lecture du thème astrologique", `Lecture du thème astrologique${suffix}`)
      .replace("Astrological chart reading", `Astrological chart reading${suffix}`);
  }, [cache, activeTab, currentThemeOwnerTitle]);


  useLayoutEffect(() => {
    const host = svgHostRef.current;

    if (!host || activeTab === "interpretation") {
      previousPlanetPositionsRef.current = new Map();
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) {
      previousPlanetPositionsRef.current = readSvgPlanetPositions(host);
      return;
    }

    const previous = previousPlanetPositionsRef.current;
    const current = readSvgPlanetPositions(host);

    if (previousAnimationTabRef.current !== activeTab) {
      previousAnimationTabRef.current = activeTab;
      previousPlanetPositionsRef.current = current;
      return;
    }

    if (previous.size === 0) {
      previousPlanetPositionsRef.current = current;
      return;
    }

    host.querySelectorAll<SVGGElement>("g.planet[data-planet]").forEach((group) => {
      const name = group.getAttribute("data-planet");
      if (!name) return;

      const from = previous.get(name);
      const to = current.get(name);

      if (!from || !to) return;

      const dx = from.x - to.x;
      const dy = from.y - to.y;

      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

      const distance = Math.hypot(dx, dy);

      if (distance > 420) return;

      const duration = Math.min(220, Math.max(80, 80 + distance * 0.18));

      const connectors = Array.from(
        host.querySelectorAll<SVGElement>(".planet-connector")
      ).filter((connector) => connector.getAttribute("data-planet") === name);

      const animatedElements: SVGElement[] = [group, ...connectors];

      animatedElements.forEach((element) => {
        element.getAnimations().forEach((animation) => animation.cancel());

        element.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: "translate(0px, 0px)" },
          ],
          {
            duration,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "none",
          }
        );
      });
    });

    previousPlanetPositionsRef.current = current;
  }, [currentContent, activeTab]);

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
    let cancelled = false;

    loadDnDatabase()
      .then((rows) => {
        if (!cancelled) setDnRecords(rows);
      })
      .catch(() => {
        if (!cancelled) setDnRecords([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const host = svgHostRef.current;
    if (!host || !currentContent) return;

    const clickableNodes: HTMLElement[] = [];
    const allNodes = Array.from(
      host.querySelectorAll("g.planet[data-planet], g.natal_planet[data-planet], g.transit_planet[data-planet], g.domitude_planet[data-planet]")
    );

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

  const applyTkInterpretationStyles = (html: string) => {
    if (!html) return html;

    const replacement = `<style>
          html, body {
            margin: 0;
            padding: 0;
            background: #fff;
            color: #000;
            font-family: Helvetica, Arial, sans-serif;
            height: 100%;
            min-height: 100%;
          }

          body {
            overflow-y: auto;
          }

          .wrap {
            max-width: none;
            margin: 0 auto;
            padding: 8mm 48mm 12mm 48mm;
            box-sizing: border-box;
            min-height: 100%;
          }

          .page-title {
            font-size: 18pt;
            font-weight: 700;
            color: #1f4fa3;
            text-align: center;
            margin: 0 0 56px 0;
          }

          .section {
            font-size: 14pt;
            font-weight: 700;
            color: #1f3a5f;
            margin: 34px 0 18px 0;
          }

          .bold {
            font-size: 11pt;
            font-weight: 700;
            color: #2b4c7e;
            margin: 0 0 10px 0;
          }

          .bold-soft {
            font-size: 10pt;
            font-weight: 700;
            color: #333;
            margin: 0 0 10px 0;
          }

          .bold-nogap {
            font-size: 11pt;
            font-weight: 700;
            color: #2b4c7e;
            margin: 0 0 5px 0;
          }

          .p {
            font-size: 10pt;
            line-height: 14pt;
            margin: 0 0 14pt 0;
            text-align: justify;
            white-space: pre-line;
            color: #000;
          }
          </style>`;

    return html.replace(/<style>[\s\S]*?<\/style>/i, replacement);
  };

  const interpretationDoc = useMemo(() => {
    const raw =
      activeTab === "interpretation" && currentContent
        ? applyTkInterpretationStyles(currentContent)
        : currentContent;

    const owner = currentThemeOwnerTitle.trim();
    if (!owner) return raw;

    const suffix = ` — ${owner}`;

    return raw
      .replace(
        /(<div class="page-title">)Lecture du thème astrologique(<\/div>)/i,
        `$1Lecture du thème astrologique${suffix}$2`
      )
      .replace(
        /(<div class="page-title">)Astrological Chart Reading(<\/div>)/i,
        `$1Astrological Chart Reading${suffix}$2`
      );
  }, [activeTab, currentContent, currentThemeOwnerTitle]);

  return (
    <div className="astromap-app">
      <div className="astromap-sidebar-shell">
        <AstroSidebar
          form={sidebarForm}
          activeTab={activeTab}
          identMode={identMode}
          dnSource={dnSource}
          coordsLocked={coordsLocked}
          coordsDisplayMode={coordsDisplayMode}
          showDnSuggestions={showDnSuggestions}
          dnSuggestions={dnSuggestions}
          showCitySuggestions={showCitySuggestions}
          citySuggestions={citySuggestions}
          cityHint={isEn ? "Assisted entry" : "Saisie assistée"}
          onFormChange={patchForm}
          onToggleIdentMode={handleToggleIdentMode}

          onToggleTimeRef={() => {
            const leaveDn = identMode === "WORLD";

            if (leaveDn) {
              leaveDnMode();
            }

            setForm((prev) => {
              const next = toggleDisplayedTimeRef(prev);
              return leaveDn ? { ...next, name: "" } : next;
            });
          }}

          onToggleCoordsDisplay={() => {
            const leaveDn = identMode === "WORLD";

            if (leaveDn) {
              leaveDnMode();
            }

            const nextMode: CoordsDisplayMode =
              coordsDisplayMode === "DEC" ? "DMS" : "DEC";

            setForm((prev) => {
              const next = convertCoordsDisplay(prev, nextMode);
              return leaveDn ? { ...next, name: "" } : next;
            });

            setCoordsDisplayMode(nextMode);
          }}

          onToggleTransitPanel={() =>
            patchForm({
              transitPanelExpanded: !sidebarForm.transitPanelExpanded,
            })
          }
          onShiftNatalDate={(part, step) => {
            if (!spinPreviewActiveRef.current) {
              immediateAutoCalcRef.current = true;
            }
            const leaveDn = identMode === "WORLD";

            if (leaveDn) {
              leaveDnMode();
            }

            setForm((prev) => {
              const next = shiftDatePart(prev, part, step);
              return leaveDn ? { ...next, name: "" } : next;
            });
          }}
          onShiftNatalTime={(part, step) => {
            if (!spinPreviewActiveRef.current) {
              immediateAutoCalcRef.current = true;
            }
            const leaveDn = identMode === "WORLD";

            if (leaveDn) {
              leaveDnMode();
            }

            setForm((prev) => {
              const next = shiftTimePart(prev, part, step);
              return leaveDn ? { ...next, name: "" } : next;
            });
          }}
          onShiftTransitDate={(part, step) => {
            if (!spinPreviewActiveRef.current) {
              immediateAutoCalcRef.current = true;
            }
            setForm((prev) => shiftDatePart(prev, part, step));
          }}
          onCompute={handleCalculate}
          onReset={handleReset}
          onExport={handleExport}
          onSelectDnSuggestion={handleSelectDnSuggestion}
          onSelectCitySuggestion={(item) => {
            const city = item as CitySuggestion;

            setForm((prev) => ({
              ...prev,
              cityQuery: city.name,
              latitude: String(city.lat),
              longitude: String(city.lon),
              tz: city.tz,
            }));

            setCoordsLocked(true);
            setCitySuggestions([]);
            setShowCitySuggestions(false);
          }}
        />
      </div>

        <main
          className="astromap-main"
          style={
            activeTab === "interpretation"
              ? {
                  display: "flex",
                  flexDirection: "column",
                  height: "100vh",
                  minHeight: 0,
                }
              : undefined
          }
        >
        <div className="astromap-tabs">
          {TABS.map((tab) => (
            <Tooltip
              key={tab.key}
              tipKey={`tab_${tab.key}` as const}
              lang={form.language}
              variant="tab"
            >
              <button
                type="button"
                className={`astromap-tab ${
                  activeTab === tab.key ? "astromap-tab--active" : ""
                }`}
                onClick={() => setActiveTab(tab.key)}
              >
                {isEn ? tab.en : tab.fr}
              </button>
            </Tooltip>
          ))}
        </div>

        <div
          className="astromap-stage"
          style={
            activeTab === "interpretation"
              ? {
                  flex: 1,
                  minHeight: 0,
                }
              : undefined
          }
        >
        <div
          className="astromap-canvas-host"
          style={
            activeTab === "interpretation"
              ? {
                  height: "100%",
                  minHeight: 0,
                }
              : undefined
          }
        >
        <div
          className="gm-main-grid"
          style={
            activeTab === "interpretation"
              ? {
                  height: "100%",
                  minHeight: 0,
                }
              : undefined
          }
        >
        <div
          className="gm-result-wrap"
          style={
            activeTab === "interpretation"
              ? {
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  minHeight: 0,
                }
              : undefined
          }
        >
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
                : "Renseignez la sidebar puis cliquez sur Calculer."}
            </div>
          )}

          {showPremiumLoader && <AstroMapLoader isEn={isEn} />}

          {!!submittedForm &&
            !error &&
            activeTab !== "interpretation" &&
            !!currentContent &&
            ((activeTab === "ecliptic" && eclipticLayout) ? (
              <div
                ref={svgHostRef}
                className={`gm-svg-panel astromap-chart-fade-in ${
                  isVisualUpdating ? "gm-svg-panel--updating" : ""
                }`}
              >
                <EclipticChart
                  layout={eclipticLayout}
                  ownerName={currentThemeOwnerTitle}
                />
              </div>
            ) : (
              <div
                ref={svgHostRef}
                className={`gm-svg-panel astromap-chart-fade-in ${
                  isVisualUpdating ? "gm-svg-panel--updating" : ""
                }`}
                dangerouslySetInnerHTML={{ __html: currentContent }}
              />
            ))}

          {!!submittedForm &&
            !error &&
            activeTab === "interpretation" &&
            !!currentContent && (
              <iframe
                title="interpretation"
                className="gm-interpretation-frame"
                srcDoc={interpretationDoc}
                style={{
                  width: "100%",
                  height: "100%",
                  flex: 1,
                  minHeight: 0,
                  display: "block",
                  border: "none",
                  background: "#ffffff",
                }}
              />
            )}

          {!submittedForm &&
            !error &&
            activeTab === "interpretation" &&
            !currentContent && (
              <iframe
                title="interpretation"
                className="gm-interpretation-frame"
                srcDoc={interpretationDoc}
                style={{
                  width: "100%",
                  height: "100%",
                  flex: 1,
                  minHeight: 0,
                  display: "block",
                  border: "none",
                  background: "#ffffff",
                }}
              />
            )}

          <div className="astromap-nav-arrows">
            <Tooltip
              tipKey="nav_prev"
              lang={form.language}
            >
              <button
                type="button"
                className="astromap-nav-arrow astromap-nav-arrow--left"
                onClick={goPrevTab}
                aria-label={isEn ? "Previous tab" : "Onglet précédent"}
              >
                ❮
              </button>
            </Tooltip>

            <Tooltip
              tipKey="nav_next"
              lang={form.language}
            >
              <button
                type="button"
                className="astromap-nav-arrow astromap-nav-arrow--right"
                onClick={goNextTab}
                aria-label={isEn ? "Next tab" : "Onglet suivant"}
              >
                ❯
              </button>
            </Tooltip>
          </div>
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

{exportDialogOpen ? (
  <div
    onClick={() => {
      if (!exportBusy) setExportDialogOpen(false);
    }}
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.18)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: 320,
        background: "#f8f8f5",
        border: "1px solid #bfc3c7",
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        padding: 14,
        fontSize: 14,
      }}
    >
      <div style={{ marginBottom: 12, fontWeight: 600 }}>
        {language === "en" ? "Export" : "Exporter"}
      </div>

      <div style={{ marginBottom: 10 }}>
        {language === "en"
          ? "What do you want to export?"
          : "Que voulez-vous exporter ?"}
      </div>

      {activeTab === "interpretation" ? (
        <>
          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="radio"
              name="astromap-export-kind"
              checked={exportKind === "pdf"}
              onChange={() => setExportKind("pdf")}
            />{" "}
            {language === "en" ? "PDF document" : "Document PDF"}
          </label>

          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="radio"
              name="astromap-export-kind"
              checked={exportKind === "txt"}
              onChange={() => setExportKind("txt")}
            />{" "}
            {language === "en" ? "Text (TXT)" : "Texte (TXT)"}
          </label>

          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="radio"
              name="astromap-export-kind"
              checked={exportKind === "json"}
              onChange={() => setExportKind("json")}
            />{" "}
            {language === "en" ? "JSON data" : "Données JSON"}
          </label>
        </>
      ) : (
        <>
          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="radio"
              name="astromap-export-kind"
              checked={exportKind === "pdf"}
              onChange={() => setExportKind("pdf")}
            />{" "}
            {language === "en" ? "PDF document" : "Document PDF"}
          </label>

          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="radio"
              name="astromap-export-kind"
              checked={exportKind === "svg"}
              onChange={() => setExportKind("svg")}
            />{" "}
            {language === "en" ? "SVG image" : "Image SVG"}
          </label>

          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="radio"
              name="astromap-export-kind"
              checked={exportKind === "json"}
              onChange={() => setExportKind("json")}
            />{" "}
            {language === "en" ? "JSON data" : "Données JSON"}
          </label>
        </>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 14,
        }}
      >
        <button
          type="button"
          onClick={() => setExportDialogOpen(false)}
          disabled={exportBusy}
        >
          {language === "en" ? "Cancel" : "Annuler"}
        </button>

        <button
          type="button"
          onClick={
            activeTab === "interpretation"
              ? runInterpretationExport
              : runGraphicExport
          }
          disabled={exportBusy}
        >
          {exportBusy
            ? language === "en"
              ? "Preparing…"
              : "Préparation…"
            : language === "en"
            ? "Export"
            : "Exporter"}
        </button>
      </div>
    </div>
  </div>
) : null}
  </div>
);
}
