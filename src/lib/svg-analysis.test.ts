import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as opentype from 'opentype.js';
import { buildAnalysis, getChangedPreviewNodePaths, sanitizeSvgElement } from './svg-analysis';
import type { UploadedFontAsset } from './svg-fonts';

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

function createUploadedFontAsset(displayFamilyName = 'Uploaded Workbench'): UploadedFontAsset {
  const path = new opentype.Path();
  path.moveTo(0, 0);
  path.lineTo(500, 0);
  path.lineTo(500, 700);
  path.lineTo(0, 700);
  path.close();

  const font = new opentype.Font({
    familyName: displayFamilyName,
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

  return {
    id: 'uploaded-font-1',
    fileName: 'uploaded-workbench.otf',
    familyName: displayFamilyName,
    font,
  };
}

describe('sanitizeSvgElement', () => {
  it('removes executable content and unsafe attributes from preview markup', () => {
    const documentRoot = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">
        <script>alert(1)</script>
        <foreignObject><div>bad</div></foreignObject>
        <rect onclick="alert(1)" width="10" height="10" />
        <a href="javascript:alert(1)"><circle r="4" /></a>
      </svg>`,
      'image/svg+xml',
    );

    const result = sanitizeSvgElement(documentRoot.documentElement as unknown as SVGSVGElement);

    expect(result.markup).not.toContain('<script');
    expect(result.markup).not.toContain('foreignObject');
    expect(result.markup).not.toContain('onclick=');
    expect(result.markup).not.toContain('javascript:alert');
    expect(result.warnings).toHaveLength(4);
    expect(Object.keys(result.nodesById).length).toBeGreaterThan(1);
  });
});

describe('buildAnalysis', () => {
  it('returns counts, risks, and node summaries for parsed SVG', () => {
    const analysis = buildAnalysis(
      `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50">
        <g transform="translate(10 10)">
          <path d="M0 0H10" stroke="#000" fill="none" />
          <text x="0" y="20">Hello</text>
        </g>
        <style>.foo { fill: red; }</style>
      </svg>`,
      'test.svg',
    );

    expect(analysis.fileName).toBe('test.svg');
    expect(analysis.totalElements).toBeGreaterThanOrEqual(4);
    expect(analysis.tagCounts.path).toBe(1);
    expect(analysis.tagCounts.text).toBe(1);
    expect(analysis.risks.some((risk) => risk.message.includes('Text elements found'))).toBe(true);
    expect(analysis.risks.some((risk) => risk.message.includes('transformed'))).toBe(true);
    expect(analysis.risks.some((risk) => risk.message.includes('Embedded <style>'))).toBe(true);
    expect(analysis.nodesById[analysis.rootNodeId]?.name.toLowerCase()).toBe('svg');
    expect(analysis.opportunities.directTransformCount).toBe(0);
    expect(analysis.opportunities.containerTransformCount).toBe(1);
    expect(analysis.exportReadiness.status).toBe('blocked');
    expect(analysis.exportReadiness.autoFixes.some((item) => item.includes('style rule'))).toBe(true);
    expect(analysis.exportReadiness.blockers.some((item) => item.includes('text element'))).toBe(true);
    expect(analysis.runtimeFeatures.animationElementCount).toBe(0);
    expect(analysis.inventory.styleBlockCount).toBe(1);
  });

  it('attaches preview node targets to risk entries when available', () => {
    const analysis = buildAnalysis(
      '<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="10">Hello</text></svg>',
      'risk-targets.svg',
    );

    const textRisk = analysis.risks.find((risk) => risk.message.includes('Text elements found'));
    expect(textRisk?.nodeIds.length).toBeGreaterThan(0);
    expect(analysis.nodesById[textRisk?.nodeIds[0] ?? '']?.name.toLowerCase()).toBe('text');
  });

  it('detects changed preview node paths across source updates', () => {
    const changedPaths = getChangedPreviewNodePaths(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" /></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H10V10H0Z" /></svg>',
    );

    expect(changedPaths.length).toBeGreaterThan(0);
    expect(changedPaths.some((path) => path === '0.0')).toBe(true);
  });

  it('reports supported and blocked stroke outline readiness separately', () => {
    const analysis = buildAnalysis(
      `<svg xmlns="http://www.w3.org/2000/svg">
        <line x1="0" y1="0" x2="10" y2="0" stroke="#000" stroke-width="4" fill="none" />
        <path d="M0 10H10" stroke="#000" stroke-width="4" fill="none" />
      </svg>`,
      'stroke-outline.svg',
    );

    expect(analysis.opportunities.strokeOutlineCount).toBe(1);
    expect(analysis.opportunities.blockedStrokeOutlineCount).toBe(1);
    expect(analysis.risks.some((risk) => risk.message.includes('can be outlined automatically'))).toBe(true);
    expect(analysis.exportReadiness.autoFixes.some((item) => item.includes('filled outlines'))).toBe(true);
    expect(analysis.exportReadiness.blockers.some((item) => item.includes('complex outline expansion'))).toBe(false);
  });

  it('reports path cleanup as an auto-fixable readiness item', () => {
    const analysis = buildAnalysis(
      `<svg xmlns="http://www.w3.org/2000/svg">
        <path d="M0 0L10 0L0 0.1" fill="none" stroke="#000" />
        <path d="M20 20L30 20" stroke="#000" />
        <path d="M20 20L30 20" stroke="#000" />
        <path d="M40 40" />
      </svg>`,
      'path-cleanup.svg',
    );

    expect(analysis.opportunities.pathCleanupCount).toBe(3);
    expect(analysis.risks.some((risk) => risk.message.includes('path cleanup'))).toBe(true);
    expect(analysis.exportReadiness.autoFixes.some((item) => item.includes('near-open paths'))).toBe(true);
  });

  it('reports broken local refs, invalid chains, and non-link external dependencies as cleanup opportunities', () => {
    const analysis = buildAnalysis(
      `<svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g" xlink:href="#missing" xmlns:xlink="http://www.w3.org/1999/xlink" />
          <linearGradient id="g-chain" xlink:href="#g" xmlns:xlink="http://www.w3.org/1999/xlink" />
        </defs>
        <use href="#g-chain" />
        <image href="https://example.com/asset.png" width="10" height="10" />
        <a href="https://example.com/page"><rect width="10" height="10" /></a>
      </svg>`,
      'reference-cleanup.svg',
    );

    expect(analysis.opportunities.referenceCleanupCount).toBe(4);
    expect(analysis.runtimeFeatures.externalReferenceCount).toBe(2);
    expect(analysis.risks.some((risk) => risk.message.includes('reference cleanup'))).toBe(true);
    expect(analysis.exportReadiness.autoFixes.some((item) => item.includes('invalid href/xlink chains'))).toBe(true);
  });

  it('builds separate workflow readiness profiles for geometry-safe and runtime-preserving SVG', () => {
    const analysis = buildAnalysis(
      `<svg xmlns="http://www.w3.org/2000/svg" baseProfile="tiny">
        <video href="movie.mp4" width="10" height="10" />
        <animate attributeName="x" from="0" to="10" dur="1s" repeatCount="indefinite" />
        <use href="#missing" />
      </svg>`,
      'runtime-profile.svg',
    );

    expect(analysis.workflowReadiness.geometrySafe.status).toBe('blocked');
    expect(analysis.workflowReadiness.geometrySafe.blockers.some((item) => item.includes('media element'))).toBe(true);
    expect(analysis.workflowReadiness.runtimeSvg.status).toBe('repairable');
    expect(analysis.workflowReadiness.runtimeSvg.autoFixes.some((item) => item.includes('broken local ref'))).toBe(true);
    expect(analysis.workflowReadiness.runtimeSvg.strengths.some((item) => item.includes('media element'))).toBe(true);
    expect(analysis.workflowReadiness.runtimeSvg.strengths.some((item) => item.includes('native animation'))).toBe(true);
  });

  it('collects runtime, defs, and authoring metadata inventories', () => {
    const analysis = buildAnalysis(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" baseProfile="tiny">
        <metadata />
        <defs>
          <linearGradient id="g"><stop offset="0%" stop-color="#fff" /></linearGradient>
        </defs>
        <style>.shape { fill: url(#g); }</style>
        <a href="https://example.com/asset">
          <rect inkscape:label="Layer 1" class="shape" width="10" height="10" />
        </a>
      </svg>`,
      'inventory.svg',
    );

    expect(analysis.runtimeFeatures.linkElementCount).toBe(1);
    expect(analysis.runtimeFeatures.externalReferenceCount).toBe(1);
    expect(analysis.runtimeFeatures.baseProfile).toBe('tiny');
    expect(analysis.inventory.defsCount).toBe(1);
    expect(analysis.inventory.linearGradientCount).toBe(1);
    expect(analysis.inventory.stopCount).toBe(1);
    expect(analysis.inventory.styleBlockCount).toBe(1);
    expect(analysis.authoringMetadata.metadataElementCount).toBe(1);
    expect(analysis.authoringMetadata.namespacedAttributeCount).toBeGreaterThan(0);
    expect(analysis.authoringMetadata.namespaceCounts.some((entry) => entry.prefix === 'inkscape')).toBe(true);
  });

  it('marks simple auto-fix-only SVGs as repairable', () => {
    const fontDataUrl = createEmbeddedFontDataUrl();
    const analysis = buildAnalysis(
      `<svg xmlns="http://www.w3.org/2000/svg"><style>@font-face { font-family: 'Workbench Font'; src: url(${fontDataUrl}); }</style><text font-family="Workbench Font" font-size="32" x="0" y="40">A</text></svg>`,
      'repairable.svg',
    );

    expect(analysis.exportReadiness.status).toBe('repairable');
    expect(analysis.exportReadiness.blockerCount).toBe(0);
    expect(analysis.exportReadiness.autoFixCount).toBeGreaterThan(0);
    expect(analysis.opportunities.convertibleTextCount).toBe(1);
  });

  it('marks clean geometry SVGs as ready', () => {
    const analysis = buildAnalysis(
      `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H10" /></svg>`,
      'ready.svg',
    );

    expect(analysis.exportReadiness.status).toBe('ready');
    expect(analysis.exportReadiness.autoFixCount).toBe(0);
    expect(analysis.exportReadiness.blockerCount).toBe(0);
  });

  it('marks mapped uploaded-font text as repairable', () => {
    const uploadedFont = createUploadedFontAsset();
    const analysis = buildAnalysis(
      '<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Missing Font" font-size="32" x="0" y="40">A</text></svg>',
      'mapped-font.svg',
      {
        uploadedFonts: [uploadedFont],
        fontMappings: { 'missing font': uploadedFont.id },
      },
    );

    expect(analysis.exportReadiness.status).toBe('repairable');
    expect(analysis.exportReadiness.blockerCount).toBe(0);
    expect(analysis.opportunities.referencedTextFamilies[0]?.status).toBe('mapped');
  });

  it('throws on invalid svg markup', () => {
    expect(() => buildAnalysis('<svg><g></svg>', 'broken.svg')).toThrow();
  });

  it('characterizes the AJ digital camera fixture', () => {
    const fixture = readFileSync('tests/SVG/AJ_Digital_Camera.svg', 'utf8');
    const analysis = buildAnalysis(fixture, 'AJ_Digital_Camera.svg');

    expect(analysis.totalElements).toBeGreaterThan(200);
    expect(analysis.tagCounts.path).toBeGreaterThan(40);
    expect(analysis.tagCounts.rect).toBeGreaterThan(10);
    expect(analysis.tagCounts.linearGradient).toBeGreaterThan(100);
    expect(analysis.tagCounts.radialGradient).toBeGreaterThan(20);
    expect(analysis.tagCounts.metadata).toBeGreaterThanOrEqual(1);
    expect(analysis.warnings).toHaveLength(0);
    expect(analysis.risks.some((risk) => risk.message.includes('transformed node'))).toBe(true);
    expect(analysis.exportReadiness.status).toBe('repairable');
    expect(analysis.exportReadiness.blockerCount).toBe(0);
    expect(analysis.opportunities.directTransformCount + analysis.opportunities.bakeableContainerTransformCount).toBeGreaterThan(0);
  });

  it('characterizes the video1 fixture as animation and media heavy', () => {
    const fixture = readFileSync('tests/SVG/video1.svg', 'utf8');
    const analysis = buildAnalysis(fixture, 'video1.svg');

    expect(analysis.tagCounts.video).toBe(1);
    expect(analysis.tagCounts.animate).toBeGreaterThanOrEqual(6);
    expect(analysis.tagCounts.animateTransform).toBeGreaterThanOrEqual(7);
    expect(analysis.tagCounts.text).toBeGreaterThanOrEqual(6);
    expect(analysis.risks.some((risk) => risk.message.includes('Native SVG animation elements found'))).toBe(true);
    expect(analysis.risks.some((risk) => risk.message.includes('media element'))).toBe(true);
    expect(analysis.exportReadiness.status).toBe('blocked');
    expect(analysis.exportReadiness.blockers.some((item) => item.includes('media element'))).toBe(true);
    expect(analysis.exportReadiness.blockers.some((item) => item.includes('text element'))).toBe(true);
    expect(analysis.opportunities.primitiveShapeCount).toBeGreaterThan(5);
    expect(analysis.opportunities.blockedTextCount).toBeGreaterThan(0);
    expect(analysis.runtimeFeatures.animationElementCount).toBeGreaterThan(10);
    expect(analysis.runtimeFeatures.mediaElementCount).toBe(1);
    expect(analysis.runtimeFeatures.baseProfile).toBe('tiny');
  });
});
