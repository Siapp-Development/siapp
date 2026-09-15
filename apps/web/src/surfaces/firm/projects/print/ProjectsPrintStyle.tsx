/**
 * Static print stylesheet for the Projects page (#166), generalized from the
 * Timeline pattern. Rendered once by `ProjectsListPage`. It isolates
 * `#projects-print-root` (everything else is hidden), applies the scale-to-fit
 * transform via `--projects-print-scale`, and forces exact colours so the task
 * status rings and timeline bars print. The `@page` rule is a static string
 * literal chosen from the `orientation` prop (portrait for List; landscape for
 * Table/Timeline).
 */

import { PROJECTS_PRINT_ROOT_ID, type TPrintOrientation } from './printView.ts';

const LANDSCAPE_PAGE = '@page { size: landscape; margin: 8mm; }';
const PORTRAIT_PAGE = '@page { size: portrait; margin: 12mm; }';

// Reveal only the print root and generalize the Timeline's isolation rules to
// any wide, horizontally-scrolling view living inside the root.
const REVEAL_BLOCK =
  '@media print {\n' +
  '  body * { visibility: hidden !important; }\n' +
  `  #${PROJECTS_PRINT_ROOT_ID}, #${PROJECTS_PRINT_ROOT_ID} * { visibility: visible !important; }\n` +
  `  #${PROJECTS_PRINT_ROOT_ID} {\n` +
  '    position: absolute !important; left: 0; top: 0;\n' +
  '    width: auto !important; max-width: none !important; overflow: visible !important;\n' +
  '    border: none !important; border-radius: 0 !important;\n' +
  '    transform: scale(var(--projects-print-scale, 1)); transform-origin: top left;\n' +
  '  }\n' +
  `  #${PROJECTS_PRINT_ROOT_ID} [data-print-region] { overflow: visible !important; max-width: none !important; }\n` +
  `  #${PROJECTS_PRINT_ROOT_ID} .timeline-track { min-width: 0 !important; }\n` +
  `  #${PROJECTS_PRINT_ROOT_ID} .timeline-label-col { position: static !important; }\n` +
  `  #${PROJECTS_PRINT_ROOT_ID} * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }\n` +
  '}';

interface IProjectsPrintStyleProps {
  orientation: TPrintOrientation;
}

export function ProjectsPrintStyle({ orientation }: IProjectsPrintStyleProps) {
  const page = orientation === 'landscape' ? LANDSCAPE_PAGE : PORTRAIT_PAGE;
  return <style media="print">{`${page}\n${REVEAL_BLOCK}`}</style>;
}
