import { describe, expect, it } from 'vitest';
import * as opentype from 'opentype.js';
import { buildAnalysis, sanitizeSvgElement } from './svg-analysis';
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
});
