// Shared bootstrap scheduler used by all subsystems.
// Deduplicates the RAF + two-setTimeout pattern repeated 8 times.

/**
 * Kick `fn` now and schedule it again at ~80 ms and ~220 ms via RAF + setTimeout.
 * This matches the pattern used in every subsystem to retry bootstrap after DOM settles.
 */
export function scheduleBootstrap(fn: () => void): void {
  const run = function(): void {
    try { fn(); } catch (e) {}
    try {
      if (window.__scheduleMacroCodeOrderLayers) {
        window.__scheduleMacroCodeOrderLayers();
      }
    } catch (e) {}
  };

  run();

  requestAnimationFrame(run);

  setTimeout(run, 80);
  setTimeout(run, 220);
}
