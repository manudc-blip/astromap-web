import React from "react";
import Tooltip from "./Tooltip";

type DetailState = {
  title?: string;
  position?: string;
  aspects?: string;
  ephemeris?: string;
  emptyText?: string;
  color?: string;
};

type DetailsPanelProps = {
  language: "fr" | "en";
  selectedPlanet: string | null;
  details?: DetailState | null;
};

function buildClipboardText(language: "fr" | "en", details?: DetailState | null) {
  if (!details) return "";

  const parts: string[] = [];

  const title = (details.title || "").trim();
  const position = (details.position || "").trim();
  const aspects = (details.aspects || "").trim();
  const ephemeris = (details.ephemeris || "").trim();

  if (title) parts.push(title);
  if (position) parts.push(position);

  if (aspects) {
    parts.push("");
    parts.push(language === "en" ? "Aspects" : "Aspects");
    parts.push(aspects);
  }

  if (ephemeris) {
    parts.push("");
    parts.push(language === "en" ? "Ephemeris" : "Éphémérides");
    parts.push(ephemeris);
  }

  return parts.join("\n").trim();
}

export function DetailsPanel({
  language,
  selectedPlanet,
  details,
}: DetailsPanelProps) {
  const hasDetails =
    !!selectedPlanet &&
    !!details &&
    !!(details.title || details.position || details.aspects || details.ephemeris);

  const copyText = async () => {
    const text = buildClipboardText(language, details);
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  };

  const panelTitle = language === "en" ? "Details" : "Détails";
  const copyLabel = language === "en" ? "Copy" : "Copier";
  const emptyLabel =
    details?.emptyText ||
    (language === "en" ? "Click a planet." : "Cliquez sur une planète.");

  return (
    <div className="gm-details-overlay">
      <fieldset className="gm-details-card">
        <legend className="gm-details-legend">{panelTitle}</legend>

        <div className="gm-details-header">
          <div
            className={`gm-details-current ${hasDetails ? "" : "is-empty"}`}
            style={{ color: hasDetails ? details?.color || "#1f4e79" : "#1f4e79" }}
          >
            {hasDetails ? details?.title || selectedPlanet : emptyLabel}
          </div>

          <Tooltip
            tipKey="detail_copy"
            lang={language}
          >
            <button
              type="button"
              className="gm-details-copy"
              onClick={copyText}
              disabled={!hasDetails}
            >
              {copyLabel}
            </button>
          </Tooltip>
        </div>

        {hasDetails ? (
          <div className="gm-details-body">
            {!!details?.position && (
              <div className="gm-details-text gm-details-position">
                {details.position}
              </div>
            )}

            {!!details?.aspects && (
              <>
                <div className="gm-details-section">
                  {language === "en" ? "Aspects" : "Aspects"}
                </div>
                <div className="gm-details-text gm-details-aspects">{details.aspects}</div>
              </>
            )}

            {!!details?.ephemeris && (
              <>
                <div className="gm-details-section">
                  {language === "en" ? "Ephemeris" : "Éphémérides"}
                </div>
                <div className="gm-details-text">
                  {details.ephemeris
                    .split("\n")
                    .map((line, index) => (
                      <React.Fragment key={index}>
                        <span className={line.trim().startsWith("(rythme") ? "gm-details-indent" : ""}>
                          {line}
                        </span>
                        {index < details.ephemeris!.split("\n").length - 1 ? "\n" : null}
                      </React.Fragment>
                    ))}
                </div>
              </>
            )}
          </div>
        ) : null}
      </fieldset>
    </div>
  );
}

export default DetailsPanel;