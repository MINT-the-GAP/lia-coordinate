// Entry point: initializes all subsystems in order.

import { init as initAxisTitle } from './subsystems/axisTitle';
import { init as initCreatePoint } from './subsystems/createPoint';
import { init as initPlotFunction } from './subsystems/plotFunction';
import { init as initPlotInput } from './subsystems/plotInput';
import { init as initPointOnGraph } from './subsystems/pointOnGraph';
import { init as initPointsOnGraph } from './subsystems/pointsOnGraph';
import { init as initTable } from './subsystems/table';

// Run any pending coord hooks registered by the @CoordinateSystem macro.
if (window.__liaRunCoordHooks) {
  window.__liaRunCoordHooks();
  requestAnimationFrame(() => {
    if (window.__liaRunCoordHooks) window.__liaRunCoordHooks();
  });
  setTimeout(() => {
    if (window.__liaRunCoordHooks) window.__liaRunCoordHooks();
  }, 0);
  setTimeout(() => {
    if (window.__liaRunCoordHooks) window.__liaRunCoordHooks();
  }, 120);
}

initAxisTitle();
initCreatePoint();
initPlotFunction();
initPlotInput();
initPointOnGraph();
initPointsOnGraph();
initTable();
