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
    out = out.replace(
      /<svg\b/,
      '<svg xmlns="http://www.w3.org/2000/svg"'
    );
  }

  if (!out.includes('xmlns:xlink="http://www.w3.org/1999/xlink"')) {
    out = out.replace(
      /<svg\b/,
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink"'
    );
  }

  return out;
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
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);

    if (parts.length === 4) {
      width = parts[2];
      height = parts[3];
    }
  }

  if (!Number.isFinite(width) || width <= 0) width = 1200;
  if (!Number.isFinite(height) || height <= 0) height = 1200;

  return { width, height };
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