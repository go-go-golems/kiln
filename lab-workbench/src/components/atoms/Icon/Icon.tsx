import './Icon.css';

const PATHS: Record<string, string> = {
  play: 'M5 3.5v9l7.5-4.5z',
  ide: 'M2.5 3.5h11v9h-11zM6 3.5v9',
  inspector: 'M2.5 3.5h11v9h-11zM10 3.5v9',
  sun: 'M8 5.2a2.8 2.8 0 1 1 0 5.6a2.8 2.8 0 0 1 0-5.6zM8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1',
  moon: 'M12.8 9.6A5.2 5.2 0 0 1 6.4 3.2a5.2 5.2 0 1 0 6.4 6.4z',
  plus: 'M8 3v10M3 8h10',
  minus: 'M3 8h10',
  reset: 'M3.5 8a4.5 4.5 0 1 0 1.3-3.2M3.5 2.8v2.4h2.4',
  close: 'M4 4l8 8M12 4l-8 8',
  check: 'M3 8.5l3 3 7-7',
  chevronDown: 'M4 6l4 4 4-4',
  chevronRight: 'M6 4l4 4-4 4',
  chevronLeft: 'M10 4l-4 4 4 4',
  warning: 'M8 2.5l6 11h-12zM8 6.5v3.5M8 11.6v.4',
  terminal: 'M2.5 3.5h11v9h-11zM5 6.5l2 1.8-2 1.8M8.5 10.5h2.5',
  search: 'M7 3a4 4 0 1 1 0 8a4 4 0 0 1 0-8zM10 10l3.5 3.5',
  copy: 'M5.5 5.5h7v7h-7zM3.5 10.5v-7h7',
  link: 'M6.5 9.5l3-3M5 8l-1.3 1.3a2.1 2.1 0 0 0 3 3L8 11M11 8l1.3-1.3a2.1 2.1 0 0 0-3-3L8 5',
  graph: 'M3.5 4.5h3v2h-3zM9.5 9.5h3v2h-3zM3.5 9.5h3v2h-3zM6.5 5.5h1.5v5h1.5M6.5 10.5h3',
  stop: 'M4 4h8v8h-8z',
  // archive: a box with a lid, for "clear": the transcript moves to the library
  archive: 'M2.5 3.5h11v3h-11zM3.5 6.5v6h9v-6M6.5 9h3',
  // library: three spines on a shelf
  library: 'M3 3.5v9M5.5 3.5v9M8 4l2.5 8.5M2 12.5h12',
  trash: 'M3 4.5h10M6.5 4.5v-1.5h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5M7 7v4M9 7v4',
  dockRight: 'M2.5 3.5h11v9h-11zM10 3.5v9M11.5 6h.5M11.5 8h.5',
  dockBottom: 'M2.5 3.5h11v9h-11zM2.5 9.5h11M6 11h4',
  back: 'M10 4l-4 4 4 4M6 8h7',
};

export interface IconProps {
  name: keyof typeof PATHS | string;
  size?: number;
  title?: string;
}

/** Stroke icons named for the action they perform. There is deliberately no sparkle. */
export const Icon: React.FC<IconProps> = ({ name, size = 14, title }) => (
  <svg className="icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
    {title ? <title>{title}</title> : null}
    <path d={PATHS[name] ?? PATHS.close} fill={name === 'play' || name === 'stop' ? 'currentColor' : 'none'} />
  </svg>
);
