import { describe, expect, it } from 'vitest';
import { buildAnalysis } from './svg-analysis';
import {
  applyInteractionBehaviorPreset,
  applyInteractionDraftToSource,
  classifyInteractionHref,
  createInteractionDraft,
  getInteractionSignalSummary,
  inferInteractionDraftForPath,
  inspectInteractionForPath,
} from './svg-interaction';

describe('svg-interaction', () => {
  it('builds an editable interaction draft from element attributes', () => {
    expect(createInteractionDraft({
      'aria-label': 'Open details',
      tabindex: '0',
      focusable: 'true',
      'pointer-events': 'bounding-box',
      cursor: 'pointer',
      href: '#details',
      target: '_self',
    })).toMatchObject({
      ariaLabel: 'Open details',
      tabIndex: '0',
      focusable: 'true',
      pointerEvents: 'bounding-box',
      cursor: 'pointer',
      href: '#details',
      target: '_self',
      tooltipText: '',
      hoverPreset: 'none',
      focusPreset: 'none',
    });
  });

  it('applies richer behavior presets without discarding existing semantic fields', () => {
    const seededDraft = createInteractionDraft({
      'aria-label': 'Open pricing',
      href: 'https://example.com/pricing',
    });

    expect(applyInteractionBehaviorPreset(seededDraft, 'button')).toMatchObject({
      ariaLabel: 'Open pricing',
      href: 'https://example.com/pricing',
      tabIndex: '0',
      focusable: 'true',
      pointerEvents: 'bounding-box',
      cursor: 'pointer',
      hoverPreset: 'lift',
      focusPreset: 'ring',
    });

    expect(applyInteractionBehaviorPreset(seededDraft, 'link-card')).toMatchObject({
      hoverPreset: 'glow',
      focusPreset: 'glow',
      cursor: 'pointer',
    });

    expect(applyInteractionBehaviorPreset(seededDraft, 'focusable-hotspot')).toMatchObject({
      pointerEvents: 'bounding-box',
      hoverPreset: 'glow',
      focusPreset: 'ring',
    });
  });

  it('updates interaction attributes and managed hover/focus patterns on selected nodes by analysis path', () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg"><a href="#old"><rect width="12" height="12" /></a><rect width="10" height="10" /></svg>`;
    const analysis = buildAnalysis(source, 'interaction.svg');
    const anchorNode = Object.values(analysis.nodesById).find((node) => node.name.toLowerCase() === 'a');
    const rectNode = Object.values(analysis.nodesById).find((node) => node.name.toLowerCase() === 'rect' && node.path === '0.1');

    expect(anchorNode).toBeDefined();
    expect(rectNode).toBeDefined();

    const result = applyInteractionDraftToSource(source, [anchorNode!.path, rectNode!.path], {
      ariaLabel: 'Primary action',
      tabIndex: '0',
      focusable: 'true',
      pointerEvents: 'bounding-box',
      cursor: 'pointer',
      href: 'https://example.com/next',
      target: '_blank',
      rel: 'noopener',
      tooltipText: 'Open next panel',
      hoverPreset: 'lift',
      focusPreset: 'ring',
    });

    expect(result.updatedCount).toBe(2);
    expect(result.source).toContain('data-svg-workbench-interaction="true"');
    expect(result.source).toContain('aria-label="Primary action"');
    expect(result.source).toContain('pointer-events="bounding-box"');
    expect(result.source).toContain('cursor="pointer"');
    expect(result.source).toContain('href="https://example.com/next"');
    expect(result.source).toContain('target="_blank"');
    expect(result.source).toContain('rel="noopener"');
    expect(result.source).toContain('class="svgwb-hover-lift svgwb-focus-ring"');
    expect(result.source).toContain('<title data-svg-workbench-tooltip="true">Open next panel</title>');
    expect(result.source).toContain('<rect width="10" height="10" aria-label="Primary action" tabindex="0" focusable="true" pointer-events="bounding-box" cursor="pointer" class="svgwb-hover-lift svgwb-focus-ring">');

    const updatedAnalysis = buildAnalysis(result.source, 'interaction.svg');
    const updatedAnchorNode = Object.values(updatedAnalysis.nodesById).find((node) => node.name.toLowerCase() === 'a');

    expect(updatedAnchorNode).toBeDefined();
    expect(inferInteractionDraftForPath(result.source, updatedAnchorNode!.path)).toMatchObject({
      tooltipText: 'Open next panel',
      hoverPreset: 'lift',
      focusPreset: 'ring',
    });
  });

  it('summarizes interaction-bearing attributes and href kinds', () => {
    expect(classifyInteractionHref('#panel')).toBe('local');
    expect(classifyInteractionHref('https://example.com')).toBe('external');
    expect(classifyInteractionHref('javascript:alert(1)')).toBe('unsafe');

    expect(getInteractionSignalSummary({
      href: 'https://example.com',
      cursor: 'pointer',
      onclick: 'alert(1)',
      'aria-label': 'Launch',
    })).toMatchObject({
      href: 'https://example.com',
      hrefKind: 'external',
      cursor: 'pointer',
      ariaLabel: 'Launch',
      inlineEventAttributes: ['onclick'],
      tooltipText: null,
      hoverPreset: 'none',
      focusPreset: 'none',
    });
  });

  it('inspects source-backed tooltip and managed behavior presets for a target path', () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg"><style data-svg-workbench-interaction="true">.svgwb-hover-glow:hover { opacity: 0.8; }</style><rect class="svgwb-hover-glow svgwb-focus-glow" width="10" height="10"><title data-svg-workbench-tooltip="true">Inspect me</title></rect></svg>`;
    const analysis = buildAnalysis(source, 'inspect.svg');
    const rectNode = Object.values(analysis.nodesById).find((node) => node.name.toLowerCase() === 'rect');

    expect(rectNode).toBeDefined();
    expect(inspectInteractionForPath(source, rectNode!.path)).toMatchObject({
      tooltipText: 'Inspect me',
      hoverPreset: 'glow',
      focusPreset: 'glow',
      hasManagedStyles: true,
    });
  });
});