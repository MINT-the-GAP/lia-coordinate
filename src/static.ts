// Lightweight entry point for courses that contain only static SVG boards.
// This bundle deliberately does not import any JSXGraph-dependent subsystem.

import { initStaticRenderer } from './static/staticSvg';

initStaticRenderer();
