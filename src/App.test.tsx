import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as opentype from 'opentype.js';
vi.mock('./lib/svg-tracing', async () => {
  const actual = await vi.importActual<typeof import('./lib/svg-tracing')>('./lib/svg-tracing');

  return {
    ...actual,
    loadRasterTraceAsset: vi.fn(async (file: File) => ({
      fileName: file.name,
      mimeType: file.type,
      dataUrl: 'data:image/png;base64,trace-preview',
      width: 64,
      height: 32,
      bytes: file.size,
      hasTransparency: false,
      isFlatArtwork: false,
    })),
    traceRasterAssetToSvg: vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32" width="64" height="32"><path d="M0 0H64V32H0Z" fill="#000" /></svg>'),
  };
});

import App from './App';
import { EMPTY_SVG_TEMPLATE } from './lib/svg-source';
import { loadRasterTraceAsset, traceRasterAssetToSvg } from './lib/svg-tracing';

const mockedLoadRasterTraceAsset = vi.mocked(loadRasterTraceAsset);
const mockedTraceRasterAssetToSvg = vi.mocked(traceRasterAssetToSvg);

beforeEach(() => {
  window.localStorage.clear();
  mockedLoadRasterTraceAsset.mockClear();
  mockedTraceRasterAssetToSvg.mockClear();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

function ensureInspectorExpanded() {
  const toggle = screen.getByRole('button', { name: /inspection panel/i });
  if (toggle.getAttribute('aria-expanded') === 'false') {
    fireEvent.click(toggle);
  }
}

function openWorkspaceSection(name: 'File' | 'Repair' | 'Export') {
  fireEvent.click(screen.getByRole('button', { name }));
  ensureInspectorExpanded();

  if (name === 'Repair') {
    const showMappingsButton = screen.queryByRole('button', { name: 'Show mappings' });
    if (showMappingsButton) {
      fireEvent.click(showMappingsButton);
    }

    const showTargetedRepairsButton = screen.queryByRole('button', { name: 'Show targeted repairs' });
    if (showTargetedRepairsButton) {
      fireEvent.click(showTargetedRepairsButton);
    }
  }

  if (name === 'Export') {
    const showCurrentSourceActionsButton = screen.queryByRole('button', { name: 'Show current-source actions and file names' });
    if (showCurrentSourceActionsButton) {
      fireEvent.click(showCurrentSourceActionsButton);
    }
  }
}

function openSelectionTool(name: 'Style' | 'Animate' | 'Interact') {
  ensureInspectorExpanded();
  fireEvent.click(screen.getByRole('tab', { name: 'Selection' }));
  fireEvent.click(screen.getByRole('tab', { name }));
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
    expect(screen.queryByText('Inspect')).not.toBeInTheDocument();

    ensureInspectorExpanded();

    expect(screen.getByText('Document stats')).toBeInTheDocument();
    expect(screen.getByText('Featured tags')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inspect' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Warnings' }));

    expect(screen.getByText('Text elements found. Geometry-only exports may need text-to-path conversion.')).toBeInTheDocument();
  });

  it('opens the resources modal from the topbar and exposes the resource links', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Resources' }));

    const dialog = screen.getByRole('dialog', { name: 'Workshop Resources' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Example SVGs/i })).toHaveAttribute('href', 'https://github.com/SuddenDevelopment/svg/tree/main/tests/SVG');
    expect(within(dialog).getByRole('link', { name: /Blender Addon/i })).toHaveAttribute('href', 'https://github.com/SuddenDevelopment/blender-manifest-addon');
    expect(within(dialog).getByRole('link', { name: /Discord link/i })).toHaveAttribute('href', 'https://discord.com/');

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Workshop Resources' })).not.toBeInTheDocument();
  });

  it('wires the inspection controls as accessible tabs with keyboard navigation', () => {
    render(<App />);
    ensureInspectorExpanded();

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

  it('wires the selected element tools as accessible tabs with keyboard navigation', () => {
    render(<App />);
    ensureInspectorExpanded();

    fireEvent.click(screen.getByRole('tab', { name: 'Selection' }));

    const toolTablist = screen.getByRole('tablist', { name: 'Selected element tools' });
    const styleTab = within(toolTablist).getByRole('tab', { name: 'Style' });
    const animationTab = within(toolTablist).getByRole('tab', { name: 'Animate' });
    const interactionTab = within(toolTablist).getByRole('tab', { name: 'Interact' });
    const toolPanel = screen.getByRole('tabpanel', { name: 'Style' });

    expect(styleTab).toHaveAttribute('aria-controls', toolPanel.id);
    expect(animationTab).toHaveAttribute('tabindex', '-1');
    expect(toolPanel).toHaveAttribute('aria-labelledby', styleTab.id);

    styleTab.focus();
    fireEvent.keyDown(styleTab, { key: 'ArrowRight' });

    expect(animationTab).toHaveFocus();
    expect(animationTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(animationTab, { key: 'End' });

    expect(interactionTab).toHaveFocus();
    expect(interactionTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Interact' })).toBeInTheDocument();
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

    ensureInspectorExpanded();
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show inventory details' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Runtime features' })).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: 'Defs and references' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Authoring metadata' })).toBeInTheDocument();
    expect(screen.getByText('tiny')).toBeInTheDocument();
    expect(screen.getByText('inkscape')).toBeInTheDocument();
  });

  it('defaults theme to system and lets settings override it', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Theme' })).toBeInTheDocument();
    });

    expect(screen.getByRole('radio', { name: /^System/i })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset.theme).toBe('light');

    fireEvent.click(screen.getByRole('radio', { name: /^Dark/i }));

    expect(screen.getByRole('radio', { name: /^Dark/i })).toHaveAttribute('aria-checked', 'true');
    expect(window.localStorage.getItem('svg-workbench.theme-preference')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
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

  it('loads a raster image into the trace workflow and applies the traced svg to the editor', async () => {
    const { container } = render(<App />);

    const rasterInput = container.querySelector('input[accept*=".png"]') as HTMLInputElement | null;
    expect(rasterInput).not.toBeNull();

    const rasterFile = new File([new Uint8Array([137, 80, 78, 71])], 'badge.png', { type: 'image/png' });

    fireEvent.change(rasterInput as HTMLInputElement, {
      target: {
        files: [rasterFile],
      },
    });

    await waitFor(() => {
      expect(mockedLoadRasterTraceAsset).toHaveBeenCalledWith(rasterFile);
    });

    await waitFor(() => {
      expect(mockedTraceRasterAssetToSvg).toHaveBeenCalled();
    });

    expect((screen.getByLabelText('SVG source') as HTMLTextAreaElement).value).toContain('<path');
    expect(screen.getByText('Traced badge.png into badge-traced.svg.')).toBeInTheDocument();
    expect(screen.getByText('Applied the illustration trace preset to badge.png.')).toBeInTheDocument();
  });

  it('loads jpeg sources with a posterized photo preset recommendation', async () => {
    const { container } = render(<App />);

    const rasterInput = container.querySelector('input[accept*=".png"]') as HTMLInputElement | null;
    expect(rasterInput).not.toBeNull();

    const rasterFile = new File([new Uint8Array([255, 216, 255, 224])], 'photo.jpg', { type: 'image/jpeg' });

    fireEvent.change(rasterInput as HTMLInputElement, {
      target: {
        files: [rasterFile],
      },
    });

    await waitFor(() => {
      expect(mockedLoadRasterTraceAsset).toHaveBeenCalledWith(rasterFile);
    });

    await waitFor(() => {
      expect(mockedTraceRasterAssetToSvg).toHaveBeenCalled();
      expect(screen.getByRole('combobox', { name: 'Trace preset' })).toHaveValue('posterized-photo');
    });
    expect(screen.getByRole('checkbox', { name: 'Edge-preserving photo cleanup' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Posterize raster trace colors' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Remove traced white background' })).not.toBeChecked();
    expect(screen.getByText('Applied the posterized photo trace preset to photo.jpg.')).toBeInTheDocument();
    expect(screen.getByText('Traced photo.jpg into photo-traced.svg.')).toBeInTheDocument();
  });

  it('loads transparent flat artwork with a flat-logo preset recommendation', async () => {
    mockedLoadRasterTraceAsset.mockResolvedValueOnce({
      fileName: 'logo.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,trace-preview',
      width: 64,
      height: 32,
      bytes: 4,
      hasTransparency: true,
      isFlatArtwork: true,
    });

    const { container } = render(<App />);
    const rasterInput = container.querySelector('input[accept*=".png"]') as HTMLInputElement | null;
    expect(rasterInput).not.toBeNull();

    const rasterFile = new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' });

    fireEvent.change(rasterInput as HTMLInputElement, {
      target: {
        files: [rasterFile],
      },
    });

    await waitFor(() => {
      expect(mockedTraceRasterAssetToSvg).toHaveBeenCalled();
      expect(screen.getByRole('combobox', { name: 'Trace preset' })).toHaveValue('flat-logo');
    });
    expect(screen.getByText('Applied the flat logo trace preset to logo.png.')).toBeInTheDocument();
    expect(screen.getByText('Traced logo.png into logo-traced.svg.')).toBeInTheDocument();
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

    ensureInspectorExpanded();

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

  it('lets the selection inspector switch preview highlight presets', async () => {
    const { container } = render(<App />);

    const previewFrame = container.querySelector('.svg-preview-frame');
    expect(previewFrame).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Selection appearance' })).toBeInTheDocument();
    });

    expect(previewFrame).toHaveAttribute('data-selection-style', 'studio');
    expect(screen.getByRole('button', { name: /Studio/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Animation target')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Signal/ }));

    expect(previewFrame).toHaveAttribute('data-selection-style', 'signal');
    expect(screen.getByRole('button', { name: /Signal/ })).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(window.localStorage.getItem('svg-workbench.selection-appearance') ?? '{}')).toMatchObject({
      preset: 'signal',
    });
  });

  it('persists per-state selection highlight controls and removes hidden preview highlights', async () => {
    const { container, unmount } = render(<App />);

    const previewSurface = screen.getByLabelText('SVG preview area');
    const previewText = container.querySelector('.svg-preview-frame svg text');
    expect(previewText).not.toBeNull();

    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');

    try {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: vi.fn(() => previewText),
      });

      fireEvent.pointerDown(previewSurface, {
        button: 0,
        pointerId: 8,
        clientX: 24,
        clientY: 18,
      });
      fireEvent.pointerUp(previewSurface, {
        button: 0,
        pointerId: 8,
        clientX: 24,
        clientY: 18,
      });

      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Selection appearance' })).toBeInTheDocument();
      });

      fireEvent.change(screen.getByRole('combobox', { name: 'Selected node highlight intensity' }), {
        target: { value: 'soft' },
      });
      fireEvent.click(screen.getByRole('checkbox', { name: 'Selected node highlight visible' }));

      await waitFor(() => {
        expect(container.querySelector('[data-svg-node-selected="true"]')).toBeNull();
      });

      expect(screen.getByRole('combobox', { name: 'Selected node highlight intensity' })).toBeDisabled();

      expect(JSON.parse(window.localStorage.getItem('svg-workbench.selection-appearance') ?? '{}')).toMatchObject({
        settings: {
          selected: {
            visible: false,
            intensity: 'soft',
          },
        },
      });

      unmount();

      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

      expect(screen.getByRole('checkbox', { name: 'Selected node highlight visible' })).not.toBeChecked();
      expect(screen.getByRole('combobox', { name: 'Selected node highlight intensity' })).toHaveValue('soft');
    } finally {
      if (originalElementFromPoint) {
        Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('exports, resets, and imports selection appearance preset JSON', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    fireEvent.click(screen.getByRole('button', { name: /Signal/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Risk hover highlight intensity' }), {
      target: { value: 'strong' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Animation target highlight visible' }));

    fireEvent.click(screen.getByRole('button', { name: 'Export preset JSON' }));

    const presetJsonField = screen.getByRole('textbox', { name: 'Selection appearance preset JSON' }) as HTMLTextAreaElement;
    expect(presetJsonField.value).toContain('"preset": "signal"');
    expect(presetJsonField.value).toContain('"targeted"');

    fireEvent.click(screen.getByRole('button', { name: 'Reset defaults' }));

    expect(screen.getByRole('button', { name: /Studio/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('checkbox', { name: 'Animation target highlight visible' })).toBeChecked();

    fireEvent.change(presetJsonField, {
      target: {
        value: JSON.stringify({
          preset: 'blueprint',
          settings: {
            selected: { visible: true, intensity: 'soft' },
            hovered: { visible: true, intensity: 'strong' },
            changed: { visible: false, intensity: 'medium' },
            targeted: { visible: false, intensity: 'soft' },
          },
        }, null, 2),
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Import preset JSON' }));

    expect(screen.getByRole('button', { name: /Blueprint/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('checkbox', { name: 'Recent repair highlight visible' })).not.toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Risk hover highlight intensity' })).toHaveValue('strong');
    expect(JSON.parse(window.localStorage.getItem('svg-workbench.selection-appearance') ?? '{}')).toMatchObject({
      preset: 'blueprint',
      settings: {
        changed: { visible: false, intensity: 'medium' },
        targeted: { visible: false, intensity: 'soft' },
      },
    });
  });

  it('supports preview multi-select while keeping the last clicked node inspected', async () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /><circle cx="30" cy="30" r="8" /></svg>',
      },
    });

    const previewSurface = screen.getByLabelText('SVG preview area');
    const previewRect = container.querySelector('.svg-preview-frame svg rect');
    const previewCircle = container.querySelector('.svg-preview-frame svg circle');
    expect(previewRect).not.toBeNull();
    expect(previewCircle).not.toBeNull();

    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');

    try {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: vi.fn(() => previewRect),
      });

      fireEvent.pointerDown(previewSurface, {
        button: 0,
        pointerId: 11,
        clientX: 20,
        clientY: 20,
      });
      fireEvent.pointerUp(previewSurface, {
        button: 0,
        pointerId: 11,
        clientX: 20,
        clientY: 20,
      });

      await waitFor(() => {
        expect(container.querySelectorAll('[data-svg-node-selected="true"]').length).toBe(1);
      });

      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: vi.fn(() => previewCircle),
      });

      fireEvent.pointerDown(previewSurface, {
        button: 0,
        pointerId: 12,
        clientX: 32,
        clientY: 32,
        shiftKey: true,
      });
      fireEvent.pointerUp(previewSurface, {
        button: 0,
        pointerId: 12,
        clientX: 32,
        clientY: 32,
        shiftKey: true,
      });

      await waitFor(() => {
        expect(container.querySelectorAll('[data-svg-node-selected="true"]').length).toBe(2);
      });

      ensureInspectorExpanded();

      expect(screen.getByText('circle', { selector: '.selection-tag' })).toBeInTheDocument();
      expect(screen.getByText('2 preview elements are selected. The inspector is showing the most recently inspected element.')).toBeInTheDocument();
    } finally {
      if (originalElementFromPoint) {
        Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('can collapse selected element details to reduce inspector scrolling', async () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><path id="long-path" d="M0 0 C 20 40, 40 20, 60 60 S 100 100, 140 40" /></svg>',
      },
    });

    const previewSurface = screen.getByLabelText('SVG preview area');
    const previewPath = container.querySelector('.svg-preview-frame svg path');
    expect(previewPath).not.toBeNull();

    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');

    try {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: vi.fn(() => previewPath),
      });

      fireEvent.pointerDown(previewSurface, { button: 0, pointerId: 51, clientX: 24, clientY: 18 });
      fireEvent.pointerUp(previewSurface, { button: 0, pointerId: 51, clientX: 24, clientY: 18 });

      ensureInspectorExpanded();

      await waitFor(() => {
        expect(screen.getByText('long-path')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Collapse details' }));

      expect(screen.getByRole('button', { name: 'Expand details' })).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByText('Details are collapsed. Expand this card to inspect attributes and attached animations.')).toBeInTheDocument();
      expect(screen.queryByText('Animations on this element')).not.toBeInTheDocument();
    } finally {
      if (originalElementFromPoint) {
        Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('toggles selected element visibility from the style tool', async () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><rect id="panel" width="12" height="12" /></svg>',
      },
    });

    const previewSurface = screen.getByLabelText('SVG preview area');
    const previewRect = container.querySelector('.svg-preview-frame svg rect');
    expect(previewRect).not.toBeNull();

    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');

    try {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: vi.fn(() => previewRect),
      });

      fireEvent.pointerDown(previewSurface, { button: 0, pointerId: 52, clientX: 24, clientY: 18 });
      fireEvent.pointerUp(previewSurface, { button: 0, pointerId: 52, clientX: 24, clientY: 18 });

      openSelectionTool('Style');

      fireEvent.click(screen.getByRole('button', { name: 'Hide selected' }));

      await waitFor(() => {
        expect(screen.getByText(/Hidden 1 selected element/i)).toBeInTheDocument();
      });

      openWorkspaceSection('File');
      expect((screen.getByLabelText('SVG source') as HTMLTextAreaElement).value).toContain('display="none"');

      openSelectionTool('Style');
      fireEvent.click(screen.getByRole('button', { name: 'Unhide selected' }));

      await waitFor(() => {
        expect(screen.getByText(/Unhidden 1 selected element/i)).toBeInTheDocument();
      });

      openWorkspaceSection('File');
      expect((screen.getByLabelText('SVG source') as HTMLTextAreaElement).value).not.toContain('display="none"');
    } finally {
      if (originalElementFromPoint) {
        Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('cycles overlapping preview hits on repeated clicks at the same point', async () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><rect id="rear" x="0" y="0" width="20" height="20" /><rect id="front" x="0" y="0" width="20" height="20" /></svg>',
      },
    });

    const previewSurface = screen.getByLabelText('SVG preview area');
    const previewRects = container.querySelectorAll('.svg-preview-frame svg rect');
    const rearRect = previewRects[0] ?? null;
    const frontRect = previewRects[1] ?? null;
    expect(rearRect).not.toBeNull();
    expect(frontRect).not.toBeNull();

    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    const originalElementsFromPoint = Object.getOwnPropertyDescriptor(document, 'elementsFromPoint');

    try {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: vi.fn(() => frontRect),
      });
      Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: vi.fn(() => [frontRect, rearRect]),
      });

      fireEvent.pointerDown(previewSurface, { button: 0, pointerId: 53, clientX: 24, clientY: 18 });
      fireEvent.pointerUp(previewSurface, { button: 0, pointerId: 53, clientX: 24, clientY: 18 });

      await waitFor(() => {
        expect(container.querySelector('.svg-preview-frame [data-svg-node-selected="true"]')?.getAttribute('id')).toBe('front');
      });

      fireEvent.pointerDown(previewSurface, { button: 0, pointerId: 54, clientX: 24, clientY: 18 });
      fireEvent.pointerUp(previewSurface, { button: 0, pointerId: 54, clientX: 24, clientY: 18 });

      await waitFor(() => {
        expect(container.querySelector('.svg-preview-frame [data-svg-node-selected="true"]')?.getAttribute('id')).toBe('rear');
      });
    } finally {
      if (originalElementFromPoint) {
        Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }

      if (originalElementsFromPoint) {
        Object.defineProperty(document, 'elementsFromPoint', originalElementsFromPoint);
      } else {
        Reflect.deleteProperty(document, 'elementsFromPoint');
      }
    }
  });

  it('lets the selection animation tool target multiple preview elements and writes animation markup into the source', async () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /><circle cx="30" cy="30" r="8" /></svg>',
      },
    });

    openSelectionTool('Animate');

    await waitFor(() => {
      expect(screen.getByText('Selection targets')).toBeInTheDocument();
    });

    const previewSurface = screen.getByLabelText('SVG preview area');
    const previewRect = container.querySelector('.svg-preview-frame svg rect');
    const previewCircle = container.querySelector('.svg-preview-frame svg circle');
    expect(previewRect).not.toBeNull();
    expect(previewCircle).not.toBeNull();

    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');

    try {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: vi.fn(() => previewRect),
      });

      fireEvent.pointerDown(previewSurface, {
        button: 0,
        pointerId: 11,
        clientX: 20,
        clientY: 20,
      });
      fireEvent.pointerUp(previewSurface, {
        button: 0,
        pointerId: 11,
        clientX: 20,
        clientY: 20,
      });

      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: vi.fn(() => previewCircle),
      });

      fireEvent.pointerDown(previewSurface, {
        button: 0,
        pointerId: 12,
        clientX: 40,
        clientY: 40,
        shiftKey: true,
      });
      fireEvent.pointerUp(previewSurface, {
        button: 0,
        pointerId: 12,
        clientX: 40,
        clientY: 40,
        shiftKey: true,
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Preview and apply to 2 targets' })).toBeEnabled();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Preview and apply to 2 targets' }));

      await waitFor(() => {
        expect(screen.getByText(/Applied fade in to 2 targets/i)).toBeInTheDocument();
      });

      openWorkspaceSection('File');

      const sourceEditor = screen.getByLabelText('SVG source') as HTMLTextAreaElement;
      expect(sourceEditor.value).toContain('data-svg-workbench-animation="true"');
      expect(sourceEditor.value.match(/data-svg-workbench-animation="true"/g)?.length).toBe(2);
    } finally {
      if (originalElementFromPoint) {
        Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('shows selected-element animation summaries in the inspector after authoring motion', async () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /></svg>',
      },
    });

    openSelectionTool('Animate');

    await waitFor(() => {
      expect(screen.getByText('Selection targets')).toBeInTheDocument();
    });

    const previewSurface = screen.getByLabelText('SVG preview area');
    const previewRect = container.querySelector('.svg-preview-frame svg rect');
    expect(previewRect).not.toBeNull();

    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');

    try {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: vi.fn(() => previewRect),
      });

      fireEvent.pointerDown(previewSurface, {
        button: 0,
        pointerId: 21,
        clientX: 20,
        clientY: 20,
      });
      fireEvent.pointerUp(previewSurface, {
        button: 0,
        pointerId: 21,
        clientX: 20,
        clientY: 20,
      });

      fireEvent.change(screen.getByLabelText('Preset'), {
        target: { value: 'orbit' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Preview and apply to 1 target' }));

      await waitFor(() => {
        expect(screen.getByText('Animations on this element')).toBeInTheDocument();
      });

      const animationBlock = screen.getByText('Animations on this element').closest('.selection-animations-block');
      expect(animationBlock?.textContent).toContain('Orbit');
      expect(within(animationBlock as HTMLElement).getByText('workbench')).toBeInTheDocument();
      expect(animationBlock?.textContent).toContain('motion path');
    } finally {
      if (originalElementFromPoint) {
        Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('lets the animate panel author a scale preset with custom values', async () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /></svg>',
      },
    });

    openSelectionTool('Animate');

    await waitFor(() => {
      expect(screen.getByText('Selection targets')).toBeInTheDocument();
    });

    const previewSurface = screen.getByLabelText('SVG preview area');
    const previewRect = container.querySelector('.svg-preview-frame svg rect');
    expect(previewRect).not.toBeNull();

    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');

    try {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: vi.fn(() => previewRect),
      });

      fireEvent.pointerDown(previewSurface, { button: 0, pointerId: 26, clientX: 20, clientY: 20 });
      fireEvent.pointerUp(previewSurface, { button: 0, pointerId: 26, clientX: 20, clientY: 20 });

      fireEvent.change(screen.getByLabelText('Preset'), {
        target: { value: 'scale' },
      });
      fireEvent.change(screen.getByLabelText('Start scale'), {
        target: { value: '0.9' },
      });
      fireEvent.change(screen.getByLabelText('Peak scale'), {
        target: { value: '1.3' },
      });
      fireEvent.change(screen.getByLabelText('End scale'), {
        target: { value: '1.05' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Preview and apply to 1 target' }));

      await waitFor(() => {
        expect(screen.getByText(/Applied scale to 1 target/i)).toBeInTheDocument();
      });

      openWorkspaceSection('File');

      const sourceEditor = screen.getByLabelText('SVG source') as HTMLTextAreaElement;
      expect(sourceEditor.value).toContain('data-svg-workbench-animation-preset="scale"');
      expect(sourceEditor.value).toContain('type="scale"');
      expect(sourceEditor.value).toContain('values="0.9 0.9; 1.3 1.3; 1.05 1.05"');
    } finally {
      if (originalElementFromPoint) {
        Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('lets the animate panel author a random flicker preset', async () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /></svg>',
      },
    });

    openSelectionTool('Animate');

    await waitFor(() => {
      expect(screen.getByText('Selection targets')).toBeInTheDocument();
    });

    const previewSurface = screen.getByLabelText('SVG preview area');
    const previewRect = container.querySelector('.svg-preview-frame svg rect');
    expect(previewRect).not.toBeNull();

    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');

    try {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: vi.fn(() => previewRect),
      });

      fireEvent.pointerDown(previewSurface, { button: 0, pointerId: 27, clientX: 20, clientY: 20 });
      fireEvent.pointerUp(previewSurface, { button: 0, pointerId: 27, clientX: 20, clientY: 20 });

      fireEvent.change(screen.getByLabelText('Preset'), {
        target: { value: 'random-flicker' },
      });
      fireEvent.change(screen.getByLabelText('Start opacity'), {
        target: { value: '1' },
      });
      fireEvent.change(screen.getByLabelText('Mid opacity'), {
        target: { value: '0.22' },
      });
      fireEvent.change(screen.getByLabelText('End opacity'), {
        target: { value: '0.9' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Preview and apply to 1 target' }));

      await waitFor(() => {
        expect(screen.getByText(/Applied random flicker to 1 target/i)).toBeInTheDocument();
      });

      openWorkspaceSection('File');

      const sourceEditor = screen.getByLabelText('SVG source') as HTMLTextAreaElement;
      expect(sourceEditor.value).toContain('data-svg-workbench-animation-preset="random-flicker"');
      expect(sourceEditor.value).toContain('keyTimes="0;0.07;0.16;0.28;0.41;0.55;0.69;0.83;1"');
      expect(sourceEditor.value).toContain('values="1;0.47;0.22;0.8;0.32;0.69;0.26;0.84;0.9"');
    } finally {
      if (originalElementFromPoint) {
        Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('loads native animation settings into the editor and can replace native animation nodes', async () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12"><animate attributeName="opacity" values="1;0;1" dur="0.6s" begin="click+0.2s" repeatCount="indefinite" /></rect></svg>',
      },
    });

    openSelectionTool('Animate');

    await waitFor(() => {
      expect(screen.getByText('Selection targets')).toBeInTheDocument();
    });

    const previewSurface = screen.getByLabelText('SVG preview area');
    const previewRect = container.querySelector('.svg-preview-frame svg rect');
    expect(previewRect).not.toBeNull();

    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');

    try {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: vi.fn(() => previewRect),
      });

      fireEvent.pointerDown(previewSurface, { button: 0, pointerId: 31, clientX: 20, clientY: 20 });
      fireEvent.pointerUp(previewSurface, { button: 0, pointerId: 31, clientX: 20, clientY: 20 });

      fireEvent.click(screen.getByRole('button', { name: 'Load selected animation' }));

      await waitFor(() => {
        expect(screen.getByText('Loaded the selected element animation into the editor for migration or reapply.')).toBeInTheDocument();
      });

      expect((screen.getByLabelText('Duration (s)') as HTMLInputElement).value).toBe('0.6');
      expect((screen.getByLabelText('Start when') as HTMLSelectElement).value).toBe('click');
      expect((screen.getByLabelText('Replace mode') as HTMLSelectElement).value).toBe('all');

      fireEvent.click(screen.getByRole('button', { name: 'Preview and apply to 1 target' }));

      await waitFor(() => {
        expect(screen.getByText(/Applied blink to 1 target/i)).toBeInTheDocument();
      });

      openWorkspaceSection('File');

      const sourceEditor = screen.getByLabelText('SVG source') as HTMLTextAreaElement;
      expect(sourceEditor.value.match(/<animate/g)?.length).toBe(1);
      expect(sourceEditor.value).toContain('data-svg-workbench-animation="true"');
    } finally {
      if (originalElementFromPoint) {
        Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('can append, select, edit, and clear an animation stack from the animate panel', async () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /></svg>',
      },
    });

    openSelectionTool('Animate');

    await waitFor(() => {
      expect(screen.getByText('Selection targets')).toBeInTheDocument();
    });

    const previewSurface = screen.getByLabelText('SVG preview area');
    const previewRect = container.querySelector('.svg-preview-frame svg rect');
    expect(previewRect).not.toBeNull();

    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');

    try {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: vi.fn(() => previewRect),
      });

      fireEvent.pointerDown(previewSurface, { button: 0, pointerId: 51, clientX: 20, clientY: 20 });
      fireEvent.pointerUp(previewSurface, { button: 0, pointerId: 51, clientX: 20, clientY: 20 });

      fireEvent.click(screen.getByRole('button', { name: 'Preview and apply to 1 target' }));

      await waitFor(() => {
        expect(screen.getByText(/Applied fade in to 1 target/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Preset'), {
        target: { value: 'rotate' },
      });
      fireEvent.change(screen.getByLabelText('Stack action'), {
        target: { value: 'append' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Preview and apply to 1 target' }));

      await waitFor(() => {
        expect(screen.getByText(/Appended rotate to 1 target/i)).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /1\. Fade in/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /2\. Rotate/i })).toBeInTheDocument();
      });

      const dataTransfer = {
        effectAllowed: 'all',
        dropEffect: 'move',
        setData: vi.fn(),
        getData: vi.fn(),
      };

      const draggedStackItem = screen.getByLabelText('Drag stack item 1: Fade in');

      fireEvent.dragStart(draggedStackItem, { dataTransfer });
      fireEvent.dragOver(screen.getByLabelText('Drop animation at end of stack'), { dataTransfer });
      fireEvent.drop(screen.getByLabelText('Drop animation at end of stack'), { dataTransfer });
      fireEvent.dragEnd(draggedStackItem, { dataTransfer });

      await waitFor(() => {
        expect(screen.getByText('Moved fade in to stack position 2.')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /1\. Rotate/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /2\. Fade in/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /2\. Fade in/i }));

      await waitFor(() => {
        expect(screen.getByText('Editing stack item 2: Fade in.')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Preset'), {
        target: { value: 'blink' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Preview and apply to 1 target' }));

      await waitFor(() => {
        expect(screen.getByText(/Updated blink to 1 target/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Delete stack item 1' }));

      await waitFor(() => {
        expect(screen.getByText('Deleted stack item 1: rotate.')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Clear animation stack' }));

      await waitFor(() => {
        expect(screen.getByText(/Removed 1 workbench animation node/i)).toBeInTheDocument();
      });

      openWorkspaceSection('File');

      const sourceEditor = screen.getByLabelText('SVG source') as HTMLTextAreaElement;
      expect(sourceEditor.value).not.toContain('data-svg-workbench-animation="true"');
    } finally {
      if (originalElementFromPoint) {
        Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  }, 30000);

  it('applies interaction fields to the selected preview element', async () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><a href="#start"><rect width="12" height="12" /></a></svg>',
      },
    });

    const previewSurface = screen.getByLabelText('SVG preview area');
    const previewAnchor = container.querySelector('.svg-preview-frame svg a');
    expect(previewAnchor).not.toBeNull();

    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');

    try {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: vi.fn(() => previewAnchor),
      });

      fireEvent.pointerDown(previewSurface, { button: 0, pointerId: 41, clientX: 20, clientY: 20 });
      fireEvent.pointerUp(previewSurface, { button: 0, pointerId: 41, clientX: 20, clientY: 20 });

      openSelectionTool('Interact');

      fireEvent.change(screen.getByLabelText('Accessible label'), {
        target: { value: 'Open details' },
      });
      fireEvent.change(screen.getByLabelText('Tooltip text'), {
        target: { value: 'Open the details panel' },
      });
      fireEvent.change(screen.getByLabelText('Hover behavior'), {
        target: { value: 'lift' },
      });
      fireEvent.change(screen.getByLabelText('Focus behavior'), {
        target: { value: 'ring' },
      });
      fireEvent.change(screen.getByLabelText('Pointer events'), {
        target: { value: 'bounding-box' },
      });
      fireEvent.change(screen.getByLabelText('Cursor'), {
        target: { value: 'pointer' },
      });
      fireEvent.change(screen.getByLabelText('Link href'), {
        target: { value: 'https://example.com/details' },
      });
      fireEvent.change(screen.getByLabelText('Link target'), {
        target: { value: '_blank' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Apply to 1 selected element' }));

      await waitFor(() => {
        expect(screen.getByText(/Applied interaction fields to 1 selected element/i)).toBeInTheDocument();
      });

      openWorkspaceSection('File');

      const sourceEditor = screen.getByLabelText('SVG source') as HTMLTextAreaElement;
      expect(sourceEditor.value).toContain('aria-label="Open details"');
      expect(sourceEditor.value).toContain('data-svg-workbench-interaction="true"');
      expect(sourceEditor.value).toContain('class="svgwb-hover-lift svgwb-focus-ring"');
      expect(sourceEditor.value).toContain('<title data-svg-workbench-tooltip="true">Open the details panel</title>');
      expect(sourceEditor.value).toContain('pointer-events="bounding-box"');
      expect(sourceEditor.value).toContain('cursor="pointer"');
      expect(sourceEditor.value).toContain('href="https://example.com/details"');
      expect(sourceEditor.value).toContain('target="_blank"');
    } finally {
      if (originalElementFromPoint) {
        Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('loads a richer interaction preset into the editor before applying it', async () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" /></svg>',
      },
    });

    const previewSurface = screen.getByLabelText('SVG preview area');
    const previewRect = container.querySelector('.svg-preview-frame svg rect');
    expect(previewRect).not.toBeNull();

    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');

    try {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: vi.fn(() => previewRect),
      });

      fireEvent.pointerDown(previewSurface, { button: 0, pointerId: 42, clientX: 20, clientY: 20 });
      fireEvent.pointerUp(previewSurface, { button: 0, pointerId: 42, clientX: 20, clientY: 20 });

      openSelectionTool('Interact');

      fireEvent.click(screen.getByRole('button', { name: 'Focusable hotspot' }));

      expect(screen.getByLabelText('Tab index')).toHaveValue('0');
      expect(screen.getByLabelText('Focusable')).toHaveValue('true');
      expect(screen.getByLabelText('Pointer events')).toHaveValue('bounding-box');
      expect(screen.getByLabelText('Cursor')).toHaveValue('pointer');
      expect(screen.getByLabelText('Hover behavior')).toHaveValue('glow');
      expect(screen.getByLabelText('Focus behavior')).toHaveValue('ring');

      fireEvent.click(screen.getByRole('button', { name: 'Apply to 1 selected element' }));

      await waitFor(() => {
        expect(screen.getByText(/Applied interaction fields to 1 selected element/i)).toBeInTheDocument();
      });

      openWorkspaceSection('File');

      const sourceEditor = screen.getByLabelText('SVG source') as HTMLTextAreaElement;
      expect(sourceEditor.value).toContain('tabindex="0"');
      expect(sourceEditor.value).toContain('focusable="true"');
      expect(sourceEditor.value).toContain('pointer-events="bounding-box"');
      expect(sourceEditor.value).toContain('cursor="pointer"');
      expect(sourceEditor.value).toContain('class="svgwb-hover-glow svgwb-focus-ring"');
    } finally {
      if (originalElementFromPoint) {
        Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('controls preview playback transport and renders a scrubber', async () => {
    const pauseAnimations = vi.fn();
    const unpauseAnimations = vi.fn();
    const setCurrentTime = vi.fn();
    const getCurrentTime = vi.fn(() => 1.4);
    const prototype = SVGSVGElement.prototype as SVGSVGElement & {
      pauseAnimations?: () => void;
      unpauseAnimations?: () => void;
      setCurrentTime?: (seconds: number) => void;
      getCurrentTime?: () => number;
    };
    const originalPauseDescriptor = Object.getOwnPropertyDescriptor(prototype, 'pauseAnimations');
    const originalUnpauseDescriptor = Object.getOwnPropertyDescriptor(prototype, 'unpauseAnimations');
    const originalSetCurrentTimeDescriptor = Object.getOwnPropertyDescriptor(prototype, 'setCurrentTime');
    const originalGetCurrentTimeDescriptor = Object.getOwnPropertyDescriptor(prototype, 'getCurrentTime');

    Object.defineProperty(prototype, 'pauseAnimations', { configurable: true, value: pauseAnimations });
    Object.defineProperty(prototype, 'unpauseAnimations', { configurable: true, value: unpauseAnimations });
    Object.defineProperty(prototype, 'setCurrentTime', { configurable: true, value: setCurrentTime });
    Object.defineProperty(prototype, 'getCurrentTime', { configurable: true, value: getCurrentTime });

    try {
      render(<App />);

      await waitFor(() => {
        expect(pauseAnimations).toHaveBeenCalled();
      });
      expect(unpauseAnimations).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();

      expect(screen.getByRole('slider', { name: 'Preview timeline' })).toBeEnabled();

      const playButton = screen.getByRole('button', { name: 'Play' });
      await waitFor(() => {
        expect(playButton).toBeEnabled();
      });
      fireEvent.click(playButton);
      expect(unpauseAnimations).toHaveBeenCalled();

      expect(screen.getByRole('button', { name: 'Restart' })).toBeEnabled();
    } finally {
      if (originalPauseDescriptor) {
        Object.defineProperty(prototype, 'pauseAnimations', originalPauseDescriptor);
      } else {
        Reflect.deleteProperty(prototype, 'pauseAnimations');
      }

      if (originalUnpauseDescriptor) {
        Object.defineProperty(prototype, 'unpauseAnimations', originalUnpauseDescriptor);
      } else {
        Reflect.deleteProperty(prototype, 'unpauseAnimations');
      }

      if (originalSetCurrentTimeDescriptor) {
        Object.defineProperty(prototype, 'setCurrentTime', originalSetCurrentTimeDescriptor);
      } else {
        Reflect.deleteProperty(prototype, 'setCurrentTime');
      }

      if (originalGetCurrentTimeDescriptor) {
        Object.defineProperty(prototype, 'getCurrentTime', originalGetCurrentTimeDescriptor);
      } else {
        Reflect.deleteProperty(prototype, 'getCurrentTime');
      }
    }
  });

  it('highlights risky preview nodes when hovering a risk entry', async () => {
    const { container } = render(<App />);
    ensureInspectorExpanded();

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

    const repairSection = screen.getByText('Guided cleanup').closest('section');
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

    const repairSection = screen.getByText('Guided cleanup').closest('section');
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
