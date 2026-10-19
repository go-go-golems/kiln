// JavaScript highlighting in Porous Forge's palette: keywords bold, strings grey, comments light italic,
// and the lambda arrow in red. Template literals may span lines.
const KW = new Set("const let var return async await if else for of in new function throw try catch finally while do break continue switch case default true false null undefined typeof instanceof class extends this".split(" "));
const BUILD = new Set("project dialect pipeline pass rule trace graph fork param decide strategy decompose".split(" "));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function highlightLines(code) {
  let inTpl = false, inBlock = false;
  return code.split("\n").map((line) => {
    let out = "", i = 0;
    const span = (cls, s) => (cls ? `<span class="${cls}">${esc(s)}</span>` : esc(s));
    while (i < line.length) {
      if (inBlock) {
        const e = line.indexOf("*/", i);
        if (e < 0) { out += span("tk-c", line.slice(i)); i = line.length; break; }
        out += span("tk-c", line.slice(i, e + 2)); i = e + 2; inBlock = false; continue;
      }
      if (inTpl) {
        const e = line.indexOf("`", i);
        if (e < 0) { out += span("tk-s", line.slice(i)); i = line.length; break; }
        out += span("tk-s", line.slice(i, e + 1)); i = e + 1; inTpl = false; continue;
      }
      const rest = line.slice(i);
      let m;
      if (rest.startsWith("//")) { out += span("tk-c", rest); break; }
      if (rest.startsWith("/*")) { inBlock = true; continue; }
      if (rest[0] === "`") {
        const e = rest.indexOf("`", 1);
        if (e < 0) { out += span("tk-s", rest); inTpl = true; break; }
        out += span("tk-s", rest.slice(0, e + 1)); i += e + 1; continue;
      }
      if ((m = rest.match(/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/))) { out += span("tk-s", m[0]); i += m[0].length; continue; }
      if (rest.startsWith("=>")) { out += span("tk-e", "=>"); i += 2; continue; }
      if ((m = rest.match(/^[A-Za-z_$][\w$]*/))) {
        const w = m[0];
        if (KW.has(w)) out += span("tk-k", w);
        else if (BUILD.has(w) && line[i + w.length] === "(" && line[i - 1] !== ".") out += span("tk-b", w);
        else out += esc(w);
        i += w.length; continue;
      }
      if ((m = rest.match(/^\d[\d_.e]*/i))) { out += span("tk-n", m[0]); i += m[0].length; continue; }
      if ((m = rest.match(/^\s+/))) { out += m[0]; i += m[0].length; continue; }
      out += span("tk-p", rest[0]); i++;
    }
    return out;
  });
}
export const highlight = (code) => highlightLines(code).join("\n");

// CUDA and WGSL: keywords and qualifiers bold, builtins (threadIdx, __syncthreads, workgroupBarrier) red
const CKW = new Set("extern __global__ __device__ __shared__ __restrict__ __launch_bounds__ const float int unsigned void return if else for while break continue fn let var struct array u32 i32 f32 vec3 ptr storage read read_write workgroup uniform select min max".split(" "));
const CBI = /^(threadIdx|blockIdx|blockDim|gridDim|__syncthreads|workgroupBarrier|local_invocation_id|workgroup_id|num_workgroups|@compute|@workgroup_size|@group|@binding|@builtin)/;
export function highlightC(code) {
  return code.split("\n").map((line) => {
    let out = "", i = 0;
    const span = (cls, s) => `<span class="${cls}">${esc(s)}</span>`;
    while (i < line.length) {
      const rest = line.slice(i);
      let m;
      if (rest.startsWith("//")) { out += span("tk-c", rest); break; }
      if ((m = rest.match(CBI))) { out += span("tk-e", m[0]); i += m[0].length; continue; }
      if ((m = rest.match(/^[A-Za-z_$][\w$]*/))) { out += CKW.has(m[0]) ? span("tk-k", m[0]) : esc(m[0]); i += m[0].length; continue; }
      if ((m = rest.match(/^\d[\d.]*(e[-+]?\d+)?f?/i))) { out += span("tk-n", m[0]); i += m[0].length; continue; }
      if ((m = rest.match(/^\s+/))) { out += m[0]; i += m[0].length; continue; }
      out += span("tk-p", rest[0]); i++;
    }
    return out;
  }).join("\n");
}
