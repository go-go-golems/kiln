import { useEffect, useState } from 'react';
import './TexMath.css';

const cache = new Map<string, string>();
let engine: Promise<typeof import('@/lib/tex')> | null = null;
/** MathJax is loaded on first use, so boards without math do not pay for it. */
const loadEngine = () => (engine ??= import('@/lib/tex'));

/**
 * TeX rendered by MathJax as SVG. Until the engine has loaded, the TeX source is shown; the source is also
 * the accessible name, so a screen reader reads the formula rather than an image.
 */
export const TexMath: React.FC<{ tex: string; display?: boolean }> = ({ tex, display = false }) => {
  const key = `${display ? 'D' : 'I'}:${tex}`;
  const [svg, setSvg] = useState<string | null>(() => cache.get(key) ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const hit = cache.get(key);
    if (hit) {
      setSvg(hit);
      return;
    }
    setSvg(null);
    loadEngine()
      .then((m) => m.texToSvg(tex, display))
      .then((out) => {
        cache.set(key, out);
        if (alive) setSvg(out);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [key, tex, display]);
  const cls = `tex tex--${display ? 'display' : 'inline'}${failed ? ' is-failed' : ''}`;
  if (!svg) {
    return (
      <span className={cls} role="math" aria-label={tex}>
        <code className="tex__src">{display ? tex : `$${tex}$`}</code>
      </span>
    );
  }
  return <span className={cls} role="math" aria-label={tex} dangerouslySetInnerHTML={{ __html: svg }} />;
};
