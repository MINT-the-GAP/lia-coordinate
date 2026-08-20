// Lifecycle boundary used by the normal README macro. It chooses the native
// renderer before the JSXGraph web component is ever connected.

import { initializeCoordinateBoard } from './boardHelpers';
import { parseCoordSpec } from '../shared/coordSpec';
import { disposeCoordinateBoardsInContainer } from '../static/staticSvg';

export const COORDINATE_BOARD_ELEMENT = 'lia-coordinate-board';
export const DYNAMIC_COORDINATE_CHILD_ATTRIBUTE = 'data-lia-coordinate-dynamic';

/** Build the same queued initializer formerly embedded in @JSX.Graph. */
export function buildDynamicCoordinateBoardCode(spec: string): string {
  const serializedSpec = JSON.stringify(String(spec || ''));
  return '/* Keep this initializer on one line for DynFlex quiz compatibility. */ ' +
    '(function (run) { window.__coord ? run() : ' +
    '(window.__liaRunCoordHooks = window.__liaRunCoordHooks || []).push(run); })' +
    '(function () { window.__coord.initializeCoordinateBoard(jxgbox, ' +
    serializedSpec + '); });';
}

function styleCoordinateHost(host: HTMLElement): void {
  host.style.display = 'block';
  host.style.width = '100%';
  host.style.maxWidth = '100%';
  host.style.minWidth = '0';
  host.style.boxSizing = 'border-box';
}

/** Register the idempotent hybrid host used by the normal template import. */
export function initCoordinateBoardElement(): void {
  if (typeof window === 'undefined' || typeof HTMLElement === 'undefined') return;
  const elements = window.customElements;
  if (!elements || elements.get(COORDINATE_BOARD_ELEMENT)) return;

  class LiaCoordinateBoardElement extends HTMLElement {
    private mountRevision = 0;
    private dynamicChild: HTMLElement | null = null;

    static get observedAttributes(): string[] {
      return ['data-spec'];
    }

    connectedCallback(): void {
      this.mount();
    }

    disconnectedCallback(): void {
      this.mountRevision += 1;
      this.cleanup();
    }

    attributeChangedCallback(name: string, previous: string | null, next: string | null): void {
      if (name === 'data-spec' && previous !== next && this.isConnected) this.mount();
    }

    private cleanup(): void {
      // The registered board belongs to the inner jxgbox. Release it before
      // removing <jsx-graph>, whose own disconnect only frees its default board.
      disposeCoordinateBoardsInContainer(this);
      const children = Array.from(
        this.querySelectorAll<HTMLElement>('[' + DYNAMIC_COORDINATE_CHILD_ATTRIBUTE + ']')
      );
      children.forEach(function(child) { child.remove(); });
      this.dynamicChild = null;
    }

    private mount(): void {
      const revision = ++this.mountRevision;
      this.cleanup();
      styleCoordinateHost(this);
      const spec = String(this.getAttribute('data-spec') || '');
      const config = parseCoordSpec(spec);
      if (config.staticMode) {
        initializeCoordinateBoard(this, spec);
        return;
      }
      void this.mountDynamic(spec, revision);
    }

    private async mountDynamic(spec: string, revision: number): Promise<void> {
      const elements = window.customElements;
      if (!elements) return;
      // Always yield one microtask, even when JSXGraph is already registered.
      // During initial custom-element upgrade this lets every later static host
      // mount and claim its markers before a preceding dynamic host runs code.
      await elements.whenDefined('jsx-graph');
      if (
        revision !== this.mountRevision ||
        !this.isConnected ||
        String(this.getAttribute('data-spec') || '') !== spec
      ) return;

      const graph = this.ownerDocument.createElement('jsx-graph');
      graph.setAttribute(DYNAMIC_COORDINATE_CHILD_ATTRIBUTE, '');
      graph.style.display = 'block';
      graph.style.width = '100%';
      graph.style.maxWidth = '100%';
      graph.style.minWidth = '0';
      graph.style.boxSizing = 'border-box';
      graph.textContent = buildDynamicCoordinateBoardCode(spec);
      this.dynamicChild = graph;
      this.appendChild(graph);
    }
  }

  elements.define(COORDINATE_BOARD_ELEMENT, LiaCoordinateBoardElement);
}
