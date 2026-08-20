import { splitTopLevel, unquote } from './parser';

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
  if (String(anchor.dataset.liaCoordinateQuizKind || '') !== 'combined') return;
  const uid = anchorUid(anchor);
  const source = document.getElementById('combined-quiz-spec-' + uid) as HTMLElement | null;
  const message = solved ? '' : String(source?.dataset.feedback || '');
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
  if (feedback.textContent !== message) feedback.textContent = message;
}

function sourceMarkerForAnchor(anchor: HTMLElement): HTMLElement | null {
  const uid = anchorUid(anchor);
  const kind = String(anchor.dataset.liaCoordinateQuizKind || '');
  const prefixes: Record<string, string> = {
    'create-point': 'point-ui-',
    'polygon-metric': 'polygon-metric-quiz-spec-',
    construction: 'construction-quiz-spec-',
    combined: 'combined-quiz-spec-',
    reconstruction: 'rek-spec-',
    'point-on-graph': 'graph-ui-',
    'points-on-graph': 'multi-graph-ui-'
  };
  const prefix = prefixes[kind];
  return prefix ? document.getElementById(prefix + uid) : null;
}

function sourceBoardId(source: HTMLElement | null): string {
  if (!source) return '';
  const raw = String(source.dataset.spec || source.textContent || '');
  return unquote(String(splitTopLevel(unquote(raw), ';')[0] || '')).trim();
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
    quizBindings.delete(anchor);
  }
  delete anchor.dataset.liaCoordinateQuizBound;
}

function bindAnchor(anchor: HTMLElement): boolean {
  if (anchorTargetIsUnavailable(anchor)) {
    unbindAnchor(anchor);
    return false;
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
  const listener: EventListener = (event) => {
    if (anchorTargetIsUnavailable(anchor)) {
      unbindAnchor(anchor);
      return;
    }
    const target = event.target as Element | null;
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
`;
    (document.head || document.documentElement).appendChild(style);
  }

  syncCoordinateQuizBindings();

  const observerKey = '__liaCoordinateQuizObserver';
  const state = window as any;
  if (state[observerKey] || !document.documentElement) return;

  const observer = new MutationObserver(() => syncCoordinateQuizBindings());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-lia-static-claimed', 'data-spec']
  });
  state[observerKey] = observer;
}
