// Shared theme utilities used by all subsystems.
// Deduplicates themeDoc/themeWin/neutralColor/accentColor/themeSignature
// and the __liaThemeSync listener registry previously copy-pasted into 5 IIFEs.

export function themeDoc(): Document {
  return (window.parent && window.parent.document) ? window.parent.document : document;
}

export function themeWin(): Window & typeof globalThis {
  return (window.parent && (window.parent as any).getComputedStyle) ? window.parent as any : window;
}

export function getNeutralColor(): string {
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

export function getAccentColor(): string {
  try {
    const doc = themeDoc();
    const win = themeWin();
    const btn = doc.querySelector('.lia-btn');

    if (btn) {
      const cs = win.getComputedStyle(btn);

      const bg = cs.backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)') return bg;

      const br = cs.borderTopColor;
      if (br && br !== 'rgba(0, 0, 0, 0)') return br;

      if (cs.color) return cs.color;
    }
  } catch (e) {}

  return getNeutralColor();
}

export function themeSignature(): string {
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

/**
 * Initialize the shared theme listener registry (window.__liaThemeSync) and
 * window.__registerLiaThemeListener exactly once.
 *
 * Safe to call from multiple subsystem init() functions — subsequent calls are no-ops.
 */
export function initThemeSync(): void {
  if (window.__liaThemeSync) {
    // Registry already set up. Ensure __registerLiaThemeListener is exposed.
    if (typeof window.__registerLiaThemeListener !== 'function') {
      window.__registerLiaThemeListener = function(fn) {
        if (!window.__liaThemeSync || !fn) return;
        window.__liaThemeSync.listeners.add(fn);
        try { fn(); } catch (e) {}
      };
    }
    return;
  }

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
      window.__pointNeutralColor = getNeutralColor;
      notify();
    }
  }

  window.__liaThemeSync = { listeners, check };

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
    else if (mq && typeof (mq as any).addListener === 'function') (mq as any).addListener(check);
  } catch (e) {}

  setInterval(check, 300);

  window.__registerLiaThemeListener = function(fn) {
    if (!window.__liaThemeSync || !fn) return;
    window.__liaThemeSync.listeners.add(fn);
    try { fn(); } catch (e) {}
  };
}
