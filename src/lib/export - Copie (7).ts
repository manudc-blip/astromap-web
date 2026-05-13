export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  downloadBlob(filename, new Blob([content], { type: mime }));
}

function ensureSvgNamespaces(svg: string) {
  let out = svg.trim();

  if (!out.includes('xmlns="http://www.w3.org/2000/svg"')) {
    out = out.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  if (!out.includes('xmlns:xlink="http://www.w3.org/1999/xlink"')) {
    out = out.replace(/<svg\b/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }

  return out;
}


export function stripSvgChartTitle(svgText: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;

  const titleStarts = [
    "Thème écliptique",
    "Ecliptic chart",
    "Thème de domitude",
    "Domitude chart",
    "RET et Hiérarchie Planétaire",
    "RET and Planetary Hierarchy",
    "Thème de transit",
    "Transit chart",
    "Aspects planétaires",
    "Planetary aspects",
  ];

  Array.from(svg.querySelectorAll("text")).forEach((node) => {
    const txt = (node.textContent || "").trim();
    if (titleStarts.some((title) => txt.startsWith(title))) {
      node.remove();
    }
  });

  return ensureSvgNamespaces(new XMLSerializer().serializeToString(svg));
}


export function cropSvgViewBox(svgText: string, padding = 24): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;

  const hidden = document.createElement("div");
  hidden.style.position = "fixed";
  hidden.style.left = "-10000px";
  hidden.style.top = "-10000px";
  hidden.style.width = "1px";
  hidden.style.height = "1px";
  hidden.innerHTML = new XMLSerializer().serializeToString(svg);
  document.body.appendChild(hidden);

  try {
    const liveSvg = hidden.querySelector("svg") as SVGSVGElement | null;
    if (!liveSvg) return svgText;

    const bbox = liveSvg.getBBox();

    if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
      return svgText;
    }

    liveSvg.setAttribute(
      "viewBox",
      `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`
    );

    liveSvg.removeAttribute("width");
    liveSvg.removeAttribute("height");

    return ensureSvgNamespaces(liveSvg.outerHTML);
  } finally {
    document.body.removeChild(hidden);
  }
}

function getSvgSize(svgText: string): { width: number; height: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;

  const widthAttr = svg.getAttribute("width");
  const heightAttr = svg.getAttribute("height");
  const viewBox = svg.getAttribute("viewBox");

  const parseDim = (value: string | null) => {
    if (!value) return NaN;
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : NaN;
  };

  let width = parseDim(widthAttr);
  let height = parseDim(heightAttr);

  if ((!Number.isFinite(width) || !Number.isFinite(height)) && viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4) {
      width = parts[2];
      height = parts[3];
    }
  }

  if (!Number.isFinite(width) || width <= 0) width = 1200;
  if (!Number.isFinite(height) || height <= 0) height = 1200;

  return { width, height };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Impossible de convertir le blob en data URL."));
    reader.readAsDataURL(blob);
  });
}

export async function inlineSvgImages(svgText: string): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;

  const images = Array.from(svg.querySelectorAll("image"));

  await Promise.all(
    images.map(async (img) => {
      const href =
        img.getAttribute("href") ||
        img.getAttributeNS("http://www.w3.org/1999/xlink", "href");

      if (!href || href.startsWith("data:")) return;

      try {
        const res = await fetch(href, { mode: "cors" });
        if (!res.ok) {
          console.warn("Glyphe non chargé :", href, res.status);
          return;
        }

        const blob = await res.blob();
        const dataUrl = await blobToDataUrl(blob);

        img.setAttribute("href", dataUrl);
        img.removeAttribute("xlink:href");
      } catch (error) {
        console.warn("Erreur fetch glyphe :", href, error);
      }
    })
  );

  return ensureSvgNamespaces(new XMLSerializer().serializeToString(svg));
}

export async function svgTextToPngBlob(
  svgText: string,
  scale = 2
): Promise<Blob> {
  const safeSvg = ensureSvgNamespaces(svgText);
  const { width, height } = getSvgSize(safeSvg);

  const svgBlob = new Blob([safeSvg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(new Error("Impossible de charger le SVG pour export PNG."));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Contexte canvas introuvable.");
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value);
        else reject(new Error("Échec de génération du PNG."));
      }, "image/png");
    });

    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

type InterpretationLivrableInput = {
  language: "fr" | "en";
  documentTitle: string;
  dateLine: string;
  coordsLine: string;
  interpretationHtml: string;
  eclipticSvg: string;
  retSvg: string;
  aspectsSvg: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractHtmlParts(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const headStyles = Array.from(doc.head.querySelectorAll("style"))
    .map((node) => node.outerHTML)
    .join("\n");

  const bodyHtml = doc.body?.innerHTML?.trim() || html;

  return {
    headStyles,
    bodyHtml,
  };
}

export function htmlToPlainText(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body?.textContent || "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildInterpretationLivrableHtml(
  input: InterpretationLivrableInput
) {
  const {
    language,
    documentTitle,
    dateLine,
    coordsLine,
    interpretationHtml,
    eclipticSvg,
    retSvg,
    aspectsSvg,
  } = input;

  const { headStyles, bodyHtml } = extractHtmlParts(interpretationHtml);

  const eclipticTitle =
    language === "en" ? "Ecliptic chart" : "Thème écliptique";
  const retTitle = "RET / HP";
  const aspectsTitle =
    language === "en" ? "Planetary aspects" : "Aspects planétaires";
  const footer = "© 2025 GéoAstro – AstroMap v1.0";

  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(documentTitle)}</title>
  ${headStyles}
  <style>
    @page {
      size: A4;
      margin: 18mm 24mm 18mm 24mm;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: Helvetica, Arial, sans-serif;
    }

    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .pdf-page {
      break-after: page;
      page-break-after: always;
    }

    .pdf-page:last-child {
      break-after: auto;
      page-break-after: auto;
    }

    .chart-page {
      min-height: 261mm;
      display: flex;
      flex-direction: column;
    }

    .cover-title,
    .page-title {
      margin: 0;
      text-align: center;
      color: #1f4fa3;
      font-weight: 700;
    }

    .cover-title {
      font-size: 18pt;
      margin-top: 4mm;
      margin-bottom: 4mm;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .page-title {
      font-size: 17pt;
      margin-bottom: 5mm;
    }

    .meta-line {
      text-align: center;
      color: #344054;
      font-size: 11pt;
      margin-bottom: 2mm;
    }

    .chart-shell {
      flex: 1;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      margin-top: 2mm;
    }

    .chart-shell > svg {
      width: 132%;
      height: auto;
      max-height: 248mm;
      display: block;
      transform: scale(1.38);
      transform-origin: center top;
    }

    .chart-shell svg {
      max-width: 132%;
    }

    .chart-shell-ecliptic > svg,
    .chart-shell-ecliptic svg {
      transform: translateX(-18mm) scale(1.38);
      transform-origin: center top;
    }

    .chart-shell-ret > svg,
    .chart-shell-ret svg {
      transform: translateX(22mm) scale(1.38);
      transform-origin: center top;
    }

    .chart-shell-aspects > svg,
    .chart-shell-aspects svg {
      transform: scale(1.55);
      transform-origin: center top;
    }

    .page-footer {
      text-align: center;
      font-size: 8.5pt;
      color: #6b7280;
      margin-top: auto;
      padding-top: 8mm;
    }

    .interpretation-block {
      break-after: page;
      page-break-after: always;
      padding-bottom: 22mm !important;
    }

    .interpretation-wrap {
      width: 100% !important;
      max-width: none !important;
      margin: 0 auto !important;
      padding: 0 !important;
      font-family: Helvetica, Arial, sans-serif !important;
      font-size: 11pt !important;
      line-height: 15pt !important;
      color: #000000 !important;
    }

    .interpretation-wrap .wrap {
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      font-family: Helvetica, Arial, sans-serif !important;
    }

    .interpretation-wrap * {
      max-width: none !important;
    }

    .interpretation-wrap > *,
    .interpretation-wrap .wrap > * {
      width: 100% !important;
      max-width: none !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
    }

    .interpretation-wrap h1,
    .interpretation-wrap h2,
    .interpretation-wrap h3,
    .interpretation-wrap h4 {
      color: #1f3a5f;
      page-break-after: avoid;
    }

    .interpretation-wrap p,
    .interpretation-wrap li {
      orphans: 3;
      widows: 3;
    }

    .interpretation-wrap p,
    .interpretation-wrap .p,
    .interpretation-wrap li {
      font-family: Helvetica, Arial, sans-serif !important;
      font-size: 11pt !important;
      line-height: 15pt !important;
      margin: 0 0 10pt 0 !important;
      text-align: justify !important;
      color: #000000 !important;
    }

    .interpretation-wrap .section {
      font-family: Helvetica, Arial, sans-serif !important;
      font-size: 14pt !important;
      line-height: 17pt !important;
      font-weight: 700 !important;
      color: #1f3a5f !important;
      margin: 18pt 0 10pt 0 !important;
    }

    .interpretation-wrap .bold,
    .interpretation-wrap .bold-soft,
    .interpretation-wrap .bold-nogap {
      font-family: Helvetica, Arial, sans-serif !important;
      font-size: 11pt !important;
      line-height: 15pt !important;
      font-weight: 700 !important;
      color: #1f3a5f !important;
      margin: 0 0 10pt 0 !important;
    }

    .interpretation-wrap ul,
    .interpretation-wrap ol {
      margin-top: 0;
      margin-bottom: 10pt;
    }

    @media screen {
      body {
        background: #f3f4f6;
        padding: 12px;
      }

      .pdf-page {
        width: 210mm;
        margin: 0 auto 16px auto;
        background: white;
        box-shadow: 0 6px 18px rgba(0,0,0,0.12);
        padding: 18mm 8mm !important;
        box-sizing: border-box;
      }

      .interpretation-block {
        width: 210mm;
        margin: 0 auto 16px auto;
        background: white;
        box-shadow: 0 6px 18px rgba(0,0,0,0.12);
        padding: 18mm 24mm !important;
        box-sizing: border-box;
      }
    }
  </style>
</head>
<body>
  <section class="pdf-page chart-page">
    <h1 class="cover-title">${escapeHtml(documentTitle)}</h1>
    <div class="meta-line">${escapeHtml(dateLine)}</div>
    <div class="meta-line">${escapeHtml(coordsLine)}</div>
    <div class="chart-shell chart-shell-ecliptic">
      ${eclipticSvg}
    </div>
    <div class="page-footer">${escapeHtml(footer)}</div>
  </section>

  <section class="pdf-page chart-page">
    <h2 class="page-title">${escapeHtml(retTitle)}</h2>
    <div class="chart-shell chart-shell-ret">
      ${retSvg}
    </div>
    <div class="page-footer">${escapeHtml(footer)}</div>
  </section>

  <section class="interpretation-block">
    <div class="interpretation-wrap">
      ${bodyHtml}
    </div>
    <div class="page-footer">${escapeHtml(footer)}</div>
  </section>

  <section class="pdf-page chart-page">
    <h2 class="page-title">${escapeHtml(aspectsTitle)}</h2>
    <div class="chart-shell chart-shell-aspects">
      ${aspectsSvg}
    </div>
    <div class="page-footer">${escapeHtml(footer)}</div>
  </section>

  <script>
    window.addEventListener("load", () => {
      setTimeout(() => {
        window.focus();
        window.print();
      }, 350);
    });
  </script>
</body>
</html>`;
}

export function openPrintDocument(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");

  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error(
      "Impossible d’ouvrir la fenêtre d’impression. Autorise les popups pour continuer."
    );
  }

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60000);
}

export function buildGraphicLivrableHtml(input: {
  language: "fr" | "en";
  documentTitle: string;
  dateLine: string;
  coordsLine: string;
  pageTitle: string;
  svgMarkup: string;
}) {
  return `<!doctype html>
<html lang="${input.language}">
<head>
  <meta charset="utf-8" />
  <title>AstroMap PDF</title>
  <style>
    @page {
      size: A4;
      margin: 5mm;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      width: 100%;
      height: 100%;
    }

    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-family: "Segoe UI", Arial, sans-serif;
    }

    .pdf-page {
      width: 200mm;
      min-height: 287mm;
      margin: 0 auto;
      box-sizing: border-box;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      overflow: hidden;
      padding: 0;
    }

    .chart-shell {
      width: 200mm;
      height: 287mm;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 0;
      margin: 0;
    }

    .chart-shell > svg,
    .chart-shell svg {
      display: block;
      width: auto;
      height: auto;
      max-width: 200mm;
      max-height: 287mm;
      margin: 0 auto;
    }

    .chart-shell-ecliptic > svg,
    .chart-shell-ecliptic svg {
      transform: translateX(-12mm);
      transform-origin: center top;
    }

    @media screen {
      body {
        background: #f3f4f6;
        padding: 12px;
      }

      .pdf-page {
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        background: #ffffff;
        box-shadow: 0 6px 18px rgba(0,0,0,0.12);
      }
    }
  </style>
</head>
<body>
  <section class="pdf-page">
    <div class="chart-shell ${input.pageTitle === "Thème écliptique" || input.pageTitle === "Ecliptic chart" ? "chart-shell-ecliptic" : ""}">
      ${input.svgMarkup}
    </div>
  </section>

  <script>
    window.addEventListener("load", () => {
      setTimeout(() => {
        window.focus();
        window.print();
      }, 350);
    });
  </script>
</body>
</html>`;
}