import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js';
import '@mathjax/src/js/input/tex/noundefined/NoUndefinedConfiguration.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { MathJaxNewcmFont } from '@mathjax/mathjax-newcm-font/js/svg.js';
import { DYNAMIC_FONT_FILES } from './texFonts';

// Glyph ranges outside the base font are separate files; resolve MathJax's request to a bundled lazy import.
mathjax.asyncLoad = (name: string) => {
  const file = name.split('/').pop()!.replace(/\.js$/, '');
  const load = DYNAMIC_FONT_FILES[file];
  return load ? load() : Promise.reject(new Error(`no bundled MathJax font file for ${name}`));
};

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const doc = mathjax.document('', {
  InputJax: new TeX({ packages: ['base', 'ams', 'newcommand', 'noundefined'] }),
  OutputJax: new SVG({ fontCache: 'local', fontData: MathJaxNewcmFont }),
});

/** TeX → standalone SVG markup. `handleRetriesFor` covers glyph ranges MathJax loads on demand. */
export async function texToSvg(tex: string, display = false): Promise<string> {
  const node = await mathjax.handleRetriesFor(() => doc.convert(tex, { display }));
  return adaptor.outerHTML(node);
}
