// Canonical JSON: the one serialisation every hash in the system is computed over. Object keys are sorted
// (by UTF-16 code unit, Array.prototype.sort's default), numbers and strings are written by JSON.stringify,
// and anything JSON would silently drop or rewrite is refused instead, with the path where it was found:
// undefined (as a property or an array element), functions, symbols, bigints, NaN and ±Infinity, cycles,
// and objects that are not plain (Map, Set, Date, RegExp, class instances), whose JSON form loses data.
// -0 is written as 0, as JSON.stringify does: no identity in this system distinguishes the two.

export class CanonicalJSONError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalJSONError';
  }
}

const isPlain = (x: object): boolean => {
  const proto = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
};

const refuse = (what: string, path: string): never => {
  throw new CanonicalJSONError(`canonicalJSON: ${what} at ${path}`);
};

export function canonicalJSON(value: unknown): string {
  const ancestors: object[] = [];
  const walk = (v: unknown, path: string): string => {
    switch (typeof v) {
      case 'string':
        return JSON.stringify(v);
      case 'boolean':
        return v ? 'true' : 'false';
      case 'number':
        return Number.isFinite(v) ? JSON.stringify(v) : refuse(`non-finite number ${String(v)}`, path);
      case 'undefined':
        return refuse('undefined', path);
      case 'function':
        return refuse('a function', path);
      case 'symbol':
        return refuse('a symbol', path);
      case 'bigint':
        return refuse('a bigint', path);
    }
    if (v === null) return 'null';
    const obj = v as object;
    if (ancestors.includes(obj)) return refuse('a cycle', path);
    ancestors.push(obj);
    let out: string;
    if (Array.isArray(obj)) {
      const parts: string[] = [];
      for (let i = 0; i < obj.length; i++) {
        if (!(i in obj)) refuse('an array hole', `${path}[${i}]`);
        parts.push(walk(obj[i], `${path}[${i}]`));
      }
      out = `[${parts.join(',')}]`;
    } else {
      if (!isPlain(obj)) refuse(`a non-plain object (${Object.prototype.toString.call(obj)})`, path);
      const rec = obj as Record<string, unknown>;
      const keys = Object.keys(rec).sort();
      out = `{${keys.map((k) => `${JSON.stringify(k)}:${walk(rec[k], `${path}.${k}`)}`).join(',')}}`;
    }
    ancestors.pop();
    return out;
  };
  return walk(value, '$');
}
