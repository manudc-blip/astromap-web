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

export type ThemeFullPayload = {
  data: ThemeResponsePayload["data"];
  ecliptic_layout: EclipticLayoutPayload;
  domitude_svg: string;
  ret_svg: string;
  aspects_svg: string;
  interpretation_html: string;
};

const API_BASE = (import.meta.env.VITE_ASTROMAP_API_BASE || "http://localhost:8000").replace(/\/+$/, "");

const apiMemoryCache = new Map<string, Promise<string>>();

function isCacheableApiCall(path: string, init?: RequestInit) {
  const method = (init?.method || "GET").toUpperCase();

  if (method !== "POST") return false;

  return [
    "/theme",
    "/theme/full",
    "/theme/svg",
    "/theme/ecliptic-layout",
    "/theme/domitude-svg",
    "/ret/svg",
    "/transits",
    "/transits/svg",
    "/aspects/svg",
    "/interpretation/html",
  ].includes(path);
}

function buildApiCacheKey(path: string, init?: RequestInit) {
  const method = (init?.method || "GET").toUpperCase();
  const body = typeof init?.body === "string" ? init.body : "";

  const headers = new Headers({
    ...getAccessHeaders(),
    ...(init?.headers || {}),
  });

  const mode = headers.has("Authorization")
    ? "full"
    : headers.has("X-GeoAstro-Trial")
      ? `trial:${headers.get("X-GeoAstro-Trial")}`
      : "public";

  return `${method}|${path}|${mode}|${body}`;
}

export function clearAstroMapApiCache() {
  apiMemoryCache.clear();
}

function storeAccessTokenFromUrl() {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  const token = params.get("access_token");

  if (!token) {
    return;
  }

  localStorage.setItem("geoastro_astromap_access_token", token);

  params.delete("access_token");

  const cleanQuery = params.toString();
  const cleanUrl =
    window.location.pathname +
    (cleanQuery ? `?${cleanQuery}` : "") +
    window.location.hash;

  window.history.replaceState({}, document.title, cleanUrl);
}

storeAccessTokenFromUrl();

function getAccessHeaders() {
  if (typeof window === "undefined") return {};

  const params = new URLSearchParams(window.location.search);

  const access = params.get("access")?.toLowerCase();
  const trial = params.get("trial")?.toLowerCase();

  if (trial === "einstein" && access !== "full") {
    window.localStorage.removeItem("geoastro_astromap_access_token");

    return {
      "X-GeoAstro-Trial": "einstein",
    };
  }

  const accessToken = params.get("access_token");

  if (accessToken) {
    window.localStorage.setItem("geoastro_astromap_access_token", accessToken);

    return {
      Authorization: `Bearer ${accessToken}`,
    };
  }

  const storedToken = window.localStorage.getItem("geoastro_astromap_access_token");

  if (storedToken) {
    return {
      Authorization: `Bearer ${storedToken}`,
    };
  }

  // Accès complet local/URL simple, utilisé par ton mode ?access=full
  // À garder seulement si le backend accepte GEOASTRO_FULL_ACCESS_KEY.
  if (access === "full") {
    const fullKey = import.meta.env.VITE_GEOASTRO_FULL_ACCESS_KEY;

    if (fullKey) {
      return {
        "X-GeoAstro-Mode": "full",
        "X-GeoAstro-Access-Key": fullKey,
      };
    }
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
  const cacheable = isCacheableApiCall(path, init);
  const cacheKey = cacheable ? buildApiCacheKey(path, init) : "";

  if (cacheable && apiMemoryCache.has(cacheKey)) {
    return apiMemoryCache.get(cacheKey)!;
  }

  const requestPromise = fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...getAccessHeaders(),
      ...(init?.headers || {}),
    },
  })
    .then(async (res) => {
      const text = await res.text();

      if (!res.ok) {
        throw new Error(
          extractApiErrorMessage(text, `HTTP ${res.status}`)
        );
      }

      return text;
    })
    .catch((err) => {
      if (cacheable) {
        apiMemoryCache.delete(cacheKey);
      }
      throw err;
    });

  if (cacheable) {
    apiMemoryCache.set(cacheKey, requestPromise);
  }

  return requestPromise;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const text = await apiText(path, init);
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

export async function getThemeFull(payload: ThemeRequestPayload) {
  return apiJson<ThemeFullPayload>("/theme/full", {
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
