// Plot input subsystem (@PlotInput macro).
// Allows students to type a LaTeX formula and see it plotted live on a JSXGraph board.

export function init(): void {
  if (window.__plotInputReady) {
    try {
      if (window.__scheduleBootstrapPlotInputs) window.__scheduleBootstrapPlotInputs();
      else if (window.__bootstrapPlotInputs) window.__bootstrapPlotInputs();
    } catch (e) {}
    return;
  }
  window.__plotInputReady = true;

  const H: Record<string, any> = {};
  window.__plotInput = H;
  window.__plotInputStates = window.__plotInputStates || {};
  window.__plotInputInstances = window.__plotInputInstances || {};

  H.functionNames = new Set([
    'sin','cos','tan',
    'asin','acos','atan',
    'arcsin','arccos','arctan',
    'sqrt','exp','ln','log','abs'
  ]);

  H.splitTopLevel = function(str) {
    const out = [];
    let cur = '';
    let quote = '';
    let esc = false;
    let round = 0;
    let square = 0;
    let curly = 0;

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];

      if (esc) {
        cur += ch;
        esc = false;
        continue;
      }

      if (quote) {
        cur += ch;
        if (ch === '\\') esc = true;
        else if (ch === quote) quote = '';
        continue;
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        cur += ch;
        continue;
      }

      if (ch === '(') round++;
      else if (ch === ')') round = Math.max(0, round - 1);
      else if (ch === '[') square++;
      else if (ch === ']') square = Math.max(0, square - 1);
      else if (ch === '{') curly++;
      else if (ch === '}') curly = Math.max(0, curly - 1);

      if (ch === ';' && round === 0 && square === 0 && curly === 0) {
        out.push(cur.trim());
        cur = '';
        continue;
      }

      cur += ch;
    }

    out.push(cur.trim());
    return out;
  };

  H.numOr = function(parts, idx, fallback){
    const v = parseFloat(parts[idx]);
    return Number.isFinite(v) ? v : fallback;
  };

  H.parseInputSpec = function(spec){
    const parts = H.splitTopLevel(String(spec || '').trim());

    return {
      boardId: parts[0] || 'A1',
      name: parts[1] || 'f',
      color: parts[2] || '#b41f65',
      placeholder: parts[3] || 'e.g. \\frac{1}{2}x^2 - 1',
      dx: H.numOr(parts, 4, 0.18),
      dy: H.numOr(parts, 5, 0.18),
      strokeWidth: H.numOr(parts, 6, 3),
      labelFontSize: H.numOr(parts, 7, 28)
    };
  };

  H.skipSpaces = function(str, i){
    while (i < str.length && /\s/.test(str[i])) i++;
    return i;
  };

  H.readBalanced = function(str, start, openCh, closeCh){
    if (str[start] !== openCh) {
      throw new Error('Expected ' + openCh);
    }

    let depth = 0;

    for (let i = start; i < str.length; i++) {
      const ch = str[i];

      if (ch === openCh) depth++;
      else if (ch === closeCh) {
        depth--;
        if (depth === 0) {
          return {
            content: str.slice(start + 1, i),
            end: i + 1
          };
        }
      }
    }

    throw new Error('Unclosed bracket: ' + openCh + ' ... ' + closeCh);
  };

  H.readToken = function(str, start){
    let i = H.skipSpaces(str, start);
    if (i >= str.length) return null;

    const ch = str[i];

    if (ch === '{') {
      const g = H.readBalanced(str, i, '{', '}');
      return { text: g.content, end: g.end };
    }

    if (ch === '(') {
      const g = H.readBalanced(str, i, '(', ')');
      return { text: '(' + g.content + ')', end: g.end };
    }

    if (ch === '[') {
      const g = H.readBalanced(str, i, '[', ']');
      return { text: '[' + g.content + ']', end: g.end };
    }

    if (ch === '\\') {
      let j = i + 1;
      while (j < str.length && /[A-Za-z]/.test(str[j])) j++;
      const cmd = str.slice(i + 1, j);

      if (!cmd && j < str.length) {
        return { text: str.slice(i, j + 1), end: j + 1 };
      }

      if (cmd === 'left' || cmd === 'right') {
        return H.readToken(str, j);
      }

      if (cmd === 'frac') {
        const num = H.readToken(str, j);
        if (!num) throw new Error('Numerator after \\frac missing.');
        const den = H.readToken(str, num.end);
        if (!den) throw new Error('Denominator after \\frac missing.');

        return {
          text: '((' + H.transformLatex(num.text) + ')/(' + H.transformLatex(den.text) + '))',
          end: den.end
        };
      }

      if (cmd === 'sqrt') {
        let k = H.skipSpaces(str, j);
        let degree = null;

        if (str[k] === '[') {
          const dg = H.readBalanced(str, k, '[', ']');
          degree = H.transformLatex(dg.content);
          k = dg.end;
        }

        const arg = H.readToken(str, k);
        if (!arg) throw new Error('Argument after \\sqrt missing.');

        return {
          text: degree
            ? '((' + H.transformLatex(arg.text) + ')^(1/(' + degree + ')))'
            : 'sqrt(' + H.transformLatex(arg.text) + ')',
          end: arg.end
        };
      }

      return { text: str.slice(i, j), end: j };
    }

    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < str.length && /[0-9.]/.test(str[j])) j++;
      return { text: str.slice(i, j), end: j };
    }

    if (/[A-Za-z]/.test(ch)) {
      let j = i + 1;
      while (j < str.length && /[A-Za-z0-9]/.test(str[j])) j++;
      return { text: str.slice(i, j), end: j };
    }

    return { text: ch, end: i + 1 };
  };

  H.transformLatex = function(input){
    const str = String(input || '');
    let out = '';
    let i = 0;

    while (i < str.length) {
      const ch = str[i];

      if (ch === '\\') {
        let j = i + 1;
        while (j < str.length && /[A-Za-z]/.test(str[j])) j++;
        const cmd = str.slice(i + 1, j);

        if (!cmd) {
          const sym = str[j] || '';
          if (sym === ',' || sym === ';' || sym === ':' || sym === '!' || sym === ' ') {
            i = j + 1;
            continue;
          }
          out += sym;
          i = j + 1;
          continue;
        }

        if (cmd === 'left' || cmd === 'right') {
          i = j;
          continue;
        }

        if (cmd === 'cdot' || cmd === 'times') {
          out += '*';
          i = j;
          continue;
        }

        if (cmd === 'div') {
          out += '/';
          i = j;
          continue;
        }

        if (cmd === 'pi') {
          out += 'pi';
          i = j;
          continue;
        }

        if (cmd === 'frac') {
          const num = H.readToken(str, j);
          if (!num) throw new Error('Numerator after \\frac missing.');
          const den = H.readToken(str, num.end);
          if (!den) throw new Error('Denominator after \\frac missing.');

          out += '((' + H.transformLatex(num.text) + ')/(' + H.transformLatex(den.text) + '))';
          i = den.end;
          continue;
        }

        if (cmd === 'sqrt') {
          let k = H.skipSpaces(str, j);
          let degree = null;

          if (str[k] === '[') {
            const dg = H.readBalanced(str, k, '[', ']');
            degree = H.transformLatex(dg.content);
            k = dg.end;
          }

          const arg = H.readToken(str, k);
          if (!arg) throw new Error('Argument after \\sqrt missing.');

          out += degree
            ? '((' + H.transformLatex(arg.text) + ')^((1)/(' + degree + ')))'
            : 'sqrt(' + H.transformLatex(arg.text) + ')';

          i = arg.end;
          continue;
        }

        if (cmd === 'mathrm' || cmd === 'operatorname' || cmd === 'text') {
          const arg = H.readToken(str, j);
          if (!arg) {
            i = j;
            continue;
          }
          out += H.transformLatex(arg.text);
          i = arg.end;
          continue;
        }

        const fnMap = {
          sin: 'sin',
          cos: 'cos',
          tan: 'tan',
          asin: 'asin',
          acos: 'acos',
          atan: 'atan',
          arcsin: 'arcsin',
          arccos: 'arccos',
          arctan: 'arctan',
          ln: 'ln',
          log: 'log',
          exp: 'exp',
          abs: 'abs'
        };

        if (fnMap[cmd]) {
          const arg = H.readToken(str, j);
          if (arg) {
            out += fnMap[cmd] + '(' + H.transformLatex(arg.text) + ')';
            i = arg.end;
          } else {
            out += fnMap[cmd];
            i = j;
          }
          continue;
        }

        out += cmd;
        i = j;
        continue;
      }

      if (ch === '{') {
        const g = H.readBalanced(str, i, '{', '}');
        out += '(' + H.transformLatex(g.content) + ')';
        i = g.end;
        continue;
      }

      if (ch === '^') {
        const arg = H.readToken(str, i + 1);
        if (!arg) throw new Error('Exponent after ^ missing.');
        out += '^(' + H.transformLatex(arg.text) + ')';
        i = arg.end;
        continue;
      }

      if (ch === '_') {
        const arg = H.readToken(str, i + 1);
        i = arg ? arg.end : i + 1;
        continue;
      }

      out += ch;
      i++;
    }

    return out;
  };

  H.stripOuterMath = function(s){
    let out = String(s || '').trim();
    out = out.replace(/^\${1,2}\s*/, '').replace(/\s*\${1,2}$/, '');
    return out.trim();
  };

  H.prepareRawInput = function(s){
    let out = H.stripOuterMath(s);

    out = out
      .replace(/−/g, '-')
      .replace(/–/g, '-')
      .replace(/·/g, '*');

    out = out.replace(/^\s*[A-Za-z]+\s*\(\s*x\s*\)\s*=\s*/, '');
    out = out.replace(/^\s*y\s*=\s*/, '');

    for (let k = 0; k < 8; k++) {
      const next = out.replace(/(\d)\s*,\s*(\d)/g, '$1.$2');
      if (next === out) break;
      out = next;
    }

    return out.trim();
  };

  H.tokenize = function(expr){
    const tokens = [];
    let i = 0;

    while (i < expr.length) {
      const ch = expr[i];

      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      if (/[0-9.]/.test(ch)) {
        let j = i + 1;
        while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
        tokens.push({ type: 'number', value: expr.slice(i, j) });
        i = j;
        continue;
      }

      if (/[A-Za-z]/.test(ch)) {
        let j = i + 1;
        while (j < expr.length && /[A-Za-z0-9]/.test(expr[j])) j++;
        tokens.push({ type: 'ident', value: expr.slice(i, j) });
        i = j;
        continue;
      }

      if (ch === '*' && expr[i + 1] === '*') {
        tokens.push({ type: 'op', value: '**' });
        i += 2;
        continue;
      }

      if ('+-*/^,'.includes(ch)) {
        tokens.push({ type: 'op', value: ch });
        i++;
        continue;
      }

      if (ch === '(') {
        tokens.push({ type: 'open', value: ch });
        i++;
        continue;
      }

      if (ch === ')') {
        tokens.push({ type: 'close', value: ch });
        i++;
        continue;
      }

      throw new Error('Unknown character in expression: ' + ch);
    }

    return tokens;
  };

  H.insertImplicitMultiplication = function(tokens){
    const out = [];

    function isValueEnd(t){
      return t && (t.type === 'number' || t.type === 'ident' || t.type === 'close');
    }

    function isValueStart(t){
      return t && (t.type === 'number' || t.type === 'ident' || t.type === 'open');
    }

    for (let i = 0; i < tokens.length; i++) {
      const cur = tokens[i];
      const prev = out[out.length - 1];

      if (prev && isValueEnd(prev) && isValueStart(cur)) {
        const prevIsFn = prev.type === 'ident' && H.functionNames.has(prev.value);
        const callLike = prevIsFn && cur.type === 'open';

        if (!callLike) {
          out.push({ type: 'op', value: '*' });
        }
      }

      out.push(cur);
    }

    return out;
  };

  H.normalizeExpr = function(expr){
    const rawTokens = H.tokenize(expr);
    const tokens = H.insertImplicitMultiplication(rawTokens);

    return tokens.map(function(t){
      if (t.type === 'number') return t.value;
      if (t.type === 'open' || t.type === 'close') return t.value;
      if (t.type === 'op') return t.value === '^' ? '**' : t.value;

      if (t.type === 'ident') {
        const v = t.value;

        if (v === 'x') return 'x';
        if (v === 'pi') return 'pi';
        if (v === 'e') return 'e';
        if (H.functionNames.has(v)) return v;

        throw new Error('Unknown variable or function: ' + v);
      }

      throw new Error('Internal token error.');
    }).join('');
  };

  H.compileExpr = function(expr){
    const s = H.normalizeExpr(expr);

    try {
      return new Function(
        'x',
        `
        const pi = Math.PI;
        const e = Math.E;

        const sin = Math.sin;
        const cos = Math.cos;
        const tan = Math.tan;
        const asin = Math.asin;
        const acos = Math.acos;
        const atan = Math.atan;
        const arcsin = Math.asin;
        const arccos = Math.acos;
        const arctan = Math.atan;

        const exp = Math.exp;
        const log = (Math.log10 ? Math.log10 : function(v){ return Math.log(v)/Math.LN10; });
        const ln = Math.log;
        const sqrt = Math.sqrt;
        const abs = Math.abs;
        const floor = Math.floor;
        const ceil = Math.ceil;
        const round = Math.round;
        const min = Math.min;
        const max = Math.max;
        const pow = Math.pow;

        return (${s});
        `
      );
    } catch (e) {
      return null;
    }
  };

  H.compileLatex = function(raw){
    const prepared = H.prepareRawInput(raw);
    const ascii = H.transformLatex(prepared);
    const fn = H.compileExpr(ascii);

    return {
      prepared: prepared,
      ascii: ascii,
      fn: fn
    };
  };

  H.safeBBox = function(board){
    try {
      const bb = board.getBoundingBox();
      if (
        Array.isArray(bb) &&
        bb.length === 4 &&
        bb.every(v => Number.isFinite(v))
      ) {
        return bb.slice();
      }
    } catch (e) {}
    return [-5, 5, 5, -5];
  };

  H.texName = function(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    if (raw.includes('\\(') || raw.includes('\\[') || raw.includes('$')) return raw;
    return '\\(' + raw + '\\)';
  };

  H.chooseVisibleAnchorX = function(board, fn){
    const bb = H.safeBBox(board);
    const xmin = bb[0];
    const ymax = bb[1];
    const xmax = bb[2];
    const ymin = bb[3];

    const xspan = xmax - xmin;
    const yspan = ymax - ymin;

    const xStart = xmax - 0.10 * xspan;
    const xEnd   = xmin + 0.18 * xspan;

    const yPadTop = 0.14 * yspan;
    const yPadBottom = 0.12 * yspan;

    const steps = 120;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = xStart - t * (xStart - xEnd);

      let y;
      try {
        y = fn(x);
      } catch (e) {
        y = NaN;
      }

      if (!Number.isFinite(y)) continue;
      if (y <= ymax - yPadTop && y >= ymin + yPadBottom) return x;
    }

    return xmin + 0.60 * xspan;
  };

  H.removePlotObjects = function(board, state){
    ['text','anchor','graph'].forEach(function(key){
      if (state[key]) {
        try { board.removeObject(state[key]); } catch (e) {}
        state[key] = null;
      }
    });
  };

  H.createFunctionLabel = function(board, fn, state) {
    const labelText = H.texName(state.name);

    const anchor = board.create('point', [
      function() {
        return H.chooseVisibleAnchorX(board, fn);
      },
      function() {
        const x = H.chooseVisibleAnchorX(board, fn);
        let y;

        try {
          y = fn(x);
        } catch (e) {
          y = NaN;
        }

        if (!Number.isFinite(y)) {
          const bb = H.safeBBox(board);
          return (bb[1] + bb[3]) / 2;
        }

        return y;
      }
    ], {
      visible: false,
      fixed: true,
      withLabel: false,
      name: ''
    });

    const label = board.create('text', [
      function() {
        return anchor.X() + state.dx;
      },
      function() {
        return anchor.Y() + state.dy;
      },
      function() {
        return labelText;
      }
    ], {
      fixed: true,
      highlight: false,
      parse: false,
      useMathJax: true,
      display: 'html',
      strokeColor: state.color,
      fillColor: state.color,
      fontSize: state.labelFontSize,
      anchorX: 'left',
      anchorY: 'top'
    });

    return { anchor, label };
  };

  H.plotIntoBoard = function(board, state, raw){
    H.removePlotObjects(board, state);

    const compiled = H.compileLatex(raw);
    const fn = compiled.fn;
    if (!fn) throw new Error('The expression could not be compiled.');

    state.graph = board.create('functiongraph', [fn], {
      name: '',
      strokeColor: state.color,
      highlightStrokeColor: state.color,
      strokeWidth: state.strokeWidth,
      fixed: true,
      withLabel: false
    });

    const labelPack = H.createFunctionLabel(board, fn, state);
    state.anchor = labelPack.anchor;
    state.text = labelPack.label;

    board.update();

    return compiled;
  };

  function themeDoc() {
    return (window.parent && window.parent.document) ? window.parent.document : document;
  }

  function themeWin() {
    return (window.parent && window.parent.getComputedStyle) ? window.parent : window;
  }

  function currentNeutralColor() {
    try {
      const doc = themeDoc();
      const win = themeWin();
      const el  = doc.body || doc.documentElement;
      const bg  = win.getComputedStyle(el).backgroundColor;
      const m   = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!m) return '#000';

      const r = parseInt(m[1], 10);
      const g = parseInt(m[2], 10);
      const b = parseInt(m[3], 10);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      return lum < 128 ? '#fff' : '#000';
    } catch (e) {
      return '#000';
    }
  }

  function themeSignature() {
    try {
      const doc = themeDoc();
      const win = themeWin();
      const root = doc.documentElement || doc.body;
      const body = doc.body || doc.documentElement;
      const rootCls = root ? root.className : '';
      const bodyCls = body ? body.className : '';
      const bg = win.getComputedStyle(body).backgroundColor;
      const fg = win.getComputedStyle(body).color;
      return [String(rootCls), String(bodyCls), String(bg), String(fg)].join('|');
    } catch (e) {
      return String(Date.now());
    }
  }

  window.__plotInputNeutralColor = currentNeutralColor;

  if (!window.__plotInputThemeSync) {
    const listeners = new Set<() => void>();
    let lastSig = themeSignature();

    function notify() {
      listeners.forEach(function(fn) {
        try { fn(); } catch (e) {}
      });
    }

    function check() {
      const sig = themeSignature();
      if (sig !== lastSig) {
        lastSig = sig;
        window.__plotInputNeutralColor = currentNeutralColor;
        notify();
      }
    }

    window.__plotInputThemeSync = {
      listeners,
      check
    };

    try {
      const doc = themeDoc();
      const obs = new MutationObserver(check);

      if (doc.documentElement) {
        obs.observe(doc.documentElement, {
          attributes: true,
          attributeFilter: ['class', 'style', 'data-theme']
        });
      }

      if (doc.body) {
        obs.observe(doc.body, {
          attributes: true,
          attributeFilter: ['class', 'style', 'data-theme']
        });
      }
    } catch (e) {}

    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq && typeof mq.addEventListener === 'function') mq.addEventListener('change', check);
      else if (mq && typeof mq.addListener === 'function') mq.addListener(check);
    } catch (e) {}
  }

  window.__registerPlotInputThemeListener = function(fn) {
    if (!window.__plotInputThemeSync || !fn) return;
    window.__plotInputThemeSync.listeners.add(fn);
    try { fn(); } catch (e) {}
  };

  window.renderPlotInputFromSpec = function(uid, spec) {
    const root = document.getElementById('lia-plot-input-' + uid);
    if (!root) return false;

    if ((root.dataset.spec || '') !== String(spec || '')) {
      root.dataset.spec = spec;
    }

    const cfg = H.parseInputSpec(spec);
    const state = window.__plotInputStates[uid] || (window.__plotInputStates[uid] = {});
    const inst = window.__plotInputInstances[uid] || (window.__plotInputInstances[uid] = {});

    state.uid = uid;
    state.boardId = cfg.boardId;
    state.name = cfg.name;
    state.color = cfg.color;
    state.placeholder = cfg.placeholder;
    state.dx = cfg.dx;
    state.dy = cfg.dy;
    state.strokeWidth = cfg.strokeWidth;
    state.labelFontSize = cfg.labelFontSize;

    function hasFullInstance(instance) {
      return !!(
        instance &&
        instance.built &&
        instance.ui &&
        instance.field &&
        instance.input &&
        instance.actions &&
        instance.btnPlot &&
        instance.btnClear &&
        instance.msg
      );
    }

    function mountInstance() {
      if (!hasFullInstance(inst)) return false;

      const uiMounted = inst.ui.parentNode === root;
      const msgMounted = inst.msg.parentNode === root;

      if (uiMounted && msgMounted) return true;

      while (root.firstChild) {
        root.removeChild(root.firstChild);
      }

      root.appendChild(inst.ui);
      root.appendChild(inst.msg);
      return true;
    }

    if (!hasFullInstance(inst)) {
      const ui = document.createElement('div');
      const field = document.createElement('div');
      const input = document.createElement('input');
      const actions = document.createElement('div');
      const btnPlot = document.createElement('button');
      const btnClear = document.createElement('button');
      const msg = document.createElement('div');

      input.type = 'text';
      input.inputMode = 'text';
      input.autocomplete = 'off';
      input.autocapitalize = 'off';
      input.spellcheck = false;

      btnPlot.className = 'lia-btn';
      btnPlot.type = 'button';
      btnPlot.textContent = 'Plot';

      btnClear.className = 'lia-btn';
      btnClear.type = 'button';
      btnClear.textContent = 'Clear';

      ui.appendChild(field);
      field.appendChild(input);
      ui.appendChild(actions);
      actions.appendChild(btnPlot);
      actions.appendChild(btnClear);
      root.appendChild(ui);
      root.appendChild(msg);

      inst.ui = ui;
      inst.field = field;
      inst.input = input;
      inst.actions = actions;
      inst.btnPlot = btnPlot;
      inst.btnClear = btnClear;
      inst.msg = msg;
      inst.built = true;

      function getBoard(){
        return (window.__boards && window.__boards[state.boardId]) || null;
      }

      function setMsg(text, isError){
        msg.textContent = text || '';
        msg.style.marginTop = '.45rem';
        msg.style.minHeight = '1.2em';
        msg.style.fontSize = '.95rem';
        msg.style.lineHeight = '1.25';
        msg.style.fontWeight = text ? '600' : '400';
        msg.style.color = text ? (isError ? '#b00020' : '#1d6f42') : '';
      }

      function doPlot(){
        const raw = String(input.value || '').trim();
        state.raw = raw;

        if (!raw) {
          setMsg('Please enter a function expression.', true);
          return;
        }

        const board = getBoard();
        if (!board) {
          setMsg('Board "' + state.boardId + '" not found.', true);
          return;
        }

        try {
          H.plotIntoBoard(board, state, raw);
          setMsg('Graph plotted.', false);
        } catch (err) {
          setMsg((err && err.message) ? err.message : 'The expression could not be plotted.', true);
        }
      }

      function doClear(){
        state.raw = '';
        input.value = '';

        const board = getBoard();
        if (board) {
          H.removePlotObjects(board, state);
          board.update();
        }

        setMsg('', false);
      }

      btnPlot.addEventListener('click', doPlot);
      btnClear.addEventListener('click', doClear);

      input.addEventListener('keydown', function(ev){
        if (ev.key === 'Enter') {
          ev.preventDefault();
          doPlot();
        }
      });

      input.addEventListener('input', function() {
        state.raw = input.value;
      });

      inst.setMsg = setMsg;
    } else {
      mountInstance();
    }

    inst.input.placeholder = state.placeholder;
    inst.input.value = (typeof state.raw === 'string') ? state.raw : '';

    function ensureBtnInner(btn) {
      let inner = btn.querySelector('.lia-btn-inner');
      if (inner) return inner;

      inner = document.createElement('span');
      inner.className = 'lia-btn-inner';

      while (btn.firstChild) {
        inner.appendChild(btn.firstChild);
      }
      btn.appendChild(inner);

      return inner;
    }

    function px(v){
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    }

    function applyInputTheme() {
      const neutral = currentNeutralColor();
      const doc = themeDoc();
      const win = themeWin();
      const el = (doc && (doc.body || doc.documentElement)) || document.body || document.documentElement;
      const cs = win.getComputedStyle(el);

      root.style.width = '100%';
      root.style.margin = '.5rem 0 1rem 0';
      root.style.position = 'relative';

      inst.ui.style.display = 'flex';
      inst.ui.style.flexWrap = 'wrap';
      inst.ui.style.alignItems = 'flex-start';
      inst.ui.style.width = '100%';

      inst.field.style.flex = '1 1 22rem';
      inst.field.style.minWidth = '16rem';
      inst.field.style.display = 'flex';
      inst.field.style.alignItems = 'flex-start';

      inst.input.style.boxSizing = 'border-box';
      inst.input.style.width = '100%';
      inst.input.style.minWidth = '0';
      inst.input.style.margin = '0';

      inst.input.style.font = 'inherit';
      inst.input.style.fontSize = cs.fontSize;
      inst.input.style.fontFamily = cs.fontFamily;
      inst.input.style.fontWeight = cs.fontWeight;
      inst.input.style.lineHeight = '1.2';

      inst.input.style.color = cs.color || neutral;
      inst.input.style.background = 'transparent';
      inst.input.style.border = '1px solid ' + neutral;
      inst.input.style.borderRadius = '.4rem';
      inst.input.style.padding = '.55rem .75rem';
      inst.input.style.outline = 'none';
    }

    function applyButtonTheme(btn) {
      const c = currentNeutralColor();
      const cs = window.getComputedStyle(btn);
      const h = btn.offsetHeight;
      const inner = ensureBtnInner(btn);

      btn.style.color = c;
      btn.style.display = 'inline-flex';
      btn.style.alignItems = 'stretch';
      btn.style.justifyContent = 'center';
      btn.style.verticalAlign = 'top';
      btn.style.boxSizing = 'border-box';
      btn.style.textAlign = 'center';
      btn.style.minWidth = '8rem';

      if (h > 0) {
        btn.style.height = h + 'px';
        btn.style.minHeight = h + 'px';
      }

      btn.style.marginTop = '0';
      btn.style.marginBottom = '0';
      btn.style.marginLeft = '0';
      btn.style.marginRight = '0';

      btn.style.paddingTop = '0';
      btn.style.paddingBottom = '0';
      btn.style.paddingLeft = '0';
      btn.style.paddingRight = '0';

      btn.style.fontSize = cs.fontSize;
      btn.style.fontFamily = cs.fontFamily;
      btn.style.fontWeight = cs.fontWeight;
      btn.style.lineHeight = 'normal';

      inner.style.display = 'inline-flex';
      inner.style.alignItems = 'center';
      inner.style.justifyContent = 'center';
      inner.style.boxSizing = 'border-box';
      inner.style.height = '100%';
      inner.style.minWidth = '100%';
      inner.style.paddingTop = '0';
      inner.style.paddingBottom = '0';
      inner.style.paddingLeft = Math.max(px(cs.paddingLeft), 18) + 'px';
      inner.style.paddingRight = Math.max(px(cs.paddingRight), 18) + 'px';
      inner.style.lineHeight = '1';
      inner.style.transform = 'translateY(0px)';
      inner.style.whiteSpace = 'nowrap';
    }

    function applyTheme() {
      applyInputTheme();
      applyButtonTheme(inst.btnPlot);
      applyButtonTheme(inst.btnClear);

      inst.actions.style.display = 'inline-flex';
      inst.actions.style.flexDirection = 'row';
      inst.actions.style.flexWrap = 'nowrap';
      inst.actions.style.alignItems = 'flex-start';
      inst.actions.style.justifyContent = 'flex-start';
      inst.actions.style.whiteSpace = 'nowrap';
      inst.actions.style.marginTop = '0rem';
      inst.actions.style.marginLeft = '1.2rem';

      inst.btnPlot.style.marginRight = '1.2rem';
      inst.btnClear.style.marginLeft = '0rem';
    }

    applyTheme();

    if (!inst.themeRegistered) {
      inst.themeRegistered = true;

      if (window.__registerPlotInputThemeListener) {
        window.__registerPlotInputThemeListener(function() {
          applyTheme();
        });
      }
    }

    requestAnimationFrame(applyTheme);
    setTimeout(applyTheme, 0);
    setTimeout(applyTheme, 80);
    setTimeout(applyTheme, 200);
    setTimeout(applyTheme, 500);

    return true;
  };

  window.__bootstrapPlotInputs = function() {
    const nodes = document.querySelectorAll<HTMLElement>('[id^="lia-plot-input-"][data-spec]');

    nodes.forEach(function(node) {
      const uid = String(node.id || '').replace(/^lia-plot-input-/, '');
      const spec = String(node.dataset.spec || '');
      if (!uid || !spec) return;

      window.renderPlotInputFromSpec(uid, spec);
    });
  };

  if (!window.__scheduleBootstrapPlotInputs) {
    window.__scheduleBootstrapPlotInputs = function() {
      if (window.__bootstrapPlotInputsRAF) return;
      window.__bootstrapPlotInputsRAF = requestAnimationFrame(function() {
        window.__bootstrapPlotInputsRAF = 0;
        try {
          if (window.__bootstrapPlotInputs) window.__bootstrapPlotInputs();
        } catch (e) {}
      });
    };
  }

  try {
    const mo = new MutationObserver(function(mutations) {
      let needsBootstrap = false;

      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type !== 'childList') continue;

        const added = Array.from(m.addedNodes || []);
        for (let j = 0; j < added.length; j++) {
          const n = added[j] as HTMLElement;
          if (!n || n.nodeType !== 1) continue;

          if (
            (n.id && /^lia-plot-input-/.test(n.id)) ||
            (n.querySelector && n.querySelector('[id^="lia-plot-input-"][data-spec]'))
          ) {
            needsBootstrap = true;
            break;
          }
        }

        if (needsBootstrap) break;
      }

      if (needsBootstrap && window.__scheduleBootstrapPlotInputs) {
        window.__scheduleBootstrapPlotInputs();
      }
    });

    const root = document.body || document.documentElement;
    if (root) {
      mo.observe(root, {
        childList: true,
        subtree: true
      });
    }
  } catch (e) {}

  try {
    window.addEventListener('hashchange', function() {
      if (window.__scheduleBootstrapPlotInputs) window.__scheduleBootstrapPlotInputs();
    }, true);
  } catch (e) {}

  try {
    window.addEventListener('pageshow', function() {
      if (window.__scheduleBootstrapPlotInputs) window.__scheduleBootstrapPlotInputs();
    }, true);
  } catch (e) {}

  try {
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden && window.__scheduleBootstrapPlotInputs) {
        window.__scheduleBootstrapPlotInputs();
      }
    }, true);
  } catch (e) {}

  try {
    if (window.__scheduleBootstrapPlotInputs) window.__scheduleBootstrapPlotInputs();
    setTimeout(function() {
      if (window.__scheduleBootstrapPlotInputs) window.__scheduleBootstrapPlotInputs();
    }, 80);
    setTimeout(function() {
      if (window.__scheduleBootstrapPlotInputs) window.__scheduleBootstrapPlotInputs();
    }, 220);
  } catch (e) {}
}
