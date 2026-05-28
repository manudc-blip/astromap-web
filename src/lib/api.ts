import type {
  CitySearchItem,
  ThemeRequestPayload,
  ThemeResponsePayload,
  TransitsRequestPayload,
  TabKey,
} from "../types/astromap";

export type EclipticLayoutPayload = {
  ok: boolean;
  width: number;
  height: number;
  viewBox: string;
  asset_base_url: string;
  language: string;
  transform: {
    center_dx: number;
    center_dy: number;
  };
  planets: Array<Record<string, any>>;
  signs: Array<Record<string, any>>;
  houses: Array<Record<string, any>>;
  axes: Record<string, any>;
  aspect_lines_svg: string[];
};

const API_BASE = (import.meta.env.VITE_ASTROMAP_API_BASE || "http://localhost:8000").replace(/\/+$/, "");

function getAccessHeaders() {
  if (typeof window === "undefined") return {};

  const params = new URLSearchParams(window.location.search);
  const access = params.get("access")?.toLowerCase();

  if (access === "full") {
    return {
      "X-GeoAstro-Access": "full"
    };
  }

  return {};
}

function extractApiErrorMessage(text: string, fallback: string) {
  try {
    const data = JSON.parse(text);

    if (typeof data?.detail === "string") {
      return data.detail;
    }

    if (typeof data?.message === "string") {
      return data.message;
    }

    if (typeof data?.error === "string") {
      return data.error;
    }
  } catch {
    // Réponse non JSON
  }

  return text || fallback;
}

async function apiText(path: string, init?: RequestInit): Promise<string> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
headers: {
  "Content-Type": "application/json",
  ...getAccessHeaders(),
  ...(init?.headers || {}),
},
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(
      extractApiErrorMessage(text, `HTTP ${res.status}`)
    );
  }

  return text;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
headers: {
  "Content-Type": "application/json",
  ...getAccessHeaders(),
  ...(init?.headers || {}),
},
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(
      extractApiErrorMessage(text, `HTTP ${res.status}`)
    );
  }

  return JSON.parse(text) as T;
}

export async function searchCities(q: string, lang: "fr" | "en"): Promise<CitySearchItem[]> {
  const params = new URLSearchParams({
    q,
    lang,
    max_results: "10",
  });

  return apiJson<CitySearchItem[]>(`/cities/search?${params.toString()}`);
}

export async function getThemeJson(payload: ThemeRequestPayload) {
  return apiJson<ThemeResponsePayload>("/theme", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getEclipticLayout(payload: ThemeRequestPayload) {
  return apiJson<EclipticLayoutPayload>("/theme/ecliptic-layout", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getTransitsJson(payload: TransitsRequestPayload) {
  return apiJson<ThemeResponsePayload>("/transits", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSvgForTab(tab: Exclude<TabKey, "interpretation" | "transits">, payload: ThemeRequestPayload) {
  const pathByTab: Record<Exclude<TabKey, "interpretation" | "transits">, string> = {
    ecliptic: "/theme/svg",
    domitude: "/theme/domitude-svg",
    ret: "/ret/svg",
    aspects: "/aspects/svg",
  };

  return apiText(pathByTab[tab], {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getInterpretationHtml(payload: ThemeRequestPayload) {
  return apiText("/interpretation/html", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getTransitsSvg(payload: TransitsRequestPayload) {
  return apiText("/transits/svg", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
