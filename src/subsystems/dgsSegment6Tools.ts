import {
  DGS_3D_ADVANCED_GROUPS, DGS_3D_ADVANCED_TOOLS,
  dgs3DAdvancedToolIcon, dgs3DAdvancedToolLabel, isDgs3DAdvancedToolAvailable,
  showDgs3DAdvancedToolsLocally,
  type Dgs3DAdvancedGroup
} from '../shared/dgs3dTools';

type Field = {
  name: string;
  label: string;
  value?: string;
  options?: Array<[string, string]>;
  required?: boolean;
};

const mounted = new WeakSet<Element>();
let markerSequence = 0;

function boardObjects(board: any): any[] {
  const view = Object.values(window.__coordinateViews3d || {}).find((entry: any) => entry?.board === board) as any;
  const values = [
    ...Array.from(board?.objectsList || []),
    ...Object.values(board?.objects || {}),
    ...Array.from(view?.points || []),
    ...Array.from(view?.linearObjects || []),
    ...Array.from(view?.planeObjects || []),
    ...Array.from(view?.circleObjects || []),
    ...Array.from(view?.sphereObjects || []),
    ...Array.from(view?.polygonObjects || []),
    ...Array.from(view?.solidObjects || []),
    ...Array.from(view?.curveObjects || []),
    ...Array.from(view?.surfaceObjects || [])
  ] as any[];
  [
    window.__curve3DEntries, window.__surface3DEntries, window.__conic3DEntries,
    window.__analytic3DEntries, window.__locus3DEntries, window.__locusSurface3DEntries
  ].forEach(registry => Object.values(registry || {}).forEach((entry: any) => {
    if (entry?.board === board && entry.object) values.push(entry.object);
  }));
  return values.filter((value, index) => value && values.indexOf(value) === index);
}

function objectName(object: any): string {
  return String(
    object?.__liaDgsPointName || object?.__liaDgsVectorName || object?.__liaDgsLineName ||
    object?.__liaDgsSegmentName || object?.__liaDgsRayName || object?.__liaDgsPlaneName ||
    object?.__liaDgsCircle3DName || object?.__liaDgsSphere3DName || object?.__liaDgsPolygon3DName ||
    object?.__liaDgsSolid3DName || object?.__liaDgsCurve3DName || object?.__liaDgsSurface3DName ||
    object?.__liaDgsConic3DName || object?.__liaDgsAnalytic3DName || object?.__liaDgsFunctionName ||
    object?.__liaRegressionEntry?.title || object?.__liaRegressionAnalysisId || object?.__liaSceneRecord?.name ||
    object?.name || ''
  ).replace(/\\\(|\\\)|\$/g, '').trim();
}

function spatialObject(object: any): boolean {
  const value = object?.__liaPoint3DProxy || object?.__liaLinear3DProxy ||
    object?.__liaPlane3DProxy || object?.__liaCircle3DProxy ||
    object?.__liaSphere3DProxy || object?.__liaPolygon3DProxy ||
    object?.__liaSolid3DProxy || object?.__liaCurve3DProxy ||
    object?.__liaSurface3DProxy || object;
  return !!value && (
    value.__liaPoint3D === true || value.__liaLinear3D === true ||
    value.__liaPlane3D === true || value.__liaCircle3D === true ||
    value.__liaSphere3D === true || value.__liaPolygon3D === true ||
    value.__liaSolid3D === true || value.__liaCurve3D === true ||
    value.__liaSurface3D === true || value.__liaConicSection3D === true ||
    value.__liaDgsAnalytic3D === true || value.__liaTransformation3D === true
  );
}
function mount(menu: HTMLElement): void {
  if (mounted.has(menu)) return;
  const boardId = String(menu.dataset.dgsBoardId || '');
  const board = window.__boards?.[boardId];
  if (!board) return;
  const de = menu.dataset.dgsLanguage !== 'en';
  const menuClip = menu.parentElement;
  if (!menuClip) return;
  mounted.add(menu);
  const allowed = (key: string): boolean => board.__liaSceneMode === '3d' &&
    isDgs3DAdvancedToolAvailable(board.__liaDgsAvailableToolIds, key);
  const groupOptions = (group: Dgs3DAdvancedGroup): Array<[string, string]> =>
    DGS_3D_ADVANCED_TOOLS.filter(tool => tool.group === group && allowed(tool.key))
      .map(tool => [tool.key, dgs3DAdvancedToolLabel(tool, de ? 'de' : 'en')]);
  const groupAvailable = (group: Dgs3DAdvancedGroup): boolean => groupOptions(group).length > 0;
  const pointAvailable = (): boolean => board.__liaSceneMode === '3d' &&
    (board.__liaDgsAvailableToolIds == null || board.__liaDgsAvailableToolIds.has(200));
  let activeCapabilityKeys: string[] = [];

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lia-dgs-geometry-button lia-dgs-segment6-button';
  button.dataset.dgsCurrentToolId = '660';
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', de ? 'Vektoranalyse, Raumkurven und Flächen' : 'Vector analysis, spatial curves and surfaces');
  button.title = button.getAttribute('aria-label') || '';
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18L12 13L19 17M12 13V4M5 18V9M19 17V8"></path><path class="lia-dgs-cross" d="M3.5 16.5l3 3M6.5 16.5l-3 3M10.5 2.5l3 3M13.5 2.5l-3 3M17.5 15.5l3 3M20.5 15.5l-3 3"></path></svg>';
  button.hidden = board.__liaSceneMode !== '3d';
  const divider = menu.querySelector('.lia-dgs-function-divider');
  menu.insertBefore(button, divider || null);

  const submenu = document.createElement('div');
  submenu.className = 'lia-dgs-geometry-submenu lia-dgs-segment6-submenu';
  submenu.setAttribute('role', 'menu');
  submenu.setAttribute('aria-label', button.getAttribute('aria-label') || '3D+');
  submenu.id = 'dgs-segment6-submenu-' + boardId;
  button.setAttribute('aria-controls', submenu.id);
  menuClip.appendChild(submenu);

  const dialog = document.createElement('dialog');
  dialog.className = 'lia-dgs-segment6-dialog';
  dialog.setAttribute('aria-modal', 'true');
  Object.assign(dialog.style, {
    color: '#fff', background: '#202426', border: '2px solid #00dfe8', borderRadius: '10px',
    padding: '14px', minWidth: 'min(520px, calc(100vw - 32px))', maxWidth: '720px',
    maxHeight: 'calc(100vh - 32px)', overflow: 'auto', zIndex: '2147483000'
  });
  (menuClip.parentElement || document.body).appendChild(dialog);

  const names = (): Array<[string, string]> => {
    const seen = new Set<string>();
    return boardObjects(board).filter(spatialObject).map(objectName).filter(name => {
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    }).map(name => [name, name]);
  };

  const pointNames = (): Array<[string, string]> => boardObjects(board)
    .filter(object => !!object?.__liaPoint3D)
    .map(object => objectName(object))
    .filter((name, index, all) => !!name && all.indexOf(name) === index)
    .map(name => [name, name]);

  const driverNames = (): Array<[string, string]> => {
    const result = names().slice();
    const add = (value: string) => {
      if (value && !result.some(([candidate]) => candidate === value)) result.push([value, value]);
    };
    boardObjects(board).forEach(object => {
      if (!object?.__liaPoint3D) return;
      const name = objectName(object);
      const binding = object.__liaPoint3DBindingParameters;
      if (!name || !binding) return;
      if (binding.kind === 'curve') add(name + '.t');
      else if (binding.kind === 'surface') { add(name + '.u'); add(name + '.v'); }
      else if (binding.kind === 'circle') add(name);
    });
    return result;
  };

  const closeDialog = () => {
    activeCapabilityKeys = [];
    try { dialog.close(); } catch (error) { dialog.removeAttribute('open'); }
  };

  const showForm = (
    title: string,
    fields: Field[],
    submit: (values: Record<string, string>) => boolean,
    confirmLabel?: string
  ) => {
    dialog.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = title;
    heading.id = 'dgs-segment6-dialog-title-' + boardId;
    dialog.setAttribute('aria-labelledby', heading.id);
    dialog.appendChild(heading);
    const form = document.createElement('form');
    form.style.display = 'grid';
    form.style.gap = '9px';
    fields.forEach(field => {
      const label = document.createElement('label');
      label.style.display = 'grid';
      label.style.gap = '3px';
      const caption = document.createElement('span');
      caption.textContent = field.label;
      label.appendChild(caption);
      const control = field.options ? document.createElement('select') : document.createElement('input');
      control.name = field.name;
      control.required = field.required !== false;
      field.options?.forEach(([value, text]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        control.appendChild(option);
      });
      if (field.value != null) control.value = field.value;
      Object.assign(control.style, {
        font: 'inherit', padding: '6px', color: '#fff', background: '#303638',
        border: '1px solid #cfd8dc', borderRadius: '5px'
      });
      label.appendChild(control);
      form.appendChild(label);
    });
    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    form.appendChild(status);
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = de ? 'Abbrechen' : 'Cancel';
    cancel.addEventListener('click', closeDialog);
    const confirm = document.createElement('button');
    confirm.type = 'submit';
    confirm.textContent = confirmLabel || (de ? 'Erzeugen' : 'Create');
    actions.append(cancel, confirm);
    form.appendChild(actions);
    dialog.appendChild(form);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const values: Record<string, string> = {};
      Array.from(form.elements).forEach(element => {
        const control = element as HTMLInputElement | HTMLSelectElement;
        if (control.name) values[control.name] = control.value;
      });
      if (!submit(values)) {
        status.textContent = de
          ? 'Die Auswahl oder Eingabe ist für diese Konstruktion nicht gültig.'
          : 'The selection or input is not valid for this construction.';
        return;
      }
      closeDialog();
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeDialog();
    }, { once: true });
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    (form.querySelector('input,select') as HTMLElement | null)?.focus();
  };

  const addMarker = (
    prefix: string,
    spec: string,
    extras: Record<string, string>,
    render: (uid: string) => boolean
  ): boolean => {
    window.__captureDgsSceneSnapshot?.(boardId);
    const uid = 'dgs6-' + boardId + '-' + Date.now().toString(36) + '-' + (++markerSequence);
    const marker = document.createElement('span');
    marker.id = prefix + '-spec-' + uid;
    marker.dataset.spec = spec;
    marker.dataset.dgsCreated = 'true';
    marker.hidden = true;
    Object.keys(extras).forEach(key => { marker.dataset[key] = extras[key]; });
    (document.body || document.documentElement).appendChild(marker);
    if (!render(uid)) {
      marker.remove();
      return false;
    }
    window.__persistDgsSegment6?.(boardId);
    return true;
  };

  const analytic = (values: Record<string, string>): boolean => {
    const operation = values.operation;
    if (!allowed(operation)) return false;
    const sources = [values.source1, values.source2, values.source3].filter(Boolean);
    const options = ['value', 't', 'u', 'v']
      .filter(key => values[key] !== '' && values[key] != null)
      .map(key => key + '=' + values[key]);
    const spec = [
      boardId, values.name || 'a', ...sources, ...options,
      'objectid=dgs:' + operation + ':' + Date.now().toString(36)
    ].join(';');
    return addMarker('analytic3d', spec, { operation }, uid =>
      window.renderAnalytic3DFromSpec?.(uid, spec, operation) === true
    );
  };

  const analyticFields = (operations: Array<[string, string]>): Field[] => [
    { name: 'operation', label: de ? 'Operation' : 'Operation', options: operations },
    { name: 'name', label: de ? 'Name' : 'Name', value: 'a' },
    { name: 'source1', label: de ? 'Quelle 1' : 'Source 1', options: [['', '—'], ...names()] },
    { name: 'source2', label: de ? 'Quelle 2' : 'Source 2', options: [['', '—'], ...names()], required: false },
    { name: 'source3', label: de ? 'Quelle 3' : 'Source 3', options: [['', '—'], ...names()], required: false },
    { name: 'value', label: de ? 'Skalar / Startwert' : 'Scalar / start value', value: '', required: false },
    { name: 't', label: 't', value: '0', required: false },
    { name: 'u', label: 'u / Intervallanfang', value: '0', required: false },
    { name: 'v', label: 'v / Intervallende', value: '0', required: false }
  ];

  const actionButtons = new Map<Dgs3DAdvancedGroup, HTMLButtonElement>();
  const action = (group: Dgs3DAdvancedGroup, run: () => void) => {
    const metadata = DGS_3D_ADVANCED_GROUPS.find(entry => entry.key === group)!;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'lia-dgs-geometry-tool lia-dgs-segment6-action';
    item.dataset.dgsAdvancedGroup = group;
    item.setAttribute('role', 'menuitem');
    item.innerHTML = dgs3DAdvancedToolIcon(group) + '<span></span>';
    item.querySelector('span')!.textContent = dgs3DAdvancedToolLabel(metadata, de ? 'de' : 'en');
    item.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (!groupAvailable(group)) return;
      activeCapabilityKeys = groupOptions(group).map(([key]) => key);
      submenu.dataset.open = '0';
      button.setAttribute('aria-expanded', 'false');
      run();
    });
    actionButtons.set(group, item);
    submenu.appendChild(item);
  };

  const analyticAction = (group: Dgs3DAdvancedGroup) => action(group, () => {
    const metadata = DGS_3D_ADVANCED_GROUPS.find(entry => entry.key === group)!;
    showForm(dgs3DAdvancedToolLabel(metadata, de ? 'de' : 'en'),
      analyticFields(groupOptions(group)), analytic);
  });

  analyticAction('vector');
  analyticAction('measure');
  analyticAction('analytic');

  action('surface', () => {
    const fields: Field[] = [
      { name: 'kind', label: de ? 'Objektart' : 'Object type', options: groupOptions('surface') },
      { name: 'name', label: de ? 'Name' : 'Name', value: 'c' },
      { name: 'p1', label: de ? 'Parameter 1 / Ebene' : 'Parameter 1 / plane', value: 't' },
      { name: 'p2', label: de ? 'Parameter 2 / Körper' : 'Parameter 2 / solid', value: 'v', required: false },
      { name: 'x', label: 'x(t) / x(u,v)', value: 'cos(t)' },
      { name: 'y', label: 'y(t) / y(u,v)', value: 'sin(t)' },
      { name: 'z', label: 'z(t) / z(u,v) / f(x,y)', value: 't/4' },
      { name: 'amin', label: 'tmin / umin', value: '-6.283185307179586' },
      { name: 'amax', label: 'tmax / umax', value: '6.283185307179586' },
      { name: 'bmin', label: 'vmin', value: '-3.141592653589793', required: false },
      { name: 'bmax', label: 'vmax', value: '3.141592653589793', required: false }
    ];
    showForm(de ? 'Raumkurve, Fläche oder Kegelschnitt' : 'Curve, surface or conic', fields, values => {
      if (!allowed(values.kind) || !groupOptions('surface').some(([key]) => key === values.kind)) return false;
      const id = 'dgs:' + values.kind + ':' + Date.now().toString(36);
      if (values.kind === 'curve') {
        const spec = [
          boardId, values.name, values.p1 || 't', values.x, values.y, values.z,
          values.amin, values.amax, 'objectid=' + id
        ].join(';');
        return addMarker('curve3d', spec, {}, uid =>
          window.renderCurve3DFromSpec?.(uid, spec) === true
        );
      }
      if (values.kind === 'conic') {
        const spec = [boardId, values.name, values.p1, values.p2, 'objectid=' + id].join(';');
        return addMarker('conic3d', spec, {}, uid =>
          window.renderConic3DFromSpec?.(uid, spec) === true
        );
      }
      const functionGraph = values.kind === 'function-surface';
      const spec = functionGraph
        ? [
            boardId, values.name, values.z, values.amin, values.amax,
            values.bmin, values.bmax, 'objectid=' + id
          ].join(';')
        : [
            boardId, values.name, values.p1 || 'u', values.p2 || 'v',
            values.x, values.y, values.z, values.amin, values.amax,
            values.bmin, values.bmax, 'objectid=' + id
          ].join(';');
      return addMarker('surface3d', spec, { functionGraph: String(functionGraph) }, uid =>
        window.renderSurface3DFromSpec?.(uid, spec, functionGraph) === true
      );
    });
  });

  analyticAction('analysis');

  action('locus', () => {
    const fields: Field[] = [
      {
        name: 'kind', label: de ? 'Objektart' : 'Object type',
        options: groupOptions('locus').map(([key, label]) => [key.replace('locus-', ''), label])
      },
      { name: 'name', label: de ? 'Name' : 'Name', value: 'L' },
      { name: 'driver1', label: de ? 'Treiber 1' : 'Driver 1', options: driverNames() },
      { name: 'driver2', label: de ? 'Treiber 2' : 'Driver 2', options: [['', '—'], ...driverNames()], required: false },
      { name: 'trace', label: de ? 'Spurpunkt' : 'Trace point', options: pointNames() },
      { name: 'quality', label: de ? 'Abtastqualität' : 'Sampling quality', value: '96' }
    ];
    showForm(de ? 'Ortskurve oder Ortsfläche' : 'Locus curve or surface', fields, values => {
      if (!allowed('locus-' + values.kind)) return false;
      const surface = values.kind === 'surface';
      const spec = surface
        ? [
            boardId, values.name, values.driver1, values.driver2, values.trace,
            'quality=' + values.quality, 'objectid=dgs:locus-surface:' + Date.now().toString(36)
          ].join(';')
        : [
            boardId, values.name, values.driver1, values.trace,
            'quality=' + values.quality, 'objectid=dgs:locus:' + Date.now().toString(36)
          ].join(';');
      return addMarker(surface ? 'locussurface3d' : 'locus3d', spec, {}, uid =>
        surface
          ? window.renderLocusSurface3DFromSpec?.(uid, spec) === true
          : window.renderLocus3DFromSpec?.(uid, spec) === true
      );
    });
  });

  const sideMenu = menuClip.parentElement?.querySelector<HTMLElement>('.lia-dgs-side-menu') || null;
  const definitionPanel = document.createElement('section');
  definitionPanel.className = 'lia-dgs-segment6-properties';
  definitionPanel.hidden = true;
  Object.assign(definitionPanel.style, {
    margin: '0 0 10px', padding: '8px', border: '1px solid rgba(127,127,127,.55)',
    borderRadius: '7px', gap: '7px', font: '12px/1.35 system-ui,sans-serif'
  });
  const definitionHeading = document.createElement('strong');
  definitionHeading.textContent = de ? 'Definition und Analyse' : 'Definition and analysis';
  const definitionDetails = document.createElement('div');
  definitionDetails.style.whiteSpace = 'pre-wrap';
  definitionDetails.style.overflowWrap = 'anywhere';
  const qualityRow = document.createElement('div');
  qualityRow.style.display = 'grid';
  qualityRow.style.gridTemplateColumns = 'minmax(0,1fr) minmax(0,1fr)';
  qualityRow.style.gap = '6px';
  const makeQualityInput = (captionText: string) => {
    const label = document.createElement('label');
    label.style.display = 'grid'; label.style.gap = '2px';
    const caption = document.createElement('span'); caption.textContent = captionText;
    const input = document.createElement('input');
    input.type = 'number'; input.step = '1'; input.style.minWidth = '0'; input.style.width = '100%';
    input.setAttribute('aria-label', captionText);
    label.append(caption, input); qualityRow.appendChild(label);
    return { label, input };
  };
  const qualityU = makeQualityInput(de ? 'Abtastqualit\u00e4t' : 'Sampling quality');
  const qualityV = makeQualityInput(de ? 'Qualit\u00e4t v' : 'Quality v');
  const propertyActions = document.createElement('div');
  propertyActions.style.display = 'grid'; propertyActions.style.gap = '5px';
  const propertyStatus = document.createElement('div');
  propertyStatus.setAttribute('role', 'status'); propertyStatus.setAttribute('aria-live', 'polite');
  definitionPanel.append(definitionHeading, definitionDetails, qualityRow, propertyActions, propertyStatus);
  if (sideMenu) sideMenu.insertBefore(definitionPanel, sideMenu.children[1] || null);

  type Segment6PropertyInfo = {
    kind: 'curve' | 'surface' | 'conic' | 'analytic' | 'locus' | 'locus-surface';
    key: string; prefix: string; entry: any; registry: Record<string, any>;
  };
  const propertyRegistries = (): Array<Omit<Segment6PropertyInfo, 'key' | 'entry'>> => [
    { kind: 'curve', prefix: 'curve3d', registry: window.__curve3DEntries || {} },
    { kind: 'surface', prefix: 'surface3d', registry: window.__surface3DEntries || {} },
    { kind: 'conic', prefix: 'conic3d', registry: window.__conic3DEntries || {} },
    { kind: 'analytic', prefix: 'analytic3d', registry: window.__analytic3DEntries || {} },
    { kind: 'locus', prefix: 'locus3d', registry: window.__locus3DEntries || {} },
    { kind: 'locus-surface', prefix: 'locussurface3d', registry: window.__locusSurface3DEntries || {} }
  ];
  const propertyInfo = (object: any): Segment6PropertyInfo | null => {
    for (const descriptor of propertyRegistries()) {
      for (const [key, entry] of Object.entries(descriptor.registry)) {
        if ((entry as any)?.object === object) return { ...descriptor, key, entry };
      }
    }
    return null;
  };
  const numberText = (value: unknown): string => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toLocaleString(de ? 'de-DE' : 'en-US', { maximumFractionDigits: 8 }) : String(value ?? '');
  };
  const rangeText = (value: unknown): string => Array.isArray(value) && value.length >= 2
    ? '[' + numberText(value[0]) + '; ' + numberText(value[1]) + ']' : '\u2013';
  const vectorText = (value: unknown): string => Array.isArray(value)
    ? '(' + value.map(numberText).join(' | ') + ')' : '\u2013';
  const propertyState = (): any => ({
    contextObject: (window as any).__dgsSegment6PropertyObjects?.[boardId],
    sideMenuOpen: sideMenu?.dataset.open === '1',
    sideMenuCloseButton: sideMenu?.querySelector('.lia-dgs-side-menu-close'),
    orthogonalButton: menu.querySelector(':scope > .lia-dgs-orthogonal-button')
  });
  const closeProperties = () => {
    const state = propertyState();
    if (state?.sideMenuOpen) state.sideMenuCloseButton?.click();
  };
  const nextPointName = (): string => {
    const used = new Set(pointNames().map(([value]) => value));
    let index = 1; while (used.has('P' + index)) index += 1;
    return 'P' + index;
  };
  const openBoundPoint = (object: any) => {
    if (!pointAvailable()) return;
    const record = object?.__liaSceneRecord;
    const sourceName = objectName(object);
    const curve = record?.kind === 'curve3d' || record?.kind === 'locus-curve3d';
    const surface = record?.kind === 'surface3d' || record?.kind === 'locus-surface3d';
    if (!sourceName || (!curve && !surface)) return;
    const fields: Field[] = [{ name: 'name', label: de ? 'Punktname' : 'Point name', value: nextPointName() }];
    if (curve) {
      const range = record.parameterRange || [0, 1];
      fields.push({ name: 't', label: String(record.parameter || 't'), value: String((Number(range[0]) + Number(range[1])) / 2) });
    } else {
      const uRange = record.uRange || [0, 1], vRange = record.vRange || [0, 1];
      fields.push(
        { name: 'u', label: String(record.parameters?.[0] || 'u'), value: String((Number(uRange[0]) + Number(uRange[1])) / 2) },
        { name: 'v', label: String(record.parameters?.[1] || 'v'), value: String((Number(vRange[0]) + Number(vRange[1])) / 2) }
      );
    }
    closeProperties();
    showForm(de ? 'Punkt auf Objekt' : 'Point on object', fields, values => {
      if (!pointAvailable()) return false;
      const parts = [boardId, values.name, '0', '0', '0', '#ff00ff', '1', 'on=' + sourceName];
      if (curve) parts.push('t=' + values.t); else parts.push('u=' + values.u, 'v=' + values.v);
      parts.push('objectid=dgs:bound-point:' + Date.now().toString(36));
      const spec = parts.join(';');
      return addMarker('point3d', spec, {}, uid => window.renderPoint3DFromSpec?.(uid, spec) === true);
    });
  };
  const splitSpec = (value: string): string[] => {
    const result: string[] = []; let current = '', depth = 0, quote = '';
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      if (quote) { current += char; if (char === quote && value[index - 1] !== '\\') quote = ''; continue; }
      if (char.charCodeAt(0) === 96 || char === '"' || char === "'") { quote = char; current += char; continue; }
      if (char === '[' || char === '(' || char === '{') depth += 1;
      else if (char === ']' || char === ')' || char === '}') depth = Math.max(0, depth - 1);
      if (char === ';' && depth === 0) { result.push(current); current = ''; } else current += char;
    }
    result.push(current); return result;
  };
  const setSpecOption = (spec: string, key: string, value: number): string => {
    const parts = splitSpec(spec), expression = new RegExp('^\\s*' + key + '\\s*=', 'i');
    const index = parts.findIndex(part => expression.test(part));
    if (index >= 0) parts[index] = key + '=' + value; else parts.push(key + '=' + value);
    return parts.join(';');
  };
  const rerender = (info: Segment6PropertyInfo, spec: string): boolean => {
    const marker = document.getElementById(info.prefix + '-spec-' + info.key) as HTMLElement | null;
    if (!marker) return false;
    window.__captureDgsSceneSnapshot?.(boardId);
    const previous = String(marker.dataset.spec || info.entry.spec || '');
    marker.dataset.spec = spec;
    const render = (value: string): boolean => info.kind === 'curve'
      ? window.renderCurve3DFromSpec?.(info.key, value) === true
      : info.kind === 'surface'
      ? window.renderSurface3DFromSpec?.(info.key, value, !!info.entry.functionGraph) === true
      : info.kind === 'locus'
      ? window.renderLocus3DFromSpec?.(info.key, value) === true
      : info.kind === 'locus-surface' && window.renderLocusSurface3DFromSpec?.(info.key, value) === true;
    if (!render(spec)) { marker.dataset.spec = previous; render(previous); return false; }
    window.__persistDgsSegment6?.(boardId); closeProperties(); return true;
  };
  const openDefinitionEditor = (info: Segment6PropertyInfo) => {
    const parts = splitSpec(String(info.entry.spec || ''));
    const field = (name: string, label: string, index: number): Field => ({
      name, label, value: String(parts[index] ?? '')
    });
    let fields: Field[] = [];
    let fixedCount = 0;
    let build: (values: Record<string, string>) => string[];
    if (info.kind === 'curve') {
      fixedCount = 8;
      fields = [
        field('parameter', de ? 'Parameter' : 'Parameter', 2),
        field('x', 'x(t)', 3), field('y', 'y(t)', 4), field('z', 'z(t)', 5),
        field('minimum', de ? 'Intervall von' : 'Range from', 6),
        field('maximum', de ? 'Intervall bis' : 'Range to', 7)
      ];
      build = values => [parts[0], parts[1], values.parameter, values.x, values.y, values.z,
        values.minimum, values.maximum];
    } else if (info.kind === 'surface' && info.entry.functionGraph) {
      fixedCount = 7;
      fields = [
        field('z', 'z=f(x,y)', 2),
        field('umin', de ? 'x von' : 'x from', 3), field('umax', de ? 'x bis' : 'x to', 4),
        field('vmin', de ? 'y von' : 'y from', 5), field('vmax', de ? 'y bis' : 'y to', 6)
      ];
      build = values => [parts[0], parts[1], values.z, values.umin, values.umax, values.vmin, values.vmax];
    } else {
      fixedCount = 11;
      fields = [
        field('uParameter', de ? 'Parameter u' : 'Parameter u', 2),
        field('vParameter', de ? 'Parameter v' : 'Parameter v', 3),
        field('x', 'x(u,v)', 4), field('y', 'y(u,v)', 5), field('z', 'z(u,v)', 6),
        field('umin', de ? 'u von' : 'u from', 7), field('umax', de ? 'u bis' : 'u to', 8),
        field('vmin', de ? 'v von' : 'v from', 9), field('vmax', de ? 'v bis' : 'v to', 10)
      ];
      build = values => [parts[0], parts[1], values.uParameter, values.vParameter,
        values.x, values.y, values.z, values.umin, values.umax, values.vmin, values.vmax];
    }
    closeProperties();
    showForm(de ? 'Definition bearbeiten' : 'Edit definition', fields, values =>
      rerender(info, build(values).concat(parts.slice(fixedCount)).join(';')),
      de ? 'Speichern' : 'Save');
  };

  const addPropertyAction = (label: string, run: () => void) => {
    const control = document.createElement('button');
    control.type = 'button'; control.textContent = label; control.style.width = '100%';
    control.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); run(); });
    propertyActions.appendChild(control);
  };
  const openSegment6Menu = () => {
    closeProperties();
    if (button.getAttribute('aria-expanded') !== 'true') button.click();
  };
  const renderPropertyPanel = () => {
    if (!sideMenu) return;
    const object = propertyState()?.contextObject;
    const info = propertyInfo(object);
    definitionPanel.hidden = !info;
    definitionPanel.style.display = info ? 'grid' : 'none';
    if (!info) return;
    const record = object?.__liaSceneRecord || {}, lines: string[] = [];
    const row = (caption: string, value: unknown) => { const text = String(value ?? '').trim(); if (text) lines.push(caption + ': ' + text); };
    row(de ? 'Typ' : 'Type', record.kind || info.kind);
    if (info.kind === 'curve' || info.kind === 'locus') {
      row(de ? 'Komponenten' : 'Components', record.expressions?.join(' ; '));
      row(de ? 'Parameter' : 'Parameter', record.parameter || 't');
      row(de ? 'Intervall' : 'Range', rangeText(record.parameterRange));
      row(de ? 'Quellen' : 'Sources', (record.sourceIds || record.driverIds || []).join(', '));
      row(de ? 'Spurpunkt' : 'Trace point', record.tracePointId);
    } else if (info.kind === 'surface' || info.kind === 'locus-surface') {
      row(de ? 'Komponenten' : 'Components', record.expressions?.join(' ; '));
      row(de ? 'Parameter' : 'Parameters', record.parameters?.join(', ') || 'u, v');
      row('u', rangeText(record.uRange)); row('v', rangeText(record.vRange));
      row(de ? 'Quellen' : 'Sources', (record.sourceIds || record.driverIds || []).join(', '));
      row(de ? 'Spurpunkt' : 'Trace point', record.tracePointId);
    } else if (info.kind === 'conic') {
      const section = info.entry.section?.();
      row(de ? 'Erkannter Typ' : 'Detected type', section?.conicKind || record.classification || '\u2013');
      row(de ? 'Quellen' : 'Sources', [objectName(info.entry.planeObject), objectName(info.entry.solidObject)].filter(Boolean).join(', '));
      row(de ? 'Lokaler Ursprung' : 'Local origin', vectorText(section?.origin || record.localFrame?.origin));
      row(de ? 'Richtung 1' : 'Direction 1', vectorText(section?.direction1 || record.localFrame?.direction1));
      row(de ? 'Richtung 2' : 'Direction 2', vectorText(section?.direction2 || record.localFrame?.direction2));
      row(de ? 'Mittelpunkt' : 'Center', vectorText(section?.canonical?.center));
      row(de ? 'Eigenwerte / Achsen' : 'Eigenvalues / axes', vectorText(section?.canonical?.eigenvalues));
    } else {
      row(de ? 'Operation' : 'Operation', object.__liaDgsAnalytic3DOperation || record.operation);
      row(de ? 'Quellen' : 'Sources', (object.__liaDgsAnalytic3DSources || []).map(objectName).filter(Boolean).join(', '));
      const value = object.__liaDgsAnalytic3DEvaluator?.() ?? object.__liaDgsAnalytic3DValue;
      row(de ? 'Ergebnis' : 'Result', Array.isArray(value) ? vectorText(value) : numberText(value));
    }
    definitionDetails.textContent = lines.join('\n'); propertyActions.replaceChildren(); propertyStatus.textContent = '';
    const editable = info.kind === 'curve' || info.kind === 'surface' || info.kind === 'locus' || info.kind === 'locus-surface';
    qualityRow.hidden = !editable; qualityRow.style.display = editable ? 'grid' : 'none';
    qualityV.label.hidden = info.kind !== 'surface';
    if (editable) {
      const quality = record.quality, first = Array.isArray(quality) ? quality[0] : quality, second = Array.isArray(quality) ? quality[1] : first;
      qualityU.input.value = String(Number(first) || (info.kind.includes('surface') ? 20 : 96));
      qualityV.input.value = String(Number(second) || 20);
    }
    if (editable) {
      if (info.kind === 'curve' || info.kind === 'surface') {
        addPropertyAction(de ? 'Definition bearbeiten…' : 'Edit definition…', () => openDefinitionEditor(info));
      }
      if (pointAvailable()) addPropertyAction(de ? 'Punkt auf Objekt setzen' : 'Create point on object', () => openBoundPoint(object));
      if (groupAvailable('analysis')) addPropertyAction(de ? 'Analysewerkzeuge\u2026' : 'Analysis tools\u2026', openSegment6Menu);
      if (groupAvailable('locus')) addPropertyAction(de ? 'Ortsobjekt erzeugen\u2026' : 'Create locus object\u2026', openSegment6Menu);
    }
    if (info.kind !== 'analytic') addPropertyAction(de ? 'Transformation ausw\u00e4hlen\u2026' : 'Choose transformation\u2026', () => {
      closeProperties(); propertyState()?.orthogonalButton?.click();
    });
  };
  const applyQuality = () => {
    const info = propertyInfo(propertyState()?.contextObject);
    if (!info || qualityRow.hidden) return;
    const surface = info.kind === 'surface' || info.kind === 'locus-surface';
    const maximum = info.kind === 'curve' ? 512 : info.kind === 'locus' ? 256 : info.kind === 'locus-surface' ? 64 : 128;
    const first = Math.round(Number(qualityU.input.value));
    if (!Number.isFinite(first) || first < (surface ? 4 : 8) || first > maximum) {
      propertyStatus.textContent = de ? 'Ung\u00fcltige Qualit\u00e4t.' : 'Invalid quality.'; return;
    }
    let spec = setSpecOption(String(info.entry.spec || ''), 'quality', first);
    if (info.kind === 'surface') {
      const second = Math.round(Number(qualityV.input.value));
      if (!Number.isFinite(second) || second < 4 || second > 128) {
        propertyStatus.textContent = de ? 'Ung\u00fcltige Qualit\u00e4t.' : 'Invalid quality.'; return;
      }
      spec = setSpecOption(spec, 'qualityv', second);
    }
    if (!rerender(info, spec)) propertyStatus.textContent = de ? 'Die Qualit\u00e4t konnte nicht angewendet werden.' : 'The quality could not be applied.';
  };
  qualityU.input.addEventListener('change', applyQuality);
  qualityV.input.addEventListener('change', applyQuality);
  const schedulePropertyPanel = () => queueMicrotask(renderPropertyPanel);
  const propertyObserver = new MutationObserver(schedulePropertyPanel);
  if (sideMenu) propertyObserver.observe(sideMenu.querySelector('.lia-dgs-side-menu-title') || sideMenu, { childList: true, subtree: true, characterData: true });
  board.containerObj?.addEventListener('contextmenu', schedulePropertyPanel, true);
  board.containerObj?.addEventListener('click', schedulePropertyPanel, true);
  renderPropertyPanel();

  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if (!DGS_3D_ADVANCED_TOOLS.some(tool => allowed(tool.key))) return;
    const open = submenu.dataset.open !== '1';
    submenu.dataset.open = open ? '1' : '0';
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      board.containerObj?.dispatchEvent(new CustomEvent('lia-dgs-flyout-open', {
        detail: { owner: submenu }
      }));
      const anchor = button.getBoundingClientRect();
      const clip = menuClip.getBoundingClientRect();
      submenu.style.left = Math.max(6, Math.min(anchor.left - clip.left, clip.width - 310)) + 'px';
    }
  });
  button.addEventListener('pointerdown', event => event.stopPropagation());
  submenu.addEventListener('pointerdown', event => event.stopPropagation());
  const closeForPeerFlyout = (event: Event) => {
    if ((event as CustomEvent).detail?.owner === submenu) return;
    submenu.dataset.open = '0';
    button.setAttribute('aria-expanded', 'false');
  };
  board.containerObj?.addEventListener('lia-dgs-flyout-open', closeForPeerFlyout);
  const syncModeVisibility = () => {
    const active = DGS_3D_ADVANCED_TOOLS.some(tool => allowed(tool.key));
    button.hidden = !active;
    button.disabled = !active;
    actionButtons.forEach((item, group) => {
      const available = groupAvailable(group);
      item.hidden = !available;
      item.disabled = !available;
      item.style.display = available ? '' : 'none';
    });
    if (!active) {
      submenu.dataset.open = '0';
      button.setAttribute('aria-expanded', 'false');
      closeDialog();
    } else if (activeCapabilityKeys.some(key => !allowed(key))) {
      closeDialog();
    }
    renderPropertyPanel();
  };
  board.containerObj?.addEventListener('lia-coordinate-scene-change', syncModeVisibility);
  board.containerObj?.addEventListener('lia-dgs-tool-availability-change', syncModeVisibility);
  syncModeVisibility();
  try { window.__refreshDgsToolAvailabilityForBoard?.(boardId); } catch (e) {}
  let disposed = false;
  let lifecycleObserver: MutationObserver;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    lifecycleObserver.disconnect();
    propertyObserver.disconnect();
    board.containerObj?.removeEventListener('contextmenu', schedulePropertyPanel, true);
    board.containerObj?.removeEventListener('click', schedulePropertyPanel, true);
    board.containerObj?.removeEventListener('lia-dgs-flyout-open', closeForPeerFlyout);
    board.containerObj?.removeEventListener('lia-coordinate-scene-change', syncModeVisibility);
    board.containerObj?.removeEventListener('lia-dgs-tool-availability-change', syncModeVisibility);
    submenu.remove();
    dialog.remove();
    button.remove();
    mounted.delete(menu);
    if (board.__liaDgsSegment6ToolsCleanup === cleanup) delete board.__liaDgsSegment6ToolsCleanup;
  };
  lifecycleObserver = new MutationObserver(() => {
    if (!menu.isConnected) cleanup();
  });
  const previousCleanup = board.__liaDgsSegment6ToolsCleanup;
  if (typeof previousCleanup === 'function' && previousCleanup !== cleanup) previousCleanup();
  board.__liaDgsSegment6ToolsCleanup = cleanup;
  const lifecycleRoot = menu.getRootNode();
  lifecycleObserver.observe(
    lifecycleRoot instanceof ShadowRoot ? lifecycleRoot : (document.body || document.documentElement),
    { childList: true, subtree: true }
  );
  menuClip.addEventListener('pointerdown', event => {
    if (event.target === button || submenu.contains(event.target as Node)) return;
    submenu.dataset.open = '0';
    button.setAttribute('aria-expanded', 'false');
  });
}

function bootstrap(): void {
  document.querySelectorAll<HTMLElement>('.lia-dgs-top-menu[data-dgs-board-id]').forEach(mount);
}

export function init(): void {
  if (!showDgs3DAdvancedToolsLocally()) {
    delete window.__mountDgsSegment6Tools;
    delete window.__bootstrapDgsSegment6Tools;
    return;
  }
  window.__mountDgsSegment6Tools = mount;
  window.__bootstrapDgsSegment6Tools = bootstrap;
  bootstrap();
  const observer = new MutationObserver(bootstrap);
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
}
