window.localizationFixture = {
  entry() {
    return Object.values(window.__scharEntries || {}).find(entry => entry.boardId === 'languageBoard');
  },
  tableRoot() { return document.querySelector('[id^="lia-table-"]'); },
  tableInputs() { return Array.from(this.tableRoot().querySelectorAll('.lia-dyn-table-input')); },
  plot() { return Object.values(window.__plotInputInstances || {})[0]; },
  plotState() { return Object.values(window.__plotInputStates || {})[0]; },
  pointUis() {
    return ['point-ui-', 'graph-ui-', 'multi-graph-ui-'].map(prefix => document.querySelector('[id^="' + prefix + '"]'));
  },
  buttons() {
    return this.pointUis().map(ui => ui?.querySelector('button'));
  },
  async ready() {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (this.entry()?.panel.isConnected && this.buttons().every(Boolean) && this.plot()?.input && this.tableInputs().length === 4) {
        await document.fonts.ready;
        let previous = '', stable = 0;
        for (let frame = 0; frame < 80; frame++) {
          await new Promise(resolve => setTimeout(resolve, 50));
          const next = JSON.stringify(this.entry().board.containerObj.getBoundingClientRect().toJSON());
          stable = next === previous ? stable + 1 : 0;
          previous = next;
          if (stable >= 8) return;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error('Localized LiaScript controls did not initialize');
  },
  center(element) {
    element.scrollIntoView({ block: 'nearest' });
    const rect = element.getBoundingClientRect();
    return [rect.left + rect.width / 2, rect.top + rect.height / 2];
  },
  remember() {
    const entry = this.entry();
    window.languageReferences = {
      entry, board: entry.board, panel: entry.panel, input: entry.slidersByParam.a,
      points: { ...window.__points.languageBoard }, buttons: this.buttons(),
      tableInputs: this.tableInputs(), plotInput: this.plot().input, plotGraph: this.plotState().graph
    };
  },
  changeLanguage(language) {
    for (const ui of this.pointUis()) ui.dataset.language = language;
    document.querySelector('[id^="schar-spec-"]').dataset.language = language;
    this.tableRoot().dataset.language = language;
    this.plot().root.dataset.language = language;
  },
  clearLanguageOverrides() {
    for (const root of [...this.pointUis(), document.querySelector('[id^="schar-spec-"]'), this.tableRoot(), this.plot().root]) {
      delete root.dataset.language;
    }
  },
  changeCourseLanguage(language) {
    document.documentElement.lang = language;
  },
  state() {
    const entry = this.entry();
    const resize = entry.panel.querySelector('.lia-schar-resize-handle');
    const points = Object.entries(window.__points?.languageBoard || {});
    return {
      courseLanguage: document.documentElement.lang,
      language: document.querySelector('[id^="schar-spec-"]').dataset.language,
      pointLanguages: this.pointUis().map(ui => ui.dataset.language),
      pointLabels: this.buttons().map(button => button.textContent.trim()),
      table: {
        language: this.tableRoot().dataset.language,
        inputs: this.tableInputs().map(input => input.value),
        buttons: Array.from(this.tableRoot().querySelectorAll('.lia-dyn-table-point-btn')).map(button => ({
          label: button.textContent.replace(/\s+/g,' ').trim(), title: button.title, disabled: button.disabled
        }))
      },
      plot: {
        language: this.plot().root.dataset.language,
        labels: [this.plot().btnPlot.textContent.trim(), this.plot().btnClear.textContent.trim()],
        inputAria: this.plot().input.getAttribute('aria-label'),
        placeholder: this.plot().input.placeholder,
        input: this.plot().input.value, message: this.plot().msg.textContent,
        hasGraph: !!this.plotState().graph, graphAtTwo: this.plotState().graph?.Y(2)
      },
      pointAria: this.buttons().map(button => button.getAttribute('aria-label')),
      termLabel: entry.termToggleWrapEl.textContent.trim(),
      termText: entry.termEl.textContent,
      termAria: entry.termToggleEl.getAttribute('aria-label'),
      minTitle: entry.minBtnEl.title,
      minAria: entry.minBtnEl.getAttribute('aria-label'),
      restoreTitle: entry.miniWrapEl.title,
      restoreAria: entry.miniWrapEl.getAttribute('aria-label'),
      resizeTitle: resize.title,
      resizeAria: resize.getAttribute('aria-label'),
      values: { ...entry.values },
      minimized: entry.panelMinimized,
      termVisible: entry.termVisible,
      panelScale: entry.panelScale,
      bbox: entry.board.getBoundingBox(),
      pointCount: points.length,
      coordinates: Object.fromEntries(points.map(([name, point]) => [name, [point.X(), point.Y()]])),
      identity: window.languageReferences ? {
        entry: entry === languageReferences.entry,
        board: entry.board === languageReferences.board,
        panel: entry.panel === languageReferences.panel,
        input: entry.slidersByParam.a === languageReferences.input,
        buttons: this.buttons().every((button, index) => button === languageReferences.buttons[index]),
        points: points.every(([name, point]) => point === languageReferences.points[name]),
        tableInputs: this.tableInputs().every((input,index) => input === languageReferences.tableInputs[index]),
        plotInput: this.plot().input === languageReferences.plotInput,
        plotGraph: this.plotState().graph === languageReferences.plotGraph
      } : null
    };
  }
};
