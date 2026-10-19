import './DetectionOverlay.css';

export interface OverlayBox {
  ref: string;
  /** normalized x1, y1, x2, y2 */
  bbox: readonly number[];
  text?: string;
}

export interface OverlayLayer {
  key: string;
  label: string;
  /** CSS colour token, e.g. var(--d-candidate) */
  color: string;
  dashed?: boolean;
  /** a third pattern, for layers beyond ground truth, baseline and candidate */
  dotted?: boolean;
  /** stroke width in screen pixels */
  weight: number;
  boxes: OverlayBox[];
}

const rectOf = (bbox: readonly number[], width: number, height: number) => ({
  x: bbox[0] * width,
  y: bbox[1] * height,
  width: Math.max(0, (bbox[2] - bbox[0]) * width),
  height: Math.max(0, (bbox[3] - bbox[1]) * height),
});

/**
 * An image and its boxes in the image's own pixel coordinates (viewBox = width × height), so a normalized box
 * is placed by one multiplication and never rounded. Every stroke has a dark halo so it reads on any photo;
 * layers differ by colour, width and dash, never by colour alone.
 */
export const DetectionOverlay: React.FC<{
  width: number;
  height: number;
  src: string | null;
  alt: string;
  layers: OverlayLayer[];
  focus?: string | null;
  compact?: boolean;
  /** fit inside a frame of this aspect ratio (width / height), letterboxed, instead of taking the image's own */
  frame?: number;
}> = ({ width, height, src, alt, layers, focus, compact, frame }) => {
  const font = Math.max(width, height) / 42;
  const focused = layers.flatMap((l) => l.boxes.map((b) => ({ l, b }))).find((x) => x.b.ref === focus);
  const ratio = width / height;
  const inner = (
    <div
      className={`dov${compact ? ' dov--compact' : ''}`}
      style={frame ? { aspectRatio: `${width} / ${height}`, width: ratio >= frame ? '100%' : `${(ratio / frame) * 100}%` } : { aspectRatio: `${width} / ${height}` }}
    >
      {src ? <img className="dov__img" src={src} alt={alt} loading="lazy" decoding="async" /> : <div className="dov__missing">{compact ? 'not fetched' : 'image not fetched: pnpm lab datasets materialize <dataset>'}</div>}
      <svg className="dov__svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {/* all halos first, then the strokes in layer order: a thick baseline under a thin candidate stays visible
            as a band around it when the two boxes are identical */}
        <g className="dov__halos">
          {layers.map((l) =>
            l.boxes.map((b) => {
              const r = rectOf(b.bbox, width, height);
              return <rect key={`${l.key}:${b.ref}`} {...r} className="dov__halo" strokeWidth={l.weight + 2} vectorEffect="non-scaling-stroke" />;
            }),
          )}
        </g>
        {layers.map((l) => (
          <g key={l.key} className="dov__layer">
            {l.boxes.map((b) => {
              const dash = l.dashed ? (compact ? '3 2' : '6 4') : l.dotted ? (compact ? '1 2' : '2 3') : undefined;
              return <rect key={b.ref} {...rectOf(b.bbox, width, height)} fill="none" stroke={l.color} strokeWidth={l.weight} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />;
            })}
          </g>
        ))}
        {focused ? (
          <g className="dov__focus">
            <rect
              x={focused.b.bbox[0] * width}
              y={focused.b.bbox[1] * height}
              width={(focused.b.bbox[2] - focused.b.bbox[0]) * width}
              height={(focused.b.bbox[3] - focused.b.bbox[1]) * height}
              fill="none"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
            />
            {focused.b.text ? (
              <text x={focused.b.bbox[0] * width + font * 0.3} y={Math.max(font, focused.b.bbox[1] * height - font * 0.35)} fontSize={font}>
                {focused.l.label}: {focused.b.text}
              </text>
            ) : null}
          </g>
        ) : null}
      </svg>
    </div>
  );
  return frame ? (
    <div className="dov__frame" style={{ aspectRatio: String(frame) }}>
      {inner}
    </div>
  ) : (
    inner
  );
};

/** The legend that names each layer's encoding in words; the overlay is aria-hidden, this is not. */
export const OverlayLegend: React.FC<{ layers: OverlayLayer[]; hidden?: Set<string>; onToggle?: (key: string) => void }> = ({ layers, hidden, onToggle }) => (
  <ul className="dov__legend" aria-label="Layers">
    {layers.map((l) => (
      <li key={l.key}>
        <button type="button" className="dov__key" aria-pressed={!hidden?.has(l.key)} onClick={() => onToggle?.(l.key)} disabled={!onToggle}>
          <svg width="22" height="10" aria-hidden="true">
            {/* the same halo as on the image, so a white ground-truth key reads on a light sheet */}
            <line x1="1" y1="5" x2="21" y2="5" className="dov__halo" strokeWidth={l.weight + 2} />
            <line x1="1" y1="5" x2="21" y2="5" stroke={l.color} strokeWidth={l.weight} strokeDasharray={l.dashed ? '4 3' : l.dotted ? '2 2' : undefined} />
          </svg>
          <span>
            {l.label} · {l.boxes.length}
            {l.dashed ? ' · dashed' : l.dotted ? ' · dotted' : l.weight > 2 ? ' · thick' : ' · thin'}
          </span>
        </button>
      </li>
    ))}
  </ul>
);
