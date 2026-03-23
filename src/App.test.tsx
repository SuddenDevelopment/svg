import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as opentype from 'opentype.js';
import App from './App';
import { EMPTY_SVG_TEMPLATE } from './lib/svg-source';

function openWorkspaceSection(name: 'File' | 'Repair' | 'Export') {
  fireEvent.click(screen.getByRole('button', { name }));
}

function setElementSize(
  element: Element,
  size: Partial<Record<'clientWidth' | 'scrollWidth' | 'clientHeight' | 'scrollHeight', number>>,
) {
  Object.entries(size).forEach(([key, value]) => {
    Object.defineProperty(element, key, {
      configurable: true,
      value,
    });
  });
}

function createFontArrayBuffer(familyName = 'Uploaded Workbench') {
  const path = new opentype.Path();
  path.moveTo(0, 0);
  path.lineTo(500, 0);
  path.lineTo(500, 700);
  path.lineTo(0, 700);
  path.close();

  const font = new opentype.Font({
    familyName,
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: [
      new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
      new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 320, path: new opentype.Path() }),
      new opentype.Glyph({ name: 'A', unicode: 65, advanceWidth: 700, path }),
    ],
  });

  return font.toArrayBuffer();
}

function createEmbeddedFontDataUrl() {
  const path = new opentype.Path();
  path.moveTo(0, 0);
  path.lineTo(500, 0);
  path.lineTo(500, 700);
  path.lineTo(0, 700);
  path.close();

  const font = new opentype.Font({
    familyName: 'Workbench Font',
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: [
      new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
      new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 320, path: new opentype.Path() }),
      new opentype.Glyph({ name: 'A', unicode: 65, advanceWidth: 700, path }),
    ],
  });

  const bytes = new Uint8Array(font.toArrayBuffer());
  const binary = Array.from(bytes, (value) => String.fromCharCode(value)).join('');
  return `data:font/ttf;base64,${btoa(binary)}`;
}

describe('App', () => {
  it('renders initial sample analysis', () => {
    render(<App />);

    expect(screen.getAllByText('sample.svg').length).toBeGreaterThan(0);
    expect(screen.getByText('Document stats')).toBeInTheDocument();
    expect(screen.getByText('Featured tags')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inspect' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Warnings' }));

    expect(screen.getByText('Text elements found. Geometry-only exports may need text-to-path conversion.')).toBeInTheDocument();
  });

  it('wires the inspection controls as accessible tabs with keyboard navigation', () => {
    render(<App />);

    const overviewTab = screen.getByRole('tab', { name: 'Overview' });
    const warningsTab = screen.getByRole('tab', { name: 'Warnings' });
    const selectionTab = screen.getByRole('tab', { name: 'Selection' });
    const inspectorPanel = screen.getByRole('tabpanel', { name: 'Overview' });

    expect(overviewTab).toHaveAttribute('aria-controls', inspectorPanel.id);
    expect(warningsTab).toHaveAttribute('tabindex', '-1');
    expect(inspectorPanel).toHaveAttribute('aria-labelledby', overviewTab.id);

    overviewTab.focus();
    fireEvent.keyDown(overviewTab, { key: 'ArrowRight' });

    expect(warningsTab).toHaveFocus();
    expect(warningsTab).toHaveAttribute('aria-selected', 'true');
    expect(inspectorPanel).toHaveAttribute('aria-labelledby', warningsTab.id);

    fireEvent.keyDown(warningsTab, { key: 'End' });

    expect(selectionTab).toHaveFocus();
    expect(selectionTab).toHaveAttribute('aria-selected', 'true');
    expect(inspectorPanel).toHaveAttribute('aria-labelledby', selectionTab.id);
  });

  it('wires the preview mode switch as accessible tabs with keyboard navigation', () => {
    render(<App />);

    const previewTablist = screen.getByRole('tablist', { name: 'Preview modes' });
    const previewTab = within(previewTablist).getByRole('tab', { name: 'Preview' });
    const markupTab = within(previewTablist).getByRole('tab', { name: 'Markup' });
    const previewPanel = screen.getByRole('tabpanel', { name: 'Preview' });

    expect(previewTab).toHaveAttribute('aria-controls', previewPanel.id);
    expect(markupTab).toHaveAttribute('tabindex', '-1');
    expect(previewPanel).toHaveAttribute('aria-labelledby', previewTab.id);

    previewTab.focus();
    fireEvent.keyDown(previewTab, { key: 'ArrowRight' });

    expect(markupTab).toHaveFocus();
    expect(markupTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Markup' })).toBeInTheDocument();
    expect(screen.getByText('sample.svg')).toBeInTheDocument();
  });

  it('shows blocked export readiness details for text-based SVGs', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="10">Hello</text></svg>',
      },
    });

    openWorkspaceSection('Export');

    await waitFor(() => {
      expect(screen.getAllByText('Blocked', { selector: '.readiness-badge' }).length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('1 text element still need conversion support or embedded fonts for geometry-only export.').length).toBeGreaterThan(0);
  });

  it('shows runtime, defs, and authoring inventory cards in inspect overview', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" baseProfile="tiny">
          <metadata />
          <defs><linearGradient id="g"><stop offset="0%" stop-color="#fff" /></linearGradient></defs>
          <style>.shape { fill: url(#g); }</style>
          <a href="https://example.com/asset"><rect inkscape:label="Layer 1" class="shape" width="10" height="10" /></a>
        </svg>`,
      },
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));

    await waitFor(() => {
      expect(screen.getByText('Runtime features')).toBeInTheDocument();
    });

    expect(screen.getByText('Defs and references')).toBeInTheDocument();
    expect(screen.getByText('Authoring metadata')).toBeInTheDocument();
    expect(screen.getByText('tiny')).toBeInTheDocument();
    expect(screen.getByText('inkscape')).toBeInTheDocument();
  });

  it('shows runtime-specific export guidance for media-bearing svg tiny files', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: readFileSync('tests/SVG/video1.svg', 'utf8'),
      },
    });

    openWorkspaceSection('Export');

    await waitFor(() => {
      expect(screen.getByText('Export guidance')).toBeInTheDocument();
    });

    const exportGuidanceSection = screen.getByText('Export guidance').closest('section');
    expect(exportGuidanceSection?.textContent).toContain('Keep a browser/runtime SVG profile if you need embedded media playback');
    expect(exportGuidanceSection?.textContent).toContain('Native SVG animation is preserved best in self-contained browser SVG output');
    expect(screen.getByText(/1 media element still depend on SVG Tiny or browser playback support/)).toBeInTheDocument();
  });

  it('shows separate workflow readiness scorecards for geometry-safe and browser/runtime svg', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: `<svg xmlns="http://www.w3.org/2000/svg" baseProfile="tiny">
          <video href="movie.mp4" width="10" height="10" />
          <animate attributeName="x" from="0" to="10" dur="1s" repeatCount="indefinite" />
          <use href="#missing" />
        </svg>`,
      },
    });

    openWorkspaceSection('Export');

    await waitFor(() => {
      expect(screen.getByText('Workflow scorecards')).toBeInTheDocument();
    });

    expect(screen.getByText('Geometry-safe export')).toBeInTheDocument();
    expect(screen.getByText('Browser/runtime SVG')).toBeInTheDocument();
    const workflowSection = screen.getByText('Workflow scorecards').closest('section');
    expect(workflowSection?.textContent).toContain('This file is suitable for browser/runtime SVG after cleaning the remaining broken, chained, or external dependency refs.');
    expect(screen.getByText(/media element can be preserved in a browser\/runtime SVG profile/)).toBeInTheDocument();
  });

  it('marks constrained inspection containers to wrap instead of overflowing', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: `<svg xmlns="http://www.w3.org/2000/svg" baseProfile="tiny">
          <video href="movie.mp4" width="10" height="10" />
          <animate attributeName="x" from="0" to="10" dur="1s" repeatCount="indefinite" />
          <use href="#missing" />
        </svg>`,
      },
    });

    openWorkspaceSection('Export');

    await waitFor(() => {
      expect(screen.getByText('Workflow scorecards')).toBeInTheDocument();
    });

    const inspectionTabs = screen.getByRole('tablist', { name: 'Inspection sections' });
    const workflowSection = screen.getByText('Workflow scorecards').closest('section');
    const exportReadinessSection = screen.getByText('Export readiness').closest('section');
    const scorecards = workflowSection?.querySelector('.readiness-scorecards');
    const scorecardHeaders = workflowSection?.querySelectorAll('.readiness-scorecard .readiness-header');
    const metricsGrid = exportReadinessSection?.querySelector('.metrics-grid');
    const blockingRow = screen.getByText(/media element can be preserved in a browser\/runtime SVG profile/).closest('li');

    expect(scorecards).not.toBeNull();
    expect(scorecardHeaders?.length).toBeGreaterThan(0);
    expect(metricsGrid).not.toBeNull();
    expect(blockingRow).not.toBeNull();

    setElementSize(inspectionTabs, { clientWidth: 220, scrollWidth: 380 });
    setElementSize(scorecards as Element, { clientWidth: 300, scrollWidth: 300 });
    Array.from((scorecards as Element).children).forEach((card) => {
      setElementSize(card, { clientWidth: 136, scrollWidth: 228 });
    });
    Array.from(scorecardHeaders ?? []).forEach((header) => {
      setElementSize(header, { clientWidth: 136, scrollWidth: 214 });
    });
    setElementSize(metricsGrid as Element, { clientWidth: 300, scrollWidth: 300 });
    Array.from((metricsGrid as Element).children).forEach((metric) => {
      setElementSize(metric, { clientWidth: 136, scrollWidth: 184 });
    });
    setElementSize(blockingRow as Element, { clientWidth: 190, scrollWidth: 320 });

    fireEvent(window, new Event('resize'));

    await waitFor(() => {
      expect(inspectionTabs).toHaveAttribute('data-fit-state', 'wrap');
      expect(scorecards).toHaveAttribute('data-fit-state', 'wrap');
      expect(metricsGrid).toHaveAttribute('data-fit-state', 'wrap');
      expect(blockingRow).toHaveAttribute('data-fit-state', 'wrap');
    });

    scorecardHeaders?.forEach((header) => {
      expect(header).toHaveAttribute('data-fit-state', 'wrap');
    });
  });

  it('strips authoring metadata from the repair panel', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd">
          <metadata />
          <sodipodi:namedview inkscape:current-layer="layer1" />
          <rect inkscape:label="Layer 1" width="10" height="10" />
        </svg>`,
      },
    });

    openWorkspaceSection('Repair');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Strip 4 authoring metadata items' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Strip 4 authoring metadata items' }));

    await waitFor(() => {
      expect(screen.getByText(/Removed \d+ authoring metadata items from the SVG\./)).toBeInTheDocument();
    });

    openWorkspaceSection('File');

    const sourceEditor = screen.getByLabelText('SVG source') as HTMLTextAreaElement;
    expect(sourceEditor.value).not.toContain('inkscape:');
    expect(sourceEditor.value).not.toContain('sodipodi:');
    expect(sourceEditor.value).not.toContain('<metadata');
  });

  it('shows parse error feedback when the source is invalid', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: { value: '<svg><g></svg>' },
    });

    await waitFor(() => {
      expect(screen.getAllByText('Parse error').length).toBeGreaterThan(0);
    });
    expect(screen.getByRole('button', { name: 'Optimize' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Prettify' })).toBeDisabled();
  });

  it('shows editor cursor location and document metrics while editing source', () => {
    render(<App />);

    const sourceEditor = screen.getByLabelText('SVG source') as HTMLTextAreaElement;
    const nextValue = '<svg>\n  <g>\n    <rect />\n  </g>\n</svg>';
    fireEvent.change(sourceEditor, {
      target: {
        value: nextValue,
      },
    });
    fireEvent.select(sourceEditor, {
      target: {
        selectionStart: 18,
        selectionEnd: 18,
      },
    });

    expect(screen.getByText(/Line \d+, Col \d+/)).toBeInTheDocument();
    expect(screen.getByText('5 lines')).toBeInTheDocument();
    expect(screen.getByText(`${nextValue.length} characters`)).toBeInTheDocument();
  });

  it('provides optimize, prettify, and clear source actions in the file editor', async () => {
    render(<App />);

    const sourceEditor = screen.getByLabelText('SVG source') as HTMLTextAreaElement;
    fireEvent.change(sourceEditor, {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><g><rect width="10" height="10" /></g></svg>',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Prettify' }));

    await waitFor(() => {
      expect(screen.getByText('Prettified SVG source.')).toBeInTheDocument();
    });
    expect(sourceEditor.value).toContain('\n  <g>\n');

    fireEvent.click(screen.getByRole('button', { name: 'Optimize' }));

    await waitFor(() => {
      expect(screen.getByText('Optimized SVG source.')).toBeInTheDocument();
    });
    expect(sourceEditor.value).not.toContain('\n');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => {
      expect(screen.getByText('Cleared the source editor to a blank SVG template.')).toBeInTheDocument();
    });
    expect(sourceEditor.value).toBe(EMPTY_SVG_TEMPLATE);
  });

  it('switches the inspection area to the clicked preview element', async () => {
    const { container } = render(<App />);

    const previewSurface = screen.getByLabelText('SVG preview area');
    const previewText = container.querySelector('.svg-preview-frame svg text');
    expect(previewText).not.toBeNull();

    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    const elementFromPoint = vi.fn(() => previewText);

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    });

    fireEvent.pointerDown(previewSurface, {
      button: 0,
      pointerId: 1,
      clientX: 24,
      clientY: 18,
    });
    fireEvent.pointerUp(previewSurface, {
      button: 0,
      pointerId: 1,
      clientX: 24,
      clientY: 18,
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Selected element' })).toBeInTheDocument();
    });

    expect(screen.getByText('text', { selector: '.selection-tag' })).toBeInTheDocument();
    expect(screen.getByText('SVG Workbench sample', { selector: '.selection-copy' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Selection' })).toHaveAttribute('aria-selected', 'true');

    if (originalElementFromPoint) {
      Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
    } else {
      Reflect.deleteProperty(document, 'elementFromPoint');
    }
  });

  it('highlights risky preview nodes when hovering a risk entry', async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: 'Warnings' }));

    const riskEntry = screen.getByText('Text elements found. Geometry-only exports may need text-to-path conversion.').closest('li');
    expect(riskEntry).not.toBeNull();

    fireEvent.mouseEnter(riskEntry!);
    await waitFor(() => {
      expect(container.querySelectorAll('.svg-preview-frame [data-svg-node-hovered="true"]').length).toBeGreaterThan(0);
    });

    fireEvent.mouseLeave(riskEntry!);
    await waitFor(() => {
      expect(container.querySelectorAll('.svg-preview-frame [data-svg-node-hovered="true"]').length).toBe(0);
    });
  });

  it('supports preview pan and zoom controls for detailed artwork', () => {
    render(<App />);

    const viewport = screen.getByLabelText('Preview viewport');
    expect(viewport).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' });
    expect(screen.getByText('100%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pan right' }));

    expect(screen.getByText('125%')).toBeInTheDocument();
    expect(viewport).toHaveStyle({ transform: 'translate(36px, 0px) scale(1.25)' });

    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(viewport).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' });
  });

  it('wires the export preset selector as accessible tabs with keyboard navigation', async () => {
    render(<App />);

    openWorkspaceSection('Export');

    const presetTablist = screen.getByRole('tablist', { name: 'Export presets' });
    const safeTab = within(presetTablist).getByRole('tab', { name: /Geometry-safe/ });
    const currentTab = within(presetTablist).getByRole('tab', { name: /Current/ });
    const presetPanel = screen.getByRole('tabpanel', { name: /Geometry-safe/ });

    expect(safeTab).toHaveAttribute('aria-controls', presetPanel.id);
    expect(currentTab).toHaveAttribute('tabindex', '-1');
    expect(presetPanel).toHaveAttribute('aria-labelledby', safeTab.id);

    safeTab.focus();
    fireEvent.keyDown(safeTab, { key: 'Home' });

    expect(currentTab).toHaveFocus();
    expect(currentTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: /Current/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download current SVG' })).toBeInTheDocument();
  });

  it('groups page-level download and share actions in the top bar', async () => {
    const writeText = vi.fn(async () => undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    try {
      render(<App />);

      const workflowBar = screen.getByRole('toolbar', { name: 'Page actions' });
      expect(workflowBar).toBeInTheDocument();
      expect(screen.queryByText('Upload')).not.toBeInTheDocument();
      expect(screen.getByText('Download')).toBeInTheDocument();
      expect(screen.getByText('Share')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Download'));
      fireEvent.click(within(screen.getByRole('group', { name: 'Download actions' })).getByRole('button', { name: 'Geometry-safe' }));
      openWorkspaceSection('Export');

      await waitFor(() => {
        expect(screen.getByText('Last export')).toBeInTheDocument();
      });
      const exportReport = screen.getByText('Last export').closest('.export-report');
      expect(exportReport?.textContent).toContain('Geometry-safe SVG');

      openWorkspaceSection('File');
      fireEvent.click(screen.getByText('Share'));
  fireEvent.click(within(screen.getByRole('group', { name: 'Share actions' })).getByRole('button', { name: 'Current' }));

      openWorkspaceSection('Export');

      await waitFor(() => {
        expect(screen.getByText('Last copy')).toBeInTheDocument();
      });
      const copyReport = screen.getByText('Last copy').closest('.export-report');
      expect(copyReport?.textContent).toContain('Current');
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', originalClipboard);
      }
    }
  });

  it('keeps overview, warnings, and selection tabs available in the inspection panel for repair and export', async () => {
    render(<App />);

    openWorkspaceSection('Repair');

    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Warnings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Selection' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Workflow scorecards')).toBeInTheDocument();
    });

    openWorkspaceSection('Export');

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Warnings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Selection' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Readiness' })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Export readiness')).toBeInTheDocument();
    });
  });

  it('applies shape normalization from the repair panel', async () => {
    const { container } = render(<App />);
    openWorkspaceSection('Repair');

    fireEvent.click(screen.getByRole('button', { name: 'Convert 2 shape primitives to paths' }));

    await waitFor(() => {
      expect(screen.getByText('Converted 2 shape primitives into path elements.')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Recently changed preview nodes')).toBeInTheDocument();
    expect(container.querySelectorAll('.svg-preview-frame [data-svg-node-changed="true"]').length).toBeGreaterThan(0);
  });

  it('outlines supported stroke-driven geometry from the repair panel', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="10" y2="0" stroke="red" stroke-width="4" fill="none" /></svg>',
      },
    });

    openWorkspaceSection('Repair');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Outline 1 stroke-driven nodes' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Outline 1 stroke-driven nodes' }));

    await waitFor(() => {
      expect(screen.getByText('Outlined 1 stroke-driven node into filled geometry.')).toBeInTheDocument();
    });

    openWorkspaceSection('File');

    const sourceEditor = screen.getByLabelText('SVG source') as HTMLTextAreaElement;
    expect(sourceEditor.value).toContain('<path');
    expect(sourceEditor.value).not.toContain('stroke=');
  });

  it('cleans near-open, duplicate, and tiny paths from the repair panel', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: `<svg xmlns="http://www.w3.org/2000/svg">
          <path d="M0 0L10 0L0 0.1" fill="none" stroke="#000" />
          <path d="M20 20L30 20" stroke="#000" />
          <path d="M20 20L30 20" stroke="#000" />
          <path d="M40 40" />
        </svg>`,
      },
    });

    openWorkspaceSection('Repair');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Clean 3 paths' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clean 3 paths' }));

    await waitFor(() => {
      expect(screen.getByText('Cleaned 3 paths by closing near-open paths, joining fragments, repairing polygon winding, stabilizing self-intersections, or removing duplicate and tiny geometry.')).toBeInTheDocument();
    });

    openWorkspaceSection('File');

    const sourceEditor = screen.getByLabelText('SVG source') as HTMLTextAreaElement;
    expect((sourceEditor.value.match(/<path/g) ?? []).length).toBe(2);
    expect(sourceEditor.value).toMatch(/0\.1[zZ]/);
  });

  it('cleans broken local refs and non-link external dependency refs from the repair panel', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: `<svg xmlns="http://www.w3.org/2000/svg">
          <defs><linearGradient id="g" xlink:href="#missing" xmlns:xlink="http://www.w3.org/1999/xlink" /></defs>
          <use href="#missing" />
          <image href="https://example.com/asset.png" width="10" height="10" />
          <a href="https://example.com/page"><rect width="10" height="10" /></a>
        </svg>`,
      },
    });

    openWorkspaceSection('Repair');

    const repairSection = screen.getByText('Safe normalization').closest('section');
    const getReferenceCleanupButton = () => Array.from(repairSection?.querySelectorAll('button') ?? []).find((button) => button.textContent?.includes('broken/external refs')) as HTMLButtonElement | undefined;

    await waitFor(() => {
      expect(getReferenceCleanupButton()).toBeEnabled();
    });

    fireEvent.click(getReferenceCleanupButton()!);

    await waitFor(() => {
      expect(screen.getByText('Cleaned 3 broken, chained, or external dependency references from the SVG.')).toBeInTheDocument();
    });

    openWorkspaceSection('File');

    const sourceEditor = screen.getByLabelText('SVG source') as HTMLTextAreaElement;
    expect(sourceEditor.value).not.toContain('<use');
    expect(sourceEditor.value).not.toContain('<image');
    expect(sourceEditor.value).not.toContain('xlink:href="#missing"');
    expect(sourceEditor.value).toContain('<a href="https://example.com/page">');
  });

  it('cleans invalid chained href targets from the repair panel', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: `<svg xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="g" xlink:href="#missing" xmlns:xlink="http://www.w3.org/1999/xlink" />
            <linearGradient id="g-chain" xlink:href="#g" xmlns:xlink="http://www.w3.org/1999/xlink" />
          </defs>
          <use href="#g-chain" />
        </svg>`,
      },
    });

    openWorkspaceSection('Repair');

    const repairSection = screen.getByText('Safe normalization').closest('section');
    const getReferenceCleanupButton = () => Array.from(repairSection?.querySelectorAll('button') ?? []).find((button) => button.textContent?.includes('broken/external refs')) as HTMLButtonElement | undefined;

    await waitFor(() => {
      expect(getReferenceCleanupButton()).toBeEnabled();
    });

    fireEvent.click(getReferenceCleanupButton()!);

    await waitFor(() => {
      expect(screen.getByText('Cleaned 3 broken, chained, or external dependency references from the SVG.')).toBeInTheDocument();
    });

    openWorkspaceSection('File');

    const sourceEditor = screen.getByLabelText('SVG source') as HTMLTextAreaElement;
    expect(sourceEditor.value).not.toContain('<use');
    expect(sourceEditor.value).not.toContain('xlink:href="#missing"');
    expect(sourceEditor.value).not.toContain('xlink:href="#g"');
  });

  it('applies container transform baking from the repair panel', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(5 7)"><rect x="0" y="0" width="10" height="10" /></g></svg>',
      },
    });

    openWorkspaceSection('Repair');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Bake 1 container transforms' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Bake 1 container transforms' }));

    await waitFor(() => {
      expect(screen.getByText('Baked 1 container transform into descendant geometry.')).toBeInTheDocument();
    });
  });

  it('expands use references from the repair panel', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><defs><rect id="shape" width="10" height="10" /></defs><use href="#shape" x="5" y="7" /></svg>',
      },
    });

    openWorkspaceSection('Repair');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Expand 1 use references' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Expand 1 use references' }));

    await waitFor(() => {
      expect(screen.getByText('Expanded 1 <use> reference into concrete geometry.')).toBeInTheDocument();
    });
  });

  it('inlines simple style rules from the repair panel', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><style>.shape { fill: red; }</style><rect class="shape" width="10" height="10" /></svg>',
      },
    });

    openWorkspaceSection('Repair');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Inline 1 simple style rules' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Inline 1 simple style rules' }));

    await waitFor(() => {
      expect(screen.getByText('Inlined 1 simple style rule into element styles.')).toBeInTheDocument();
    });
  });

  it('converts embedded-font text from the repair panel', async () => {
    const fontDataUrl = createEmbeddedFontDataUrl();
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: `<svg xmlns="http://www.w3.org/2000/svg"><style>@font-face { font-family: 'Workbench Font'; src: url(${fontDataUrl}); }</style><text font-family="Workbench Font" font-size="32" x="0" y="40">A</text></svg>`,
      },
    });

    openWorkspaceSection('Repair');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Convert 1 text elements to paths' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Convert 1 text elements to paths' }));

    await waitFor(() => {
      expect(screen.getByText('Converted 1 text element to paths.')).toBeInTheDocument();
    });
  });

  it('uploads a font and maps it to a missing SVG family before converting text', async () => {
    const fontBuffer = createFontArrayBuffer('Uploaded Workbench');
    const uploadedFontFile = new File([fontBuffer], 'uploaded-workbench.otf', { type: 'font/otf' });
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Missing Font" font-size="32" x="0" y="40">A</text></svg>',
      },
    });

    openWorkspaceSection('Repair');

    await waitFor(() => {
      expect(screen.getByLabelText('Map Missing Font font family')).toBeInTheDocument();
    });

    const fontInput = document.querySelector('input[type="file"][accept*=".ttf"]') as HTMLInputElement | null;
    expect(fontInput).not.toBeNull();

    fireEvent.change(fontInput!, {
      target: {
        files: [uploadedFontFile],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Uploaded Workbench')).toBeInTheDocument();
    });

    const mappingSelect = screen.getByLabelText('Map Missing Font font family') as HTMLSelectElement;
    fireEvent.change(mappingSelect, {
      target: {
        value: mappingSelect.options[1]?.value,
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Convert 1 text elements to paths' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Convert 1 text elements to paths' }));

    await waitFor(() => {
      expect(screen.getByText('Converted 1 text element to paths.')).toBeInTheDocument();
    });
  });

  it('applies the safe repair pass from the repair panel', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><style>.shape { fill: red; }</style><defs><rect id="shape" class="shape" width="10" height="10" transform="translate(1 2)" /></defs><g transform="translate(3 4)"><rect x="0" y="0" width="5" height="6" /></g><use href="#shape" x="5" y="7" /></svg>',
      },
    });

    openWorkspaceSection('Repair');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Normalize all safe repairs (6)' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Normalize all safe repairs (6)' }));

    await waitFor(() => {
      expect(screen.getByText('Applied 1 style rules, 2 shapes, 1 direct transforms, 1 container transforms, 1 use references.')).toBeInTheDocument();
    });
  });

  it('downloads the geometry-safe export from the export panel', async () => {
    const createObjectURL = vi.fn(() => 'blob:test-url');
    const revokeObjectURL = vi.fn();
    const click = vi.fn();

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    HTMLAnchorElement.prototype.click = click;

    try {
      render(<App />);
      openWorkspaceSection('Export');
      fireEvent.click(screen.getByRole('button', { name: 'Download Geometry-safe SVG' }));

      await waitFor(() => {
        expect(screen.getByText('Last export')).toBeInTheDocument();
      });

      expect(screen.getByText('Geometry-safe SVG')).toBeInTheDocument();
      expect(screen.getByText('sample.geometry.svg', { selector: '.export-report-file' })).toBeInTheDocument();
      expect(screen.getByText('2 shapes converted to paths')).toBeInTheDocument();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      HTMLAnchorElement.prototype.click = originalClick;
    }

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });

  it('downloads the browser/runtime export from the export panel', async () => {
    const createObjectURL = vi.fn<(obj: Blob | MediaSource) => string>(() => 'blob:test-url');
    const revokeObjectURL = vi.fn();
    const click = vi.fn();
    let exportedObject: unknown = null;

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    HTMLAnchorElement.prototype.click = click;
    createObjectURL.mockImplementation((blob: Blob | MediaSource) => {
      exportedObject = blob;
      return 'blob:test-url';
    });

    try {
      render(<App />);
      fireEvent.change(screen.getByLabelText('SVG source'), {
        target: {
          value: '<svg xmlns="http://www.w3.org/2000/svg" baseProfile="tiny"><metadata /><video href="movie.mp4" width="10" height="10" /><use href="#missing" /></svg>',
        },
      });

      openWorkspaceSection('Export');
      fireEvent.click(screen.getByRole('tab', { name: /Browser\/runtime/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Download Browser/runtime SVG' }));

      await waitFor(() => {
        expect(screen.getByText('Last export')).toBeInTheDocument();
      });

      const exportReport = screen.getByText('Last export').closest('.export-report');
      expect(exportReport?.textContent).toContain('Browser/runtime SVG');
      expect(screen.getByText('sample.runtime.svg', { selector: '.export-report-file' })).toBeInTheDocument();
      expect(exportReport?.textContent).toContain('1 broken or chained references cleaned');
      expect(exportReport?.textContent).toContain('1 authoring metadata items stripped');
      expect(exportedObject).toBeInstanceOf(Blob);
      const exportedBlob = exportedObject as Blob;
      const blobText = await exportedBlob.text();
      expect(blobText).toContain('movie.mp4');
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      HTMLAnchorElement.prototype.click = originalClick;
    }

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });

  it('downloads a png snapshot for the selected export preset', async () => {
    const createObjectURL = vi.fn<(obj: Blob | MediaSource) => string>(() => 'blob:test-url');
    const revokeObjectURL = vi.fn();
    const click = vi.fn();
    const drawImage = vi.fn();
    const createdObjects: Array<Blob | MediaSource> = [];

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;
    const originalImage = globalThis.Image;
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement');

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => {
          this.onload?.();
        });
      }
    }

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    HTMLAnchorElement.prototype.click = click;
    globalThis.Image = MockImage as unknown as typeof Image;
    createObjectURL.mockImplementation((obj: Blob | MediaSource) => {
      createdObjects.push(obj);
      return `blob:test-url-${createdObjects.length}`;
    });
    createElementSpy.mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage }),
          toBlob: (callback: BlobCallback, type?: string) => {
            callback(new Blob(['png-bytes'], { type: type ?? 'image/png' }));
          },
        } as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName as keyof HTMLElementTagNameMap, options);
    }) as typeof document.createElement);

    try {
      render(<App />);
      fireEvent.change(screen.getByLabelText('SVG source'), {
        target: {
          value: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="tomato" /></svg>',
        },
      });

      openWorkspaceSection('Export');
      fireEvent.click(screen.getByRole('button', { name: 'Download PNG snapshot' }));

      await waitFor(() => {
        expect(screen.getByText('Last export')).toBeInTheDocument();
      });

      const exportReport = screen.getByText('Last export').closest('.export-report');
      const downloadedBlob = createdObjects.at(-1);

      expect(exportReport?.textContent).toContain('Geometry-safe PNG snapshot');
      expect(screen.getByText('sample.geometry.png', { selector: '.export-report-file' })).toBeInTheDocument();
      expect(exportReport?.textContent).toContain('Rasterized to a 40 x 20 PNG snapshot.');
      expect(downloadedBlob).toBeInstanceOf(Blob);
      expect((downloadedBlob as Blob).type).toBe('image/png');
      expect(drawImage).toHaveBeenCalledTimes(1);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      HTMLAnchorElement.prototype.click = originalClick;
      globalThis.Image = originalImage;
      createElementSpy.mockRestore();
    }
  });

  it('downloads the blender-friendly preset from the export panel', async () => {
    const createObjectURL = vi.fn(() => 'blob:test-url');
    const revokeObjectURL = vi.fn();
    const click = vi.fn();

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    HTMLAnchorElement.prototype.click = click;

    try {
      render(<App />);
      openWorkspaceSection('Export');
      fireEvent.click(screen.getByRole('tab', { name: /Blender-friendly/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Download Blender-friendly SVG' }));

      await waitFor(() => {
        expect(screen.getByText('Last export')).toBeInTheDocument();
      });

      expect(screen.getByText('Blender-friendly SVG')).toBeInTheDocument();
      expect(screen.getByText('sample.blender.svg', { selector: '.export-report-file' })).toBeInTheDocument();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      HTMLAnchorElement.prototype.click = originalClick;
    }
  });

  it('records a report for current exports', async () => {
    const createObjectURL = vi.fn(() => 'blob:test-url');
    const revokeObjectURL = vi.fn();
    const click = vi.fn();

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    HTMLAnchorElement.prototype.click = click;

    try {
      render(<App />);
      openWorkspaceSection('Export');
      fireEvent.click(screen.getByRole('button', { name: 'Download current SVG' }));

      await waitFor(() => {
        expect(screen.getByText('Current SVG')).toBeInTheDocument();
      });

      expect(screen.getByText('No automatic repairs applied.')).toBeInTheDocument();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      HTMLAnchorElement.prototype.click = originalClick;
    }
  });

  it('copies the geometry-safe preset to the clipboard', async () => {
    const writeText = vi.fn(async () => undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    try {
      render(<App />);
      openWorkspaceSection('Export');
      fireEvent.click(screen.getByRole('button', { name: 'Copy Geometry-safe SVG' }));

      await waitFor(() => {
        expect(screen.getByText('Last copy')).toBeInTheDocument();
      });

      expect(screen.getByText('Geometry-safe SVG')).toBeInTheDocument();
      expect(writeText).toHaveBeenCalledTimes(1);
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', originalClipboard);
      }
    }
  });
});
