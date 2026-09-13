window.quizFixture = {
    anchors() { return Array.from(document.querySelectorAll('[data-lia-coordinate-quiz-anchor]')); },
    source(anchor) { const prefixes = { 'create-point': 'point-ui-', 'point-on-graph': 'graph-ui-', 'points-on-graph': 'multi-graph-ui-', 'reconstruction': 'rek-spec-', 'polygon-metric': 'polygon-metric-quiz-spec-', 'construction': 'construction-quiz-spec-', 'combined': 'combined-quiz-spec-' }; return document.getElementById(prefixes[anchor.dataset.liaCoordinateQuizKind] + anchor.dataset.liaCoordinateQuizUid); },
    quiz(anchor) { return Array.from(document.querySelectorAll('.lia-quiz')).find(q => q.dataset.liaCoordinateQuizUid === anchor.dataset.liaCoordinateQuizUid); },
    byBoard(id) { return this.anchors().find(a => this.source(a).dataset.spec.split(';')[0] === id); },
    center(element) { element.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = element.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; },
    async ready() { for (let i = 0; i < 300; i++) {
        if (this.anchors().length === 8 && this.anchors().every(a => this.quiz(a) && window.__boards?.[this.source(a)?.dataset.spec.split(';')[0]])) {
            await document.fonts.ready;
            await new Promise(r => setTimeout(r, 500));
            return;
        }
        await new Promise(r => setTimeout(r, 100));
    } throw Error('Quizzes did not initialize ' + this.anchors().length + ' ' + document.body.innerText.slice(0, 1000)); },
    snapshot(id) { const a = this.byBoard(id), q = this.quiz(a), b = window.__boards[id]; return { id, kind: a.dataset.liaCoordinateQuizKind, quizClass: q.className, buttons: Array.from(q.querySelectorAll('button')).map(e => ({ text: e.textContent.trim(), class: e.className, aria: e.getAttribute('aria-label'), visible: !!e.getBoundingClientRect().width, disabled: e.disabled })), hints: q.querySelector('.lia-quiz__hints')?.textContent, solution: q.querySelector('.lia-quiz__solution')?.textContent, text: q.innerText, points: Object.entries(window.__points?.[id] || {}).map(([name, p]) => ({ name, x: p.X(), y: p.Y(), fixed: p.visProp.fixed })), polygons: Object.values(b.objects).filter(o => o.__liaDgsPolygon).map(o => ({ id: o.id, vertices: o.vertices.map(p => [p.X(), p.Y()]) })), schars: Object.values(window.__scharEntries || {}).filter(e => e.boardId === id).map(e => ({ values: { ...e.values }, disabled: Object.values(e.slidersByParam).map(i => i.disabled) })) }; },
};
