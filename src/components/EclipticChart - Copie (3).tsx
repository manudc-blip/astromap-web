import type { EclipticLayoutPayload } from "../lib/api";

type EclipticChartProps = {
  layout: EclipticLayoutPayload;
};

function fmt(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pointsToString(points: unknown) {
  if (!Array.isArray(points)) return "";

  return points
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null;

      const x = fmt(point[0]);
      const y = fmt(point[1]);

      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(" ");
}

function polarToXY(cx: number, cy: number, r: number, deg: number) {
  const th = (deg * Math.PI) / 180;

  return {
    x: cx + r * Math.cos(th),
    y: cy - r * Math.sin(th),
  };
}

function angleFromPoint(cx: number, cy: number, x: number, y: number) {
  return ((Math.atan2(cy - y, x - cx) * 180) / Math.PI + 360) % 360;
}

function forwardExtent(a1: number, a2: number) {
  const ext = a2 - a1;
  return ext < 0 ? ext + 360 : ext;
}

function arcPoints(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  extentDeg: number,
  steps = 8
) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const a = startDeg + extentDeg * t;
    const p = polarToXY(cx, cy, r, a);

    return `${p.x},${p.y}`;
  }).join(" ");
}

function trimAxisSegment(
  segment: any,
  cx: number,
  cy: number,
  rStop: number
) {
  let x1 = fmt(segment.x1);
  let y1 = fmt(segment.y1);
  let x2 = fmt(segment.x2);
  let y2 = fmt(segment.y2);

  const d1 = Math.hypot(x1 - cx, y1 - cy);
  const d2 = Math.hypot(x2 - cx, y2 - cy);

  if (d1 < rStop) {
    const a = Math.atan2(cy - y1, x1 - cx);
    x1 = cx + rStop * Math.cos(a);
    y1 = cy - rStop * Math.sin(a);
  }

  if (d2 < rStop) {
    const a = Math.atan2(cy - y2, x2 - cx);
    x2 = cx + rStop * Math.cos(a);
    y2 = cy - rStop * Math.sin(a);
  }

  return { x1, y1, x2, y2 };
}

export default function EclipticChart({ layout }: EclipticChartProps) {
  const scale = 1;
  const dx = layout.transform?.center_dx ?? 0;
  const dy = layout.transform?.center_dy ?? 0;

  const cx = fmt(layout?.meta?.center?.x, 500);
  const cy = fmt(layout?.meta?.center?.y, 450);
  const rOuter = fmt(layout?.radii?.outer, 250);
  const rInner = fmt(layout?.radii?.inner, 180);

  const gridBand = Math.min(layout.width, layout.height) * 0.8 * 0.02;

  const rGridOut = rOuter - 1.5;
  const rGridIn = rGridOut - gridBand;
  const rLinkOuter = (rGridIn + rGridOut) * 0.5;

  const r2GridIn = rInner + 1;
  const r2GridOut = r2GridIn + gridBand;
  const rLinkInner = (r2GridIn + r2GridOut) * 0.5;

  const boundaryAngles = (layout.zodiac_boundaries ?? [])
    .map((boundary: any) => {
      const outer = boundary.outer;
      if (!Array.isArray(outer)) return null;

      return angleFromPoint(cx, cy, fmt(outer[0]), fmt(outer[1]));
    })
    .filter((angle): angle is number => angle !== null);

  return (
    <svg
      width={layout.width}
      height={layout.height}
      viewBox={layout.viewBox}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="100%" height="100%" fill="#FFFFFF" />

      <defs>
        <filter id="glyphWhiteOutline" x="-30%" y="-30%" width="160%" height="160%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="1.8" result="dilated" />
          <feFlood floodColor="#FFFFFF" result="white" />
          <feComposite in="white" in2="dilated" operator="in" result="outline" />
          <feMerge>
            <feMergeNode in="outline" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <text
        x={layout.width / 2 + 90}
        y={22}
        fontFamily="Segoe UI, Arial, sans-serif"
        fontSize={24}
        fontWeight={700}
        fill="#1f4fa3"
        textAnchor="middle"
        dominantBaseline="hanging"
      >
        {layout?.meta?.title ?? "Thème écliptique"}
      </text>

      <g transform={`translate(${dx}, ${dy}) translate(${cx}, ${cy}) scale(${scale}) translate(${-cx}, ${-cy})`}>

        {Object.entries(layout.axes ?? {}).map(([label, axis]: [string, any]) => {
          return (
            <g key={`axis-${label}`}>
              {axis.segments?.map((segment: any, index: number) => {
                const width = fmt(axis.width, 3);
                const trimmed = trimAxisSegment(
                  segment,
                  cx,
                  cy,
                  rOuter + width / 2 + 0.5
                );

                return (
                  <line
                    key={`axis-${label}-${index}`}
                    x1={trimmed.x1}
                    y1={trimmed.y1}
                    x2={trimmed.x2}
                    y2={trimmed.y2}
                    stroke="#222222"
                    strokeWidth={width}
                    strokeLinecap="round"
                  />
                );
              })}

              {axis.decoration?.type === "arrow" && (
                <>
                  <line
                    x1={fmt(axis.decoration.tip?.x)}
                    y1={fmt(axis.decoration.tip?.y)}
                    x2={fmt(axis.decoration.left?.x)}
                    y2={fmt(axis.decoration.left?.y)}
                    stroke="#222222"
                    strokeWidth={fmt(axis.width, 3)}
                    strokeLinecap="round"
                  />
                  <line
                    x1={fmt(axis.decoration.tip?.x)}
                    y1={fmt(axis.decoration.tip?.y)}
                    x2={fmt(axis.decoration.right?.x)}
                    y2={fmt(axis.decoration.right?.y)}
                    stroke="#222222"
                    strokeWidth={fmt(axis.width, 3)}
                    strokeLinecap="round"
                  />
                </>
              )}

              {axis.decoration?.type === "crossbar" && (
                <line
                  x1={fmt(axis.decoration.left?.x)}
                  y1={fmt(axis.decoration.left?.y)}
                  x2={fmt(axis.decoration.right?.x)}
                  y2={fmt(axis.decoration.right?.y)}
                  stroke="#222222"
                  strokeWidth={fmt(axis.width, 3)}
                  strokeLinecap="round"
                />
              )}

              {axis.decoration?.type === "circle" && (
                <circle
                  cx={fmt(axis.decoration.cx)}
                  cy={fmt(axis.decoration.cy)}
                  r={fmt(axis.decoration.r, 18)}
                  stroke="#222222"
                  strokeWidth={fmt(axis.width, 3)}
                  fill="none"
                />
              )}

              {axis.decoration?.type === "half_circle" && (
                <polyline
                  points={arcPoints(
                    fmt(axis.decoration.cx),
                    fmt(axis.decoration.cy),
                    fmt(axis.decoration.r, 18),
                    fmt(axis.decoration.start),
                    fmt(axis.decoration.extent, 180),
                    24
                  )}
                  stroke="#222222"
                  strokeWidth={fmt(axis.width, 3)}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {axis.decoration?.type === "polyline" && (
                <polyline
                  points={pointsToString(axis.decoration.points)}
                  stroke="#222222"
                  strokeWidth={fmt(axis.width, 3)}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {axis.href && (
                <image
                  href={axis.href}
                  x={fmt(axis.glyph?.x ?? axis.x) - fmt(axis.glyph?.px ?? axis.px, 32) / 2}
                  y={fmt(axis.glyph?.y ?? axis.y) - fmt(axis.glyph?.px ?? axis.px, 32) / 2}
                  width={fmt(axis.glyph?.px ?? axis.px, 32)}
                  height={fmt(axis.glyph?.px ?? axis.px, 32)}
                  preserveAspectRatio="xMidYMid meet"
                />
              )}
            </g>
          );
        })}

        <circle
          cx={cx}
          cy={cy}
          r={rOuter}
          stroke="#4A4A4A"
          strokeWidth={3}
          fill="none"
        />

        <circle
          cx={cx}
          cy={cy}
          r={rInner}
          stroke="#4A4A4A"
          strokeWidth={3}
          fill="none"
        />

        {boundaryAngles.length === 12 &&
          boundaryAngles.map((aStart, i) => {
            const aEnd = boundaryAngles[(i + 1) % 12];
            const extent30 = forwardExtent(aStart, aEnd);

            return Array.from({ length: 6 }, (_, k) => {
              const a1 = (aStart + extent30 * (k / 6)) % 360;
              const a2 = (aStart + extent30 * ((k + 1) / 6)) % 360;

              const outerTick1 = polarToXY(cx, cy, rGridOut, a1);
              const outerTick2 = polarToXY(cx, cy, rLinkOuter, a1);
              const innerTick1 = polarToXY(cx, cy, r2GridIn, a1);
              const innerTick2 = polarToXY(cx, cy, rLinkInner, a1);

              return (
                <g key={`grid-${i}-${k}`}>
                  {k !== 0 && (
                    <>
                      <line
                        x1={outerTick1.x}
                        y1={outerTick1.y}
                        x2={outerTick2.x}
                        y2={outerTick2.y}
                        stroke="#d0d0d0"
                        strokeWidth={1}
                        strokeLinecap="butt"
                      />
                      <line
                        x1={innerTick1.x}
                        y1={innerTick1.y}
                        x2={innerTick2.x}
                        y2={innerTick2.y}
                        stroke="#d0d0d0"
                        strokeWidth={1}
                        strokeLinecap="butt"
                      />
                    </>
                  )}

                  <polyline
                    points={arcPoints(cx, cy, rLinkOuter, a1, forwardExtent(a1, a2))}
                    stroke="#cfcfcf"
                    strokeWidth={1}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={arcPoints(cx, cy, rLinkInner, a1, forwardExtent(a1, a2))}
                    stroke="#cfcfcf"
                    strokeWidth={1}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            });
          })}

        {layout.zodiac_boundaries?.map((boundary: any, index: number) => {
          const inner = boundary.inner;
          const outer = boundary.outer;

          if (!Array.isArray(inner) || !Array.isArray(outer)) return null;

          return (
            <line
              key={`zodiac-boundary-${index}`}
              x1={fmt(inner[0])}
              y1={fmt(inner[1])}
              x2={fmt(outer[0])}
              y2={fmt(outer[1])}
              stroke="#4A4A4A"
              strokeWidth={3}
              strokeLinecap="round"
            />
          );
        })}

        {layout.house_marks?.map((house: any, index: number) => {
          const mark = house.mark;
          const label = house.label;

          if (!mark || !label) return null;

          return (
            <g key={`house-mark-${index}`}>
              <line
                x1={fmt(mark.x1)}
                y1={fmt(mark.y1)}
                x2={fmt(mark.x2)}
                y2={fmt(mark.y2)}
                stroke="#0b3d91"
                strokeWidth={fmt(mark.width, 2)}
                strokeLinecap="round"
              />
              <text
                x={fmt(label.x)}
                y={fmt(label.y)}
                fontFamily="Segoe UI, Arial, sans-serif"
                fontSize={12}
                fill="#0b3d91"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {house.roman}
              </text>
            </g>
          );
        })}

        {layout.signs?.map((sign: any) => {
          const name = String(sign.name ?? "");
          const href = String(sign.href ?? "");
          const x = fmt(sign.x);
          const y = fmt(sign.y);
          const size = fmt(sign.px, 38);
          const half = size / 2;

          if (!name || !href) return null;

          return (
            <image
              key={`sign-${name}`}
              href={href}
              x={x - half}
              y={y - half}
              width={size}
              height={size}
              preserveAspectRatio="xMidYMid meet"
            />
          );
        })}

        {layout.aspect_lines_svg?.length > 0 && (
          <g
            dangerouslySetInnerHTML={{
              __html: layout.aspect_lines_svg.join(""),
            }}
          />
        )}

        {layout.conjunction_links?.map((link: any, index: number) =>
          (link.radii ?? []).map((radius: unknown, radiusIndex: number) => (
            <polyline
              key={`conjunction-${index}-${radiusIndex}`}
              points={arcPoints(
                cx,
                cy,
                fmt(radius),
                fmt(link.start),
                fmt(link.extent),
                28
              )}
              stroke={String(link.color ?? "#0077CC")}
              strokeWidth={fmt(link.width, 2)}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))
        )}

        {layout.planets?.map((planet: any) =>
          (planet.connectors ?? []).map((connector: any, index: number) => (
            <g key={`connector-${planet.name}-${index}`} className="planet-connector" data-planet={planet.name}>
              <line
                x1={fmt(connector.x1)}
                y1={fmt(connector.y1)}
                x2={fmt(connector.x2)}
                y2={fmt(connector.y2)}
                stroke="#FFFFFF"
                strokeWidth={fmt(connector.width, 2) + 0.9}
                strokeLinecap="butt"
              />
              <line
                x1={fmt(connector.x1)}
                y1={fmt(connector.y1)}
                x2={fmt(connector.x2)}
                y2={fmt(connector.y2)}
                stroke={String(connector.color ?? "#4A4A4A")}
                strokeWidth={fmt(connector.width, 2)}
                strokeLinecap="butt"
              />
            </g>
          ))
        )}

        {layout.planets?.map((planet: any) => {
          const name = String(planet.name ?? "");
          const href = String(planet.href ?? "");
          const x = fmt(planet.x);
          const y = fmt(planet.y);
          const size = fmt(planet.px, 32);
          const half = size / 2;
          const degreeLabel = planet.degree_label;

          if (!name || !href) return null;

          const planetColor = String(planet.color ?? "").toLowerCase();

          const isTransitPlanet =
            planet.origin === "transit" ||
            planet.kind === "transit" ||
            planet.type === "transit" ||
            planet.is_transit === true ||
            planetColor === "#008c8c" ||
            planetColor === "#008080" ||
            planetColor === "teal";

          const tooltipName = isTransitPlanet
            ? `${name} — Transit`
            : name;

          return (
            <g
              key={`${isTransitPlanet ? "transit" : "natal"}-${name}`}
              className={`planet ${isTransitPlanet ? "transit_planet" : "natal_planet"}`}
              data-planet={name}
              data-planet-origin={isTransitPlanet ? "transit" : "natal"}
            >
              <title>{tooltipName}</title>
              <image
                href={href}
                x={x - half}
                y={y - half}
                width={size}
                height={size}
                preserveAspectRatio="xMidYMid meet"
                filter="url(#glyphWhiteOutline)"
              />

              {degreeLabel && (
                <>
                  <text
                    x={fmt(degreeLabel.x)}
                    y={fmt(degreeLabel.y)}
                    fontFamily="Segoe UI, Arial, sans-serif"
                    fontSize={11}
                    fill="#000000"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {String(degreeLabel.value ?? "")}
                  </text>

                  {degreeLabel.retro && (
                    <text
                      x={fmt(degreeLabel.retro_x)}
                      y={fmt(degreeLabel.retro_y)}
                      fontFamily="Segoe UI, Arial, sans-serif"
                      fontSize={9}
                      fill="#000000"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      R
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}