import React, { useCallback, useEffect, useRef } from "react";
import Tooltip from "./Tooltip";

import logoFr from "../assets/sidebar/logo.svg";
import logoEn from "../assets/sidebar/logo.svg";

import flagFr from "../assets/sidebar/flag_fr.png";
import flagEn from "../assets/sidebar/flag_en.png";

import iconCalendar from "../assets/sidebar/icon_calendar.png";
import iconTime from "../assets/sidebar/icon_time.png";
import iconLocation from "../assets/sidebar/icon_location.png";
import iconCoordinates from "../assets/sidebar/icon_coordinates.png";
import iconCompute from "../assets/sidebar/icon_compute.png";
import iconReset from "../assets/sidebar/icon_reset.png";
import iconSave from "../assets/sidebar/icon_save.png";
import iconId from "../assets/sidebar/icon_id.png";
import iconWorldSearch from "../assets/sidebar/icon_world_search.png";
import iconInfo from "../assets/sidebar/icon_info.png";
import iconCalendarTransit from "../assets/sidebar/icon_calendar_transit.png";
import iconAspectsTransit from "../assets/sidebar/icon_aspects_transit.png";

export type AstroLang = "fr" | "en";
export type AstroTabKey =
  | "ecliptic"
  | "domitude"
  | "ret"
  | "transits"
  | "aspects"
  | "interpretation";

export type IdentMode = "ID" | "WORLD";
export type TimeRef = "HO" | "TU";
export type CoordsDisplayMode = "DEC" | "DMS";
export type TransitAspectMode = "TN" | "TT";

export interface SidebarSuggestion {
  id?: string | number;
  label: string;
  subLabel?: string;
  disabled?: boolean;
  kind?: "header" | "item";
}

export interface AstroSidebarForm {
  name: string;
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
  timeRef: TimeRef;

  cityQuery: string;
  latitude: string;
  longitude: string;
  tz: string;

  language: AstroLang;

  transitDay: string;
  transitMonth: string;
  transitYear: string;
  transitAspectMode: TransitAspectMode;
  transitPanelExpanded: boolean;
}

export interface AstroSidebarProps {
  form: AstroSidebarForm;
  activeTab: AstroTabKey;

  identMode?: IdentMode;
  dnSource?: string;
  cityHint?: string;
  coordsLocked?: boolean;
  coordsDisplayMode?: CoordsDisplayMode;
  locked?: boolean;
  trialMode?: boolean;

  showDnSuggestions?: boolean;
  dnSuggestions?: SidebarSuggestion[];
  showCitySuggestions?: boolean;
  citySuggestions?: SidebarSuggestion[];

  onFormChange: (patch: Partial<AstroSidebarForm>) => void;

  onSpinStart?: () => void;
  onSpinEnd?: () => void;
  onToggleIdentMode?: () => void;
  onToggleTimeRef: () => void;
  onToggleCoordsDisplay?: () => void;
  onToggleTransitPanel: () => void;

  onShiftNatalDate: (part: "day" | "month" | "year", step: 1 | -1) => void;
  onShiftNatalTime: (part: "hour" | "minute", step: 1 | -1) => void;
  onShiftTransitDate: (
    part: "transitDay" | "transitMonth" | "transitYear",
    step: 1 | -1
  ) => void;

  onCompute: () => void;
  onReset: () => void;
  onExport: () => void;

  onSelectDnSuggestion?: (item: SidebarSuggestion) => void;
  onSelectCitySuggestion?: (item: SidebarSuggestion) => void;
  onCloseCitySuggestions?: () => void;
}

const TEXT = {
  fr: {
    module: "Module AstroMap",
    identification: "Identification",
    searchDn: "Recherche DN",
    nameOptional: "Nom (facultatif)",
    dateTime: "Date & heure",
    dateLabel: "Date (locale) JJ/MM/AAAA",
    timeLabelLocal: "Heure (locale) HH:MM",
    timeLabelUtc: "Heure (UTC) HH:MM",
    timeReference: "Référence heure",
    location: "Localisation",
    citySearch: "Ville (recherche)",
    cityHint: "Saisie assistée",
    latLon: "Latitude, Longitude",
    timezone: "Fuseau horaire (ex. Europe/Paris ou +01:00)",
    options: "Options",
    language: "Langue",
    transits: "Transits",
    actions: "Actions",
    reset: "Réinitialiser",
    compute: "Calculer",
    export: "Exporter...",
    ho: "HO",
    tu: "TU",
    transitNatal: "Transits → Natal",
    transitTransit: "Entre transits",
  },
  en: {
    module: "AstroMap Module",
    identification: "Identification",
    searchDn: "DN search",
    nameOptional: "Name (optional)",
    dateTime: "Date & time",
    dateLabel: "Date (local) DD/MM/YYYY",
    timeLabelLocal: "Time (local) HH:MM",
    timeLabelUtc: "Time (UTC) HH:MM",
    timeReference: "Time reference",
    location: "Location",
    citySearch: "City (search)",
    cityHint: "Assisted entry",
    latLon: "Latitude, Longitude",
    timezone: "Time zone (e.g. Europe/Paris or +01:00)",
    options: "Options",
    language: "Language",
    transits: "Transits",
    actions: "Actions",
    reset: "Reset",
    compute: "Compute",
    export: "Export...",
    ho: "LT",
    tu: "UT",
    transitNatal: "Transit → Natal",
    transitTransit: "Between transits",
  },
} as const;

function LabelWithIcon(props: {
  icon?: string;
  text: string;
  extraRight?: React.ReactNode;
}) {
  return (
    <div className="astromap-label-row">
      <div className="astromap-label-left">
        {props.icon ? (
          <img className="astromap-inline-icon" src={props.icon} alt="" />
        ) : null}
        <span>{props.text}</span>
      </div>
      {props.extraRight ? (
        <div className="astromap-label-right">{props.extraRight}</div>
      ) : null}
    </div>
  );
}

function MiniSpinButton({
  label,
  onStep,
  onSpinStart,
  onSpinEnd,
}: {
  label: string;
  onStep: () => void;
  onSpinStart?: () => void;
  onSpinEnd?: () => void;
}) {
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const clearRepeat = useCallback(
    (notifyEnd = true) => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (notifyEnd) {
        onSpinEnd?.();
      }
    },
    [onSpinEnd]
  );

  const startRepeat = useCallback(() => {
    clearRepeat(false);
    onSpinStart?.();
    onStep();

    timeoutRef.current = window.setTimeout(() => {
      intervalRef.current = window.setInterval(() => {
        onStep();
      }, 90);
    }, 160);
  }, [clearRepeat, onSpinStart, onStep]);

  useEffect(() => {
    return () => clearRepeat(false);
  }, [clearRepeat]);

  return (
    <button
      type="button"
      className="astromap-mini-btn"
      aria-label={label}
      onMouseDown={(e) => {
        e.preventDefault();
        startRepeat();
      }}
      onMouseUp={() => clearRepeat(true)}
      onMouseLeave={() => clearRepeat(true)}
      onBlur={() => clearRepeat(true)}
      onTouchStart={(e) => {
        e.preventDefault();
        startRepeat();
      }}
      onTouchEnd={() => clearRepeat(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onStep();
        }
      }}
    >
    <span
      className={
        label === "+"
          ? "astromap-mini-btn-symbol astromap-mini-btn-symbol--plus"
          : "astromap-mini-btn-symbol astromap-mini-btn-symbol--minus"
      }
    >
      {label}
    </span>
    </button>
  );
}

function SuggestionDropdown(props: {
  variant: "city" | "dn";
  items: SidebarSuggestion[];
  onSelect?: (item: SidebarSuggestion) => void;
}) {
  if (!props.items.length) return null;

  return (
    <div
      className={`astromap-suggestions astromap-suggestions--${props.variant}`}
    >
      {props.items.map((item, index) => {
        const key = item.id ?? `${props.variant}-${index}`;

        if (item.kind === "header") {
          return (
            <div key={key} className="astromap-suggestion-header">
              {item.label}
            </div>
          );
        }

        return (
          <button
            key={key}
            type="button"
            className={`astromap-suggestion-item ${
              item.subLabel ? "astromap-suggestion-item--two-lines" : ""
            }`}
            disabled={item.disabled}
            onClick={() => props.onSelect?.(item)}
          >
            <span className="astromap-suggestion-main">{item.label}</span>
            {item.subLabel ? (
              <span className="astromap-suggestion-sub">{item.subLabel}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default function AstroSidebar({
  form,
  activeTab,
  identMode = "ID",
  dnSource = "",
  cityHint,
  coordsLocked = false,
  coordsDisplayMode = "DEC",
  locked = false,
  trialMode = false,
  showDnSuggestions = false,
  dnSuggestions = [],
  showCitySuggestions = false,
  citySuggestions = [],
  onFormChange,
  onToggleIdentMode,
  onToggleTimeRef,
  onToggleCoordsDisplay,
  onToggleTransitPanel,
  onShiftNatalDate,
  onShiftNatalTime,
  onShiftTransitDate,
  onSpinStart,
  onSpinEnd,
  onCompute,
  onReset,
  onExport,
  onSelectDnSuggestion,
  onSelectCitySuggestion,
  onCloseCitySuggestions,
}: AstroSidebarProps) {

  const t = TEXT[form.language];
  const isTransitTab = activeTab === "transits";
  const logoSrc = form.language === "fr" ? logoFr : logoEn;
  const identIcon = identMode === "WORLD" ? iconWorldSearch : iconId;
  const timeRefLabel = form.timeRef === "TU" ? t.tu : t.ho;
  const coordsToggleLabel = coordsDisplayMode === "DEC" ? "10" : "60";

  const natalDayRef = useRef<HTMLInputElement | null>(null);
  const natalMonthRef = useRef<HTMLInputElement | null>(null);
  const natalYearRef = useRef<HTMLInputElement | null>(null);

  const natalHourRef = useRef<HTMLInputElement | null>(null);
  const natalMinuteRef = useRef<HTMLInputElement | null>(null);

  const transitDayRef = useRef<HTMLInputElement | null>(null);
  const transitMonthRef = useRef<HTMLInputElement | null>(null);
  const transitYearRef = useRef<HTMLInputElement | null>(null);

const cityDropdownRef = useRef<HTMLDivElement | null>(null);

useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (!showCitySuggestions) return;

    const target = event.target as Node;

    if (cityDropdownRef.current?.contains(target)) {
      return;
    }

    onCloseCitySuggestions?.();
  };

  document.addEventListener("mousedown", handleClickOutside);
  return () => document.removeEventListener("mousedown", handleClickOutside);
}, [showCitySuggestions, onCloseCitySuggestions]);
  
  const getFocusedNatalDatePart = (): "day" | "month" | "year" => {
    const active = document.activeElement;
    if (active === natalMonthRef.current) return "month";
    if (active === natalYearRef.current) return "year";
    return "day";
  };

  const getFocusedNatalTimePart = (): "hour" | "minute" => {
    const active = document.activeElement;
    if (active === natalMinuteRef.current) return "minute";
    return "hour";
  };

  const getFocusedTransitDatePart = ():
    | "transitDay"
    | "transitMonth"
    | "transitYear" => {
    const active = document.activeElement;
    if (active === transitMonthRef.current) return "transitMonth";
    if (active === transitYearRef.current) return "transitYear";
    return "transitDay";
  };

  return (
    <fieldset
      className="astromap-sidebar-panel"
      disabled={locked}
      style={{ border: 0, margin: 0, padding: 0 }}
    >
      <div className="astromap-logo-wrap">
        <img className="astromap-logo" src={logoSrc} alt="GéoAstro" />
        <div className="astromap-logo-title">
          {form.language === "en" ? "GeoAstro" : "GéoAstro"}
        </div>
        <div className="astromap-logo-subtitle">{t.module}</div>
      </div>
      <section className="astromap-sidebar-section">
        <h3 className="astromap-section-title">{t.identification}</h3>

        <div className="astromap-name-header">
          <label className="astromap-field-label" htmlFor="astromap-name">
            {identMode === "WORLD" ? t.searchDn : t.nameOptional}
          </label>

        <Tooltip
          tipKey="sidebar_ident_mode"
          lang={form.language}
        >
          <button
            type="button"
            className="astromap-ident-toggle"
            onClick={onToggleIdentMode}
          >
            <img
              src={identIcon}
              alt=""
            />
          </button>
        </Tooltip>
        </div>

        <div className="astromap-dropdown-host">
          <input
            id="astromap-name"
            name="dn_search"
            className="astromap-input"
            value={form.name}
            onChange={(e) => onFormChange({ name: e.target.value })}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />

          {identMode === "WORLD" && dnSource ? (
            <div className="astromap-dn-source">
              <img src={iconInfo} alt="" />
              <span>{dnSource}</span>
            </div>
          ) : null}

          {showDnSuggestions ? (
            <SuggestionDropdown
              variant="dn"
              items={dnSuggestions}
              onSelect={onSelectDnSuggestion}
            />
          ) : null}
        </div>
      </section>

      <section className="astromap-sidebar-section">
        <h3 className="astromap-section-title">{t.dateTime}</h3>

        <LabelWithIcon icon={iconCalendar} text={t.dateLabel} />

        <div className="astromap-row astromap-row--date">
          <input
            ref={natalDayRef}
            className="astromap-input astromap-input--dd"
            value={form.day}
            onChange={(e) => onFormChange({ day: e.target.value })}
          />
          <input
            ref={natalMonthRef}
            className="astromap-input astromap-input--dd"
            value={form.month}
            onChange={(e) => onFormChange({ month: e.target.value })}
          />
          <input
            ref={natalYearRef}
            className="astromap-input astromap-input--yyyy"
            value={form.year}
            onChange={(e) => onFormChange({ year: e.target.value })}
          />

<MiniSpinButton
  label="+"
  onStep={() => onShiftNatalDate(getFocusedNatalDatePart(), 1)}
/>
<MiniSpinButton
  label="-"
  onStep={() => onShiftNatalDate(getFocusedNatalDatePart(), -1)}
/>
        </div>

        <LabelWithIcon
          icon={iconTime}
          text={form.timeRef === "TU" ? t.timeLabelUtc : t.timeLabelLocal}
        />

        <div className="astromap-row astromap-row--time">
          <input
            ref={natalHourRef}
            className="astromap-input astromap-input--time"
            value={form.hour}
            onChange={(e) => onFormChange({ hour: e.target.value })}
          />
          <input
            ref={natalMinuteRef}
            className="astromap-input astromap-input--time"
            value={form.minute}
            onChange={(e) => onFormChange({ minute: e.target.value })}
          />

          <MiniSpinButton
            label="+"
            onSpinStart={onSpinStart}
            onSpinEnd={onSpinEnd}
            onStep={() => onShiftNatalTime(getFocusedNatalTimePart(), 1)}
          />
          <MiniSpinButton
            label="-"
            onSpinStart={onSpinStart}
            onSpinEnd={onSpinEnd}
            onStep={() => onShiftNatalTime(getFocusedNatalTimePart(), -1)}
          />
        </div>

        <LabelWithIcon
          text={`${t.timeReference} :`}
          extraRight={
            <Tooltip
              tipKey="sidebar_time_ref"
              lang={form.language}
            >
              <button
                type="button"
                className="astromap-mini-toggle"
                onClick={onToggleTimeRef}
              >
                {timeRefLabel}
              </button>
            </Tooltip>
          }
        />
      </section>

      <section className="astromap-sidebar-section">
        <h3 className="astromap-section-title">{t.location}</h3>

        <LabelWithIcon icon={iconLocation} text={t.citySearch} />

        <div className="astromap-dropdown-host" ref={cityDropdownRef}>
          <input
            className="astromap-input"
            value={form.cityQuery}
            onChange={(e) => onFormChange({ cityQuery: e.target.value })}
          />

          <div className="astromap-hint">{cityHint || t.cityHint}</div>

          {showCitySuggestions ? (
            <SuggestionDropdown
              variant="city"
              items={citySuggestions}
              onSelect={onSelectCitySuggestion}
            />
          ) : null}
        </div>

        <LabelWithIcon
          icon={iconCoordinates}
          text={t.latLon}
          extraRight={
            <Tooltip
              tipKey="sidebar_coords_toggle"
              lang={form.language}
            >
              <button
                type="button"
                className="astromap-small-toggle astromap-small-toggle--coords"
                onClick={() => onToggleCoordsDisplay?.()}
              >
                {coordsToggleLabel}
              </button>
            </Tooltip>
          }
        />

        <div className="astromap-row astromap-row--coords">
          <input
            className="astromap-input astromap-input--coord"
            value={form.latitude}
            readOnly={coordsLocked}
            onChange={(e) => onFormChange({ latitude: e.target.value })}
          />
          <input
            className="astromap-input astromap-input--coord"
            value={form.longitude}
            readOnly={coordsLocked}
            onChange={(e) => onFormChange({ longitude: e.target.value })}
          />
        </div>

        <label
          className="astromap-field-label astromap-timezone-label"
          htmlFor="astromap-timezone"
        >
          {t.timezone}
        </label>
        <input
          id="astromap-timezone"
          className="astromap-input"
          value={form.tz}
          onChange={(e) => onFormChange({ tz: e.target.value })}
        />
      </section>

      <section className="astromap-sidebar-section">
        <h3 className="astromap-section-title">{t.options}</h3>

        <div className="astromap-language-row">
          <span className="astromap-field-label">{t.language}</span>

          <Tooltip
            tipKey="sidebar_language"
            lang={form.language}
          >
            <label className="astromap-radio-inline">
              <input
                type="radio"
                checked={form.language === "fr"}
                onChange={() => onFormChange({ language: "fr" })}
              />
              <img src={flagFr} alt="" />
              <span>FR</span>
            </label>
          </Tooltip>

          <Tooltip
            tipKey="sidebar_language"
            lang={form.language}
          >
            <label className="astromap-radio-inline">
              <input
                type="radio"
                checked={form.language === "en"}
                onChange={() => onFormChange({ language: "en" })}
              />
              <img src={flagEn} alt="" />
              <span>EN</span>
            </label>
          </Tooltip>
        </div>
      </section>

      {isTransitTab ? (
        <section className="astromap-sidebar-section astromap-sidebar-section--transits">
          <div className="astromap-transit-header">
            <h3 className="astromap-section-title">{t.transits}</h3>
            <button
              type="button"
              className="astromap-transit-toggle"
              onClick={onToggleTransitPanel}
            >
              {form.transitPanelExpanded ? "▾" : "▸"}
            </button>
          </div>

          {form.transitPanelExpanded ? (
            <>
              <div className="astromap-transit-block">
                <div className="astromap-transit-inline-row">
                  <img
                    className="astromap-transit-banner-icon"
                    src={iconCalendarTransit}
                    alt=""
                  />

                  <div className="astromap-row astromap-row--transit-date">
                    <input
                      ref={transitDayRef}
                      className="astromap-input astromap-input--dd"
                      value={form.transitDay}
                      onChange={(e) =>
                        onFormChange({ transitDay: e.target.value })
                      }
                    />
                    <input
                      ref={transitMonthRef}
                      className="astromap-input astromap-input--dd"
                      value={form.transitMonth}
                      onChange={(e) =>
                        onFormChange({ transitMonth: e.target.value })
                      }
                    />
                    <input
                      ref={transitYearRef}
                      className="astromap-input astromap-input--yyyy"
                      value={form.transitYear}
                      onChange={(e) =>
                        onFormChange({ transitYear: e.target.value })
                      }
                    />

<MiniSpinButton
  label="+"
  onStep={() => onShiftTransitDate(getFocusedTransitDatePart(), 1)}
/>
<MiniSpinButton
  label="-"
  onStep={() => onShiftTransitDate(getFocusedTransitDatePart(), -1)}
/>
                  </div>
                </div>
              </div>

              <div className="astromap-transit-block">
                <div className="astromap-transit-inline-row astromap-transit-inline-row--aspects">
                  <img
                    className="astromap-transit-aspects-icon"
                    src={iconAspectsTransit}
                    alt=""
                  />

                  <div className="astromap-radio-stack astromap-radio-stack--inline">
                    <Tooltip
                      tipKey="transit_aspect_mode"
                      lang={form.language}
                    >
                      <label className="astromap-radio-inline astromap-radio-inline--plain">
                        <input
                          type="radio"
                          checked={form.transitAspectMode === "TN"}
                          onChange={() =>
                            onFormChange({ transitAspectMode: "TN" })
                          }
                        />
                        <span>{t.transitNatal}</span>
                      </label>
                    </Tooltip>

                    <Tooltip
                      tipKey="transit_aspect_mode"
                      lang={form.language}
                    >
                      <label className="astromap-radio-inline astromap-radio-inline--plain">
                        <input
                          type="radio"
                          checked={form.transitAspectMode === "TT"}
                          onChange={() =>
                            onFormChange({ transitAspectMode: "TT" })
                          }
                        />
                        <span>{t.transitTransit}</span>
                      </label>
                    </Tooltip>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="astromap-sidebar-section astromap-sidebar-section--actions">
        <h3 className="astromap-section-title">{t.actions}</h3>

        <div className="astromap-actions-row">
          <Tooltip
            tipKey="sidebar_reset"
            lang={form.language}
          >
            <button
              type="button"
              className="astromap-action-btn"
              onClick={onReset}
            >
              <img src={iconReset} alt="" />
              <span>{t.reset}</span>
            </button>
          </Tooltip>

          <Tooltip
            tipKey="sidebar_compute"
            lang={form.language}
          >
            <button
              type="button"
              className="astromap-action-btn astromap-action-btn--primary"
              onClick={onCompute}
            >
              <img src={iconCompute} alt="" />
              <span>{t.compute}</span>
            </button>
          </Tooltip>
        {trialMode ? (
          <div
            style={{
              marginTop: "6px",
              marginBottom: "4px",
              fontSize: "11px",
              color: "#6b7280",
              lineHeight: 1.25,
              textAlign: "center",
            }}
          >
            {form.language === "en"
              ? "Trial mode: Einstein chart only."
              : "Mode essai : thème Einstein uniquement."}
          </div>
        ) : null}
        </div>

        <Tooltip
          tipKey="sidebar_export"
          lang={form.language}
        >
<button
  type="button"
  className="astromap-action-btn astromap-action-btn--full"
  onClick={onExport}
>
            <img src={iconSave} alt="" />
            <span>{t.export}</span>
          </button>
        </Tooltip>
      </section>
    </fieldset>
  );
}
