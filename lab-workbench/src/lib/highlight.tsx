/**
 * Token highlighting for the three languages the workbench shows: lab.js / assistant code (JavaScript),
 * data as YAML, and data as JSON. Classes map to the --hl-* tokens: c comment, s string, n number,
 * k keyword/literal, f function name or mapping key, p punctuation.
 */

type Node = React.ReactNode;

function tokenize(src: string, re: RegExp, classify: (m: RegExpExecArray) => string | null): Node[] {
  const out: Node[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(src))) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    if (m.index > last) out.push(src.slice(last, m.index));
    const cls = classify(m);
    out.push(cls ? <span key={i++} className={cls}>{m[0]}</span> : m[0]);
    last = m.index + m[0].length;
  }
  out.push(src.slice(last));
  return out;
}

const JS = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*")|\b(\d+(?:\.\d+)?(?:e[-+]?\d+)?)\b|\b(return|const|let|var|if|else|for|while|of|in|await|async|new|true|false|null|undefined|function|try|catch|throw|typeof)\b|\b([A-Za-z_$][\w$]*)(?=\s*\()/g;

export const highlightJs = (src: string): Node[] =>
  tokenize(src, JS, (m) => (m[1] ? 'hl-c' : m[2] ? 'hl-s' : m[3] ? 'hl-n' : m[4] ? 'hl-k' : 'hl-f'));

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)|\b(true|false|null)\b|([{}[\],])/g;

export const highlightJson = (src: string): Node[] =>
  tokenize(src, JSON_TOKEN, (m) => (m[1] ? (m[2] ? 'hl-f' : 'hl-s') : m[3] ? 'hl-n' : m[4] ? 'hl-k' : 'hl-p'));

/** Scalar part of a YAML line: quoted strings, numbers, literals, comments; anything else is a plain string. */
function yamlValue(v: string, key: number): Node[] {
  if (!v) return [];
  const t = v.trim();
  const lead = v.slice(0, v.length - v.trimStart().length);
  let cls = 'hl-s';
  if (/^#/.test(t)) cls = 'hl-c';
  else if (/^(?:true|false|null|~|\.nan|-?\.inf)$/.test(t)) cls = 'hl-k';
  else if (/^-?\d+(?:\.\d+)?(?:e[-+]?\d+)?$/i.test(t)) cls = 'hl-n';
  else if (/^[|>][-+]?$/.test(t) || t === '[]' || t === '{}') cls = 'hl-p';
  return [lead, <span key={key} className={cls}>{t}</span>];
}

export function highlightYaml(src: string): Node[] {
  const out: Node[] = [];
  let k = 0;
  let blockIndent = -1; // inside a `|` block: lines indented deeper than its key are text
  for (const [n, line] of src.split('\n').entries()) {
    if (n) out.push('\n');
    const indent = line.length - line.trimStart().length;
    if (blockIndent >= 0 && (line.trim() === '' || indent > blockIndent)) {
      out.push(<span key={k++} className="hl-s">{line}</span>);
      continue;
    }
    blockIndent = -1;
    const m = /^(\s*)((?:- )*)((?:"(?:\\.|[^"\\])*"|[^\s"#][^:#]*?)(:)(?=\s|$))?(.*)$/.exec(line)!;
    const [, ws, dashes, keyPart, , rest] = m;
    out.push(ws);
    if (dashes) out.push(<span key={k++} className="hl-p">{dashes}</span>);
    if (keyPart) {
      out.push(<span key={k++} className="hl-f">{keyPart.slice(0, -1)}</span>, <span key={k++} className="hl-p">:</span>);
      if (/^\s*[|>][-+]?\s*$/.test(rest)) blockIndent = indent + dashes.length;
    } else if (dashes && /^\s*[|>][-+]?\s*$/.test(rest)) blockIndent = indent;
    out.push(...yamlValue(rest, k++));
  }
  return out;
}
