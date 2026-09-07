// Optional MathJax 3 SVG output. Plain labels never load a TeX renderer.
const SVG_NS = 'http://www.w3.org/2000/svg';
const MATHJAX_URL = 'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-chtml.js';

export interface StaticTextRun { text: string; math: boolean; display: boolean }

/** Leave ordinary text, unmatched dollars, and escaped delimiters outside TeX. */
export function splitStaticText(content: string): StaticTextRun[] {
  const runs: StaticTextRun[] = [];
  const pattern = /(\$\$|\$|\\\(|\\\[)/g;
  const escaped = (index: number) => {
    let count = 0;
    while (index > 0 && content[--index] === '\\') count++;
    return count % 2 === 1;
  };
  let end = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) {
    if (escaped(match.index)) continue;
    const open = match[0];
    const close = open === '\\(' ? '\\)' : open === '\\[' ? '\\]' : open;
    let next = content.indexOf(close, pattern.lastIndex);
    while (next >= 0 && escaped(next)) {
      next = content.indexOf(close, next + close.length);
    }
    if (next < 0) continue;
    const tex = content.slice(pattern.lastIndex, next);
    if (!tex || (open === '$' && /[\r\n]/.test(tex))) continue;
    if (match.index > end) runs.push({ text: content.slice(end, match.index), math: false, display: false });
    runs.push({ text: tex, math: true, display: open === '$$' || open === '\\[' });
    end = next + close.length;
    pattern.lastIndex = end;
  }
  if (end < content.length) runs.push({ text: content.slice(end), math: false, display: false });
  return runs;
}

interface TexRenderer { engine: any; document: any }
interface TexState {
  renderer?: Promise<TexRenderer>;
  queue: Promise<unknown>;
  cache: Map<string, SVGSVGElement>;
  serial: number;
  warned: boolean;
}

// Share loading, conversion queue, and bounded cache across bundle instances.
function stateFor(view: Window): TexState {
  const runtime = view as Window & { __liaStaticTex?: TexState };
  return runtime.__liaStaticTex || (runtime.__liaStaticTex = {
    queue: Promise.resolve(), cache: new Map(), serial: 0, warned: false
  });
}

function bounded<T>(view: Window, promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = view.setTimeout(() => reject(new Error('MathJax loading timed out')), 20000);
    promise.then(resolve, reject).finally(() => view.clearTimeout(timer));
  });
}

async function loadMathJax(view: Window): Promise<any> {
  const doc = view.document;
  let engine = (view as any).MathJax;
  // LiaScript can expose MathJax in the parent of a script frame.
  if (!engine) {
    try { engine = (view.parent as any).MathJax; } catch (_) { /* cross-origin parent */ }
  }
  if (!engine?.startup?.promise && !engine?.version) {
    const existing = Array.from(doc.scripts).find(script =>
      /(?:mathjax|tex-chtml|tex-svg)/i.test(script.src));
    if (existing) {
      let cleanup = () => {};
      try {
        await bounded(view, new Promise<void>((resolve, reject) => {
          const loaded = () => resolve();
          const failed = () => reject(new Error('MathJax script failed to load'));
          cleanup = () => {
            existing.removeEventListener('load', loaded);
            existing.removeEventListener('error', failed);
          };
          existing.addEventListener('load', loaded, { once: true });
          existing.addEventListener('error', failed, { once: true });
        }));
      } finally { cleanup(); }
    } else {
      // Keep CHTML as public output for other formulas, even in static-only
      // courses. Only a newly loaded engine disables automatic page scanning.
      const config = engine || {};
      (view as any).MathJax = {
        ...config, startup: { ...config.startup, typeset: false }
      };
      const script = doc.createElement('script');
      script.src = MATHJAX_URL;
      script.async = true;
      script.setAttribute('data-lia-static-mathjax', '');
      try {
        await bounded(view, new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('MathJax script failed to load'));
          (doc.head || doc.documentElement).appendChild(script);
        }));
      } catch (error) {
        script.remove();
        throw error;
      } finally { script.onload = script.onerror = null; }
    }
    engine = (view as any).MathJax;
  }
  if (!engine?.startup?.promise || !engine?.loader?.load) {
    throw new Error('Static TeX labels require MathJax 3 with its component loader');
  }
  await bounded(view, engine.startup.promise);
  return engine;
}

function rendererFor(view: Window, state: TexState): Promise<TexRenderer> {
  if (!state.renderer) {
    state.renderer = (async () => {
      const engine = await loadMathJax(view);
      await bounded(view, engine.loader.load('output/svg'));
      // The loaded options include the glyph tables and accent metrics.
      // Never change useOutput(), startup.document, or the global TeX state.
      const output = new engine.startup.constructors.svg({
        ...engine.config.svg, fontCache: 'none'
      });
      const mathDocument = engine.startup.handler.create(view.document, {
        InputJax: engine.startup.getInputJax(), OutputJax: output
      });
      return { engine, document: mathDocument };
    })().catch(error => {
      state.renderer = undefined;
      throw error;
    });
  }
  return state.renderer;
}

async function mathSvg(renderer: TexRenderer, state: TexState, run: StaticTextRun): Promise<SVGSVGElement> {
  const key = JSON.stringify([run.text, run.display]);
  let template = state.cache.get(key);
  if (!template) {
    const convert = () => renderer.document.convert(run.text, {
      format: 'TeX', display: run.display, em: 16, ex: 8, containerWidth: 1280
    });
    // Autoloaded TeX extensions request retries by throwing a promise.
    const result = await renderer.engine._.mathjax.mathjax.handleRetriesFor(convert);
    template = result.querySelector('svg');
    if (!template || template.querySelector('[data-mml-node="merror"]')) {
      throw new Error('MathJax could not convert the static TeX label');
    }
    if (state.cache.size >= 128) state.cache.delete(state.cache.keys().next().value);
    state.cache.set(key, template);
  }
  return template.cloneNode(true) as SVGSVGElement;
}

/** fontCache:none avoids glyph IDs; authored TeX can still supply other IDs. */
function uniqueIds(svg: SVGSVGElement, serial: number): void {
  const nodes = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const ids = new Map<string, string>();
  nodes.forEach(node => {
    if (node.id) {
      const renamed = 'lia-static-tex-' + serial + '-' + ids.size;
      ids.set(node.id, renamed);
      node.id = renamed;
    }
  });
  nodes.forEach(node => Array.from(node.attributes).forEach(attribute => {
    let value = attribute.value;
    ids.forEach((renamed, original) => {
      if (attribute.localName === 'href' && value === '#' + original) value = '#' + renamed;
      value = value.split('url(#' + original + ')').join('url(#' + renamed + ')');
      if (/^aria-(?:labelledby|describedby)$/.test(attribute.name)) {
        value = value.split(/\s+/).map(id => ids.get(id) || id).join(' ');
      }
    });
    if (value !== attribute.value) node.setAttributeNS(attribute.namespaceURI, attribute.name, value);
  }));
}

function placeLabel(text: SVGTextElement, content: string, runs: StaticTextRun[], math: SVGSVGElement[], state: TexState): void {
  if (!text.isConnected || !text.parentNode) return;
  const doc = text.ownerDocument;
  const group = doc.createElementNS(SVG_NS, 'g');
  // Read after async conversion: callers may override the default font size.
  const fontSize = Number(text.getAttribute('font-size'));
  const color = text.getAttribute('fill') || 'currentColor';
  group.setAttribute('data-lia-static-tex', 'ready');
  group.setAttribute('aria-label', content);
  group.setAttribute('role', 'img');
  group.setAttribute('font-size', String(fontSize));
  group.setAttribute('font-family', text.getAttribute('font-family') || 'system-ui, sans-serif');
  group.setAttribute('fill', color);
  group.style.color = color;
  group.setAttribute('opacity', text.getAttribute('fill-opacity') || '1');
  group.setAttribute('pointer-events', 'none');
  group.setAttribute('visibility', 'hidden');
  // Connected slides can still have display:none. Measure outside that hidden
  // subtree, at the board's design scale, so native text runs keep their widths.
  let measurement: SVGSVGElement | null = null;
  if (typeof text.getClientRects === 'function' && !text.getClientRects().length) {
    measurement = doc.createElementNS(SVG_NS, 'svg');
    const board = text.ownerSVGElement;
    const viewBox = board?.getAttribute('viewBox') || '0 0 1 1';
    const bounds = viewBox.split(/\s+/).map(Number);
    const width = Number(board?.getAttribute('width')) || 640;
    measurement.setAttribute('viewBox', viewBox);
    measurement.setAttribute('aria-hidden', 'true');
    measurement.style.cssText = 'position:absolute;left:-100000px;top:0;' +
      'display:block;visibility:hidden;overflow:hidden;pointer-events:none;' +
      'width:' + width + 'px;height:' + width * bounds[3] / bounds[2] + 'px;';
    (doc.body || doc.documentElement).appendChild(measurement);
    measurement.appendChild(group);
  } else {
    text.parentNode.insertBefore(group, text);
  }
  try {
    let cursor = 0;
    let index = 0;
    runs.forEach(run => {
      if (run.math) {
        const svg = math[index++];
        uniqueIds(svg, ++state.serial);
        const box = svg.viewBox.baseVal;
        const scale = fontSize / 1000;
        const width = box.width * scale;
        const height = box.height * scale;
        svg.setAttribute('x', String(cursor));
        svg.setAttribute('y', String(box.y * scale));
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));
        svg.removeAttribute('style');
        svg.style.overflow = 'visible';
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        group.appendChild(svg);
        cursor += width;
      } else {
        const plain = doc.createElementNS(SVG_NS, 'text');
        plain.setAttribute('x', String(cursor));
        plain.setAttribute('y', '0');
        plain.setAttribute('xml:space', 'preserve');
        plain.style.whiteSpace = 'pre';
        plain.textContent = run.text;
        group.appendChild(plain);
        cursor += plain.getComputedTextLength();
      }
    });
    const bounds = group.getBBox();
    const x = Number(text.getAttribute('x')) - bounds.x - bounds.width / 2;
    const y = Number(text.getAttribute('y')) - bounds.y - bounds.height / 2;
    group.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
    group.removeAttribute('visibility');
    if (measurement) text.parentNode.insertBefore(group, text);
    text.remove();
  } catch (error) {
    group.remove();
    throw error;
  } finally {
    measurement?.remove();
  }
}

/** Replace only the original, still-mounted node; never append to a newer render. */
export function typesetStaticText(text: SVGTextElement, content: string): void {
  const runs = splitStaticText(content);
  if (!runs.some(run => run.math)) return;
  const view = text.ownerDocument.defaultView;
  if (!view) return;
  const state = stateFor(view);
  text.setAttribute('data-lia-static-tex', 'pending');
  // Mounting is synchronous; waiting one microtask also skips discarded SVGs.
  Promise.resolve().then(async () => {
    if (!text.isConnected) return;
    const renderer = await rendererFor(view, state);
    const render = async () => {
      if (!text.isConnected) return;
      const math: SVGSVGElement[] = [];
      for (const run of runs) {
        if (!text.isConnected) return;
        if (run.math) math.push(await mathSvg(renderer, state, run));
      }
      placeLabel(text, content, runs, math, state);
    };
    const job = state.queue.then(render);
    state.queue = job.catch(() => {});
    await job;
  }).catch(error => {
    if (!text.isConnected) return;
    text.setAttribute('data-lia-static-tex', 'error');
    if (!state.warned) {
      state.warned = true;
      console.warn('[lia-coordinate] Static TeX could not be rendered; keeping text fallback.', error);
    }
  });
}
