import { splitTopLevel, unquote } from './parser';
import { resolveUiLanguage } from './language';

/**
 * Return whether a clicked quiz control is LiaScript's native resolve button.
 *
 * Hint and resolve controls can be rendered next to each other. Their order is
 * configurable, so button indices and translated labels are not reliable.
 */
export function isQuizResolveButton(checkRoot: Element | null, target: Element | null): boolean {
  if (!checkRoot || !target || !checkRoot.contains(target)) return false;

  const resolveControl = typeof target.closest === 'function'
    ? target.closest('.lia-quiz__resolve')
    : null;

  return !!resolveControl && checkRoot.contains(resolveControl);
}

const QUIZ_ANCHOR = '[data-lia-coordinate-quiz-anchor]';
const QUIZ_SOURCE_PREFIXES: Record<string, string> = {
  'create-point': 'point-ui-',
  'polygon-metric': 'polygon-metric-quiz-spec-',
  construction: 'construction-quiz-spec-',
  construction3d: 'construction-quiz3d-spec-',
  combined: 'combined-quiz-spec-',
  reconstruction: 'rek-spec-',
  'point-on-graph': 'graph-ui-',
  'points-on-graph': 'multi-graph-ui-'
};
const QUIZ_SOURCE_SELECTOR = Object.values(QUIZ_SOURCE_PREFIXES)
  .map((prefix) => '[id^="' + prefix + '"]').join(',');
const QUIZ_LIFECYCLE_SELECTOR = QUIZ_ANCHOR + ',.lia-quiz,' + QUIZ_SOURCE_SELECTOR;
const QUIZ_TOKEN = 'lia-coordinate-check';
const QUIZ_STYLE_ID = 'lia-coordinate-quiz-style';
const quizBindings = new Map<HTMLElement, {
  quiz: HTMLElement;
  listener: EventListener;
}>();

function anchorUid(anchor: Element): string {
  return String((anchor as HTMLElement).dataset.liaCoordinateQuizUid || anchor.id || '');
}

function quizInside(node: Element | null): HTMLElement | null {
  if (!node) return null;
  if (node.classList.contains('lia-quiz')) return node as HTMLElement;
  return node.querySelector('.lia-quiz') as HTMLElement | null;
}

function findFollowingQuiz(anchor: Element): HTMLElement | null {
  let cursor: Element | null = anchor.closest('.lia-paragraph') || anchor;

  while (cursor) {
    let sibling = cursor.nextElementSibling;
    while (sibling) {
      const quiz = quizInside(sibling);
      if (quiz && !quiz.dataset.liaCoordinateQuizUid) return quiz;
      sibling = sibling.nextElementSibling;
    }
    cursor = cursor.parentElement;
  }

  return Array.from(document.querySelectorAll<HTMLElement>('.lia-quiz')).find((quiz) => {
    if (quiz.dataset.liaCoordinateQuizUid) return false;
    return !!(anchor.compareDocumentPosition(quiz) & Node.DOCUMENT_POSITION_FOLLOWING);
  }) || null;
}

/** Resolve the real LiaScript quiz rendered immediately after a hidden anchor. */
export function getCoordinateQuizRoot(anchor: Element | null): HTMLElement | null {
  if (!anchor) return null;
  const uid = anchorUid(anchor);
  const mapped = Array.from(document.querySelectorAll<HTMLElement>('.lia-quiz')).find(
    (quiz) => quiz.dataset.liaCoordinateQuizUid === uid
  );
  return mapped || findFollowingQuiz(anchor);
}

function checkAnchor(anchor: HTMLElement): boolean {
  const uid = anchorUid(anchor);
  const kind = String(anchor.dataset.liaCoordinateQuizKind || '');

  try {
    if (kind === 'create-point') {
      return !!window.__checkCreatePointQuiz?.(uid, '');
    }
    if (kind === 'polygon-metric') {
      return !!window.__checkPolygonMetricQuiz?.(
        uid,
        '',
        String(anchor.dataset.liaCoordinateQuizMetric || '')
      );
    }
    if (kind === 'construction') {
      return !!window.__checkConstructionQuiz?.(uid, '');
    }
    if (kind === 'construction3d') {
      return !!window.__checkConstructionQuiz3D?.(uid, '');
    }
    if (kind === 'combined') {
      return !!window.__checkCombinedQuiz?.(uid, '');
    }
    if (kind === 'reconstruction') {
      return !!window.__checkReconstructionQuiz?.(uid, '');
    }
    if (kind === 'point-on-graph') {
      return !!window.__checkPointGraphFromSpec?.(uid, '');
    }
    if (kind === 'points-on-graph') {
      return !!window.__checkPointsOnGraphFromSpec?.(uid, '');
    }
  } catch (e) {
    return false;
  }

  return false;
}

function setNativeQuizInput(anchor: HTMLElement, solved: boolean): boolean {
  const paragraph = anchor.closest('.lia-paragraph');
  const input = paragraph?.querySelector<HTMLInputElement>(
    '[data-lia-coordinate-quiz-input] input.lia-quiz__input'
  );
  if (!input) return false;
  input.value = solved ? QUIZ_TOKEN : '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function updateCoordinateQuizFeedback(
  anchor: HTMLElement,
  quiz: HTMLElement,
  solved: boolean
): void {
  const kind = String(anchor.dataset.liaCoordinateQuizKind || '');
  if (kind !== 'combined' && kind !== 'construction3d') return;
  const uid = anchorUid(anchor);
  const prefix = QUIZ_SOURCE_PREFIXES[kind];
  const source = prefix
    ? document.getElementById(prefix + uid) as HTMLElement | null
    : null;
  const message = kind === 'combined' && solved
    ? ''
    : String(source?.dataset.feedback || '');
  let feedback = quiz.querySelector<HTMLElement>('[data-lia-coordinate-quiz-feedback]');

  if (!message) {
    if (feedback) feedback.remove();
    return;
  }
  if (!feedback) {
    feedback = document.createElement('div');
    feedback.dataset.liaCoordinateQuizFeedback = uid;
    feedback.className = 'lia-coordinate-quiz-feedback';
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    quiz.appendChild(feedback);
  }
  feedback.dataset.status = String(source?.dataset.quizStatus || (solved ? 'correct' : 'incorrect'));
  if (feedback.textContent !== message) feedback.textContent = message;
}

function ensureConstructionQuiz3DActions(anchor: HTMLElement, quiz: HTMLElement): void {
  if (String(anchor.dataset.liaCoordinateQuizKind || '') !== 'construction3d') return;
  const uid = anchorUid(anchor);
  let actions = quiz.querySelector<HTMLElement>('[data-lia-coordinate-quiz-actions="' + uid + '"]');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'lia-coordinate-quiz-actions';
    actions.dataset.liaCoordinateQuizActions = uid;
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'lia-coordinate-quiz-reset';
    reset.dataset.liaCoordinateQuizReset = uid;
    const source = sourceMarkerForAnchor(anchor);
    const english = resolveUiLanguage(source, source?.dataset.language) === 'en';
    reset.textContent = english ? 'Reset' : 'Zurücksetzen';
    reset.setAttribute('aria-label', reset.textContent);
    actions.appendChild(reset);
    quiz.appendChild(actions);
  }
}
function sourceMarkerForAnchor(anchor: HTMLElement): HTMLElement | null {
  const uid = anchorUid(anchor);
  const kind = String(anchor.dataset.liaCoordinateQuizKind || '');
  const prefix = QUIZ_SOURCE_PREFIXES[kind];
  return prefix ? document.getElementById(prefix + uid) : null;
}

function sourceBoardId(source: HTMLElement | null): string {
  if (!source) return '';
  const raw = unquote(String(source.dataset.spec || source.textContent || '')).trim();
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      return String(parsed?.boardId || parsed?.board || '').trim();
    } catch (error) { return ''; }
  }
  return unquote(String(splitTopLevel(raw, ';')[0] || '')).trim();
}

function anchorTargetIsUnavailable(anchor: HTMLElement): boolean {
  const source = sourceMarkerForAnchor(anchor);
  if (!source || !source.isConnected) return true;
  if (source.hasAttribute('data-lia-static-claimed')) return true;
  const boardId = sourceBoardId(source);
  if (!boardId) return true;
  try {
    if (window.__coord?.isStaticCoordinateBoard?.(boardId)) return true;
  } catch (e) {}
  return !(window.__boards && window.__boards[boardId]);
}

function unbindAnchor(anchor: HTMLElement): void {
  const binding = quizBindings.get(anchor);
  const uid = anchorUid(anchor);
  if (binding) {
    try { binding.quiz.removeEventListener('click', binding.listener, true); } catch (e) {}
    if (binding.quiz.dataset.liaCoordinateQuizUid === uid) {
      delete binding.quiz.dataset.liaCoordinateQuizUid;
      delete binding.quiz.dataset.liaCoordinateCheckBound;
    }
    binding.quiz.querySelectorAll<HTMLElement>('[data-lia-coordinate-quiz-feedback]').forEach(
      (feedback) => feedback.remove()
    );
    binding.quiz.querySelectorAll<HTMLElement>('[data-lia-coordinate-quiz-actions]').forEach(
      (actions) => actions.remove()
    );
    quizBindings.delete(anchor);
  }
  delete anchor.dataset.liaCoordinateQuizBound;
}

function bindAnchor(anchor: HTMLElement): boolean {
  if (anchorTargetIsUnavailable(anchor)) {
    unbindAnchor(anchor);
    return false;
  }
  if (String(anchor.dataset.liaCoordinateQuizKind || '') === 'construction3d') {
    try { window.__setupConstructionQuiz3D?.(anchorUid(anchor), ''); } catch (error) {}
  }
  const quiz = getCoordinateQuizRoot(anchor);
  if (!quiz) return false;

  const existing = quizBindings.get(anchor);
  if (existing && existing.quiz === quiz) {
    updateCoordinateQuizFeedback(anchor, quiz, false);
    return true;
  }
  if (existing) unbindAnchor(anchor);
  quizBindings.forEach(function(binding, otherAnchor) {
    if (binding.quiz === quiz && otherAnchor !== anchor) unbindAnchor(otherAnchor);
  });

  const uid = anchorUid(anchor);
  quiz.dataset.liaCoordinateQuizUid = uid;
  anchor.dataset.liaCoordinateQuizBound = '1';

  const paragraph = anchor.closest('.lia-paragraph') as HTMLElement | null;
  if (paragraph) {
    paragraph.hidden = true;
    paragraph.setAttribute('aria-hidden', 'true');
  }

  quiz.dataset.liaCoordinateCheckBound = '1';
  ensureConstructionQuiz3DActions(anchor, quiz);
  const listener: EventListener = (event) => {
    if (anchorTargetIsUnavailable(anchor)) {
      unbindAnchor(anchor);
      return;
    }
    const target = event.target as Element | null;
    const resetButton = target?.closest('[data-lia-coordinate-quiz-reset]');
    if (resetButton && quiz.contains(resetButton)) {
      event.preventDefault();
      window.__resetConstructionQuiz3D?.(uid);
      setNativeQuizInput(anchor, false);
      updateCoordinateQuizFeedback(anchor, quiz, false);
      return;
    }
    const resolveButton = target?.closest('.lia-quiz__resolve');
    if (resolveButton && quiz.contains(resolveButton)) {
      const source = sourceMarkerForAnchor(anchor);
      if (source) delete source.dataset.feedback;
      quiz.querySelector<HTMLElement>('[data-lia-coordinate-quiz-feedback]')?.remove();
      return;
    }
    const checkButton = target?.closest('.lia-quiz__check');
    if (!checkButton || !quiz.contains(checkButton)) return;
    const solved = checkAnchor(anchor);
    setNativeQuizInput(anchor, solved);
    updateCoordinateQuizFeedback(anchor, quiz, solved);
  };
  quiz.addEventListener('click', listener, true);
  quizBindings.set(anchor, { quiz, listener });
  updateCoordinateQuizFeedback(anchor, quiz, false);
  return true;
}

/** Bind every coordinate quiz anchor to its native LiaScript text quiz. */
export function syncCoordinateQuizBindings(root: ParentNode = document): void {
  quizBindings.forEach(function(binding, anchor) {
    if (!anchor.isConnected || !binding.quiz.isConnected || anchorTargetIsUnavailable(anchor)) {
      unbindAnchor(anchor);
    }
  });
  root.querySelectorAll<HTMLElement>(QUIZ_ANCHOR).forEach(bindAnchor);
}

function containsQuizLifecycleNode(node: Node): boolean {
  if (node.nodeType !== 1) return false;
  const element = node as Element;
  return element.matches(QUIZ_LIFECYCLE_SELECTOR) ||
    !!element.querySelector(QUIZ_LIFECYCLE_SELECTOR);
}

function quizMutationIsRelevant(mutation: MutationRecord): boolean {
  const target = mutation.target as Element;
  if (mutation.type === 'attributes') {
    return target.nodeType === 1 && target.matches(QUIZ_ANCHOR + ',' + QUIZ_SOURCE_SELECTOR);
  }
  if (mutation.type !== 'childList') return false;
  // A source marker can store its spec as textContent instead of data-spec.
  if (target.nodeType === 1 && target.matches(QUIZ_SOURCE_SELECTOR)) return true;
  return Array.from(mutation.addedNodes).some(containsQuizLifecycleNode) ||
    Array.from(mutation.removedNodes).some(containsQuizLifecycleNode);
}

/** Install native quiz validation and keep it attached across LiaScript rerenders. */
export function initQuizDom(): void {
  window.__syncCoordinateQuizBindings = function() {
    syncCoordinateQuizBindings();
  };
  if (!document.getElementById(QUIZ_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = QUIZ_STYLE_ID;
    style.textContent = `
.lia-paragraph:has(> ${QUIZ_ANCHOR}) {
  display: none !important;
}
.lia-coordinate-quiz-feedback {
  margin-top: 0.75rem;
  padding: 0.7rem 0.85rem;
  border-inline-start: 0.25rem solid currentColor;
  border-radius: 0.25rem;
  line-height: 1.45;
}
.lia-coordinate-quiz-feedback[data-status="correct"] { color: #18794e; }
.lia-coordinate-quiz-feedback[data-status="partial"] { color: #9a6700; }
.lia-coordinate-quiz-feedback[data-status="incorrect"] { color: #b42318; }
.lia-coordinate-quiz-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.lia-coordinate-quiz-reset {
  min-height: 2.5rem;
  padding: 0.45rem 0.8rem;
  border: 0.125rem solid currentColor;
  border-radius: 0.35rem;
  color: inherit;
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.lia-coordinate-quiz-reset:focus-visible {
  outline: 0.2rem solid #168c96;
  outline-offset: 0.15rem;
}
@media (max-width: 36rem) {
  .lia-coordinate-quiz-actions,
  .lia-coordinate-quiz-reset { width: 100%; }
}
`;
    (document.head || document.documentElement).appendChild(style);
  }

  syncCoordinateQuizBindings();

  const observerKey = '__liaCoordinateQuizObserver';
  const state = window as any;
  if (state[observerKey] || !document.documentElement) return;

  const feedbackListenerKey = '__liaCoordinateQuizFeedbackListener';
  if (!state[feedbackListenerKey] && typeof document.addEventListener === 'function') {
    const feedbackListener = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const uid = String(detail.uid || '');
      const kind = String(detail.kind || '');
      if (!uid || !kind) return;
      const escapedUid = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(uid)
        : uid.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
      const anchor = document.querySelector<HTMLElement>(
        QUIZ_ANCHOR + '[data-lia-coordinate-quiz-kind="' + kind + '"]' +
        '[data-lia-coordinate-quiz-uid="' + escapedUid + '"]'
      );
      if (!anchor) return;
      const quiz = getCoordinateQuizRoot(anchor);
      if (!quiz) return;
      const source = sourceMarkerForAnchor(anchor) as HTMLElement | null;
      const solved = source?.dataset.quizStatus === 'correct';
      updateCoordinateQuizFeedback(anchor, quiz, solved);
    };
    document.addEventListener('lia-coordinate-quiz-feedback', feedbackListener);
    state[feedbackListenerKey] = feedbackListener;
  }
  const observer = new MutationObserver((mutations) => {
    if (mutations.some(quizMutationIsRelevant)) syncCoordinateQuizBindings();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-lia-static-claimed', 'data-spec']
  });
  state[observerKey] = observer;
}
