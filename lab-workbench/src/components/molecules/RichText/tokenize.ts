export type RichToken =
  | { type: 'text'; text: string }
  | { type: 'math'; tex: string; display: boolean }
  | { type: 'bold'; text: string }
  | { type: 'code'; text: string };

/**
 * A small markdown subset with TeX: `$$…$$` display math, `$…$` inline math, `**bold**`, `` `code` ``.
 * `\$` is a literal dollar. Unclosed delimiters stay literal text.
 */
export function tokenizeRich(src: string): RichToken[] {
  const out: RichToken[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ type: 'text', text });
    text = '';
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\' && src[i + 1] === '$') {
      text += '$';
      i += 2;
      continue;
    }
    if (src.startsWith('$$', i)) {
      const end = src.indexOf('$$', i + 2);
      if (end > i + 2) {
        flush();
        out.push({ type: 'math', tex: src.slice(i + 2, end).trim(), display: true });
        i = end + 2;
        continue;
      }
    } else if (c === '$') {
      let end = i + 1;
      while (end < src.length && (src[end] !== '$' || src[end - 1] === '\\')) end++;
      if (end < src.length && end > i + 1 && src[i + 1] !== ' ') {
        flush();
        out.push({ type: 'math', tex: src.slice(i + 1, end), display: false });
        i = end + 1;
        continue;
      }
    } else if (src.startsWith('**', i)) {
      const end = src.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push({ type: 'bold', text: src.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    } else if (c === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: 'code', text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    text += c;
    i++;
  }
  flush();
  return out;
}
