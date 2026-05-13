export type TabKey =
  | "ecliptic"
  | "domitude"
  | "ret"
  | "transits"
  | "aspects"
  | "interpretation";

export type TimeReference = "HO" | "TU";
export type TransitAspectMode = "TN" | "TT";
export type UiLanguage = "fr" | "en";
export type DetailOrigin = "natal" | "transits";

export interface AstroFormState {
  name: string;

  day: string;
  month: string;
  year: string;

  hour: string;
  minute: string;
  timeRef: TimeReference;

  cityQuery: string;
  latitude: string;
  longitude: string;
  tz: string;

  language: UiLanguage;

  transitDay: string;
  transitMonth: string;
  transitYear: string;
  transitAspectMode: TransitAspectMode;
}

export interface ThemeSettingsPayload {
  house_system: string;
  language: UiLanguage;
}

export interface ThemeRequestPayload {
  name: string;
  datetime_local: string;
  latitude: number;
  longitude: number;
  tz: string;
  settings: ThemeSettingsPayload;
}

export interface TransitsRequestPayload extends ThemeRequestPayload {
  transit_datetime_local: string;
  aspect_mode: TransitAspectMode;
}

export interface ThemeResponsePayload {
  data: Record<string, unknown>;
}

export interface CitySearchItem {
  display: string;
  name: string;
  lat: number;
  lon: number;
  tz: string;
}

export interface PlanetPayload {
  name?: string;
  lon?: number | string;
  lat?: number | string;
  declination?: number | string;
  house?: number | string;
  retro?: boolean | number | string;
  retrograde?: boolean | number | string;
  rflag?: boolean | number | string;
  daily_motion?: number | string;
  [key: string]: unknown;
}

export interface AspectPayload {
  p1?: string;
  p2?: string;
  type?: string;
  orb?: number | string;
  [key: string]: unknown;
}

export interface ChartPayload {
  planets?: PlanetPayload[];
  aspects?: AspectPayload[];
  houses?: Record<string, unknown>[];
  axes?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PlanetDetails {
  title?: string;
  color?: string;
  position?: string;
  aspects?: string;
  ephemeris?: string;
  emptyText?: string;
}