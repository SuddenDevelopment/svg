import { describe, expect, it } from 'vitest';
import * as opentype from 'opentype.js';
import {
  applySafeRepairs,
  bakeContainerTransforms,
  bakeDirectTransforms,
  convertTextToPaths,
  detectNormalizationOpportunities,
  expandUseElements,
  getContainerTransformMessage,
  getStyleInliningMessage,
  getTextConversionMessage,
  getUseExpansionMessage,
  inlineSimpleStyles,
  normalizeShapesToPaths,
} from './svg-normalization';
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

describe('detectNormalizationOpportunities', () => {
  it('counts primitive shapes and transforms', () => {
    const opportunities = detectNormalizationOpportunities(
      `<svg xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(10 10)">
          <rect width="10" height="10" />
        </g>
        <circle transform="translate(5 0)" cx="5" cy="5" r="3" />
      </svg>`,
    );

    expect(opportunities.primitiveShapeCount).toBe(2);
    expect(opportunities.convertibleTextCount).toBe(0);
    expect(opportunities.blockedTextCount).toBe(0);
    expect(opportunities.directTransformCount).toBe(1);
    expect(opportunities.containerTransformCount).toBe(1);
    expect(opportunities.bakeableContainerTransformCount).toBe(1);
    expect(opportunities.blockedContainerTransformCount).toBe(0);
    expect(opportunities.expandableUseCount).toBe(0);
    expect(opportunities.blockedUseCount).toBe(0);
    expect(opportunities.inlineableStyleRuleCount).toBe(0);
    expect(opportunities.blockedStyleRuleCount).toBe(0);
  });

  it('marks transformed containers with unsupported descendants as blocked', () => {
    const opportunities = detectNormalizationOpportunities(
      `<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(10 10)"><text x="0" y="10">Hello</text></g></svg>`,
    );

    expect(opportunities.containerTransformCount).toBe(1);
    expect(opportunities.bakeableContainerTransformCount).toBe(0);
    expect(opportunities.blockedContainerTransformCount).toBe(1);
  });

  it('counts expandable and blocked use references', () => {
    const opportunities = detectNormalizationOpportunities(
      `<svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <g id="shape"><rect width="10" height="10" /></g>
          <g id="label"><text x="0" y="10">Hello</text></g>
        </defs>
        <use href="#shape" />
        <use href="#label" />
      </svg>`,
    );

    expect(opportunities.expandableUseCount).toBe(1);
    expect(opportunities.blockedUseCount).toBe(1);
  });

  it('counts inlineable and blocked style rules', () => {
    const opportunities = detectNormalizationOpportunities(
      `<svg xmlns="http://www.w3.org/2000/svg">
        <style>
          .shape { fill: red; stroke: blue; }
          g .nested { opacity: 0.5; }
        </style>
        <rect class="shape" width="10" height="10" />
      </svg>`,
    );

    expect(opportunities.inlineableStyleRuleCount).toBe(1);
    expect(opportunities.blockedStyleRuleCount).toBe(1);
  });

  it('counts convertible and blocked text elements', () => {
    const fontDataUrl = createEmbeddedFontDataUrl();
    const opportunities = detectNormalizationOpportunities(
      `<svg xmlns="http://www.w3.org/2000/svg"><style>@font-face { font-family: 'Workbench Font'; src: url(${fontDataUrl}); }</style><text font-family="Workbench Font" font-size="32" x="0" y="40">A</text><text x="0" y="90">B</text></svg>`,
    );

    expect(opportunities.convertibleTextCount).toBe(1);
    expect(opportunities.blockedTextCount).toBe(1);
  });

  it('treats mapped uploaded fonts as convertible text', () => {
    const uploadedFont = createUploadedFontAsset();
    const opportunities = detectNormalizationOpportunities(
      `<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Missing Font" font-size="32" x="0" y="40">A</text></svg>`,
      {
        uploadedFonts: [uploadedFont],
        fontMappings: { 'missing font': uploadedFont.id },
      },
    );

    expect(opportunities.convertibleTextCount).toBe(1);
    expect(opportunities.blockedTextCount).toBe(0);
    expect(opportunities.referencedTextFamilies[0]?.status).toBe('mapped');
  });
});

describe('normalizeShapesToPaths', () => {
  it('converts primitives to path elements', () => {
    const result = normalizeShapesToPaths(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect x="1" y="2" width="10" height="20" fill="red" /></svg>`,
    );

    expect(result.changed).toBe(1);
    expect(result.source).toContain('<path');
    expect(result.source).toContain('fill="red"');
    expect(result.source).not.toContain('<rect');
  });
});

describe('bakeDirectTransforms', () => {
  it('bakes a direct translate transform into path geometry', () => {
    const result = bakeDirectTransforms(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="10" transform="translate(5 7)" /></svg>`,
    );

    expect(result.changed).toBe(1);
    expect(result.source).toContain('<path');
    expect(result.source).toContain('M5 7H15V17H5z');
    expect(result.source).not.toContain('transform=');
  });
});

describe('getContainerTransformMessage', () => {
  it('returns a useful message for remaining group transforms', () => {
    expect(getContainerTransformMessage(1, 2)).toContain('1 transformed container can be baked safely. 2 remain blocked');
  });
});

describe('getUseExpansionMessage', () => {
  it('returns a useful message for use expansion status', () => {
    expect(getUseExpansionMessage(1, 2)).toContain('1 <use> reference can be expanded into concrete geometry. 2 remain blocked');
  });
});

describe('getStyleInliningMessage', () => {
  it('returns a useful message for style inlining status', () => {
    expect(getStyleInliningMessage(1, 2)).toContain('1 simple style rule can be inlined safely. 2 remain blocked');
  });
});

describe('getTextConversionMessage', () => {
  it('returns a useful message for text conversion status', () => {
    expect(getTextConversionMessage(1, 2)).toContain('1 text element can be converted to paths. 2 remain blocked');
  });
});

describe('bakeContainerTransforms', () => {
  it('bakes a translated group into descendant geometry', () => {
    const result = bakeContainerTransforms(
      `<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(5 7)"><rect x="0" y="0" width="10" height="10" /></g></svg>`,
    );

    expect(result.changed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.source).toContain('M5 7H15V17H5z');
    expect(result.source).not.toContain('<g transform=');
  });

  it('skips transformed groups with unsupported descendants', () => {
    const result = bakeContainerTransforms(
      `<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(5 7)"><text x="0" y="10">Hello</text></g></svg>`,
    );

    expect(result.changed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.source).toContain('<g transform="translate(5 7)">');
  });
});

describe('expandUseElements', () => {
  it('expands a use reference into baked geometry', () => {
    const result = expandUseElements(
      `<svg xmlns="http://www.w3.org/2000/svg"><defs><rect id="shape" x="0" y="0" width="10" height="10" /></defs><use href="#shape" x="5" y="7" fill="red" /></svg>`,
    );

    expect(result.changed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.source).toContain('<path');
    expect(result.source).toContain('M5 7H15V17H5z');
    expect(result.source).toContain('fill="red"');
    expect(result.source).not.toContain('<use');
  });

  it('expands a use reference that targets a safe container', () => {
    const result = expandUseElements(
      `<svg xmlns="http://www.w3.org/2000/svg"><defs><g id="shape"><rect width="10" height="10" /></g></defs><use href="#shape" x="5" y="7" /></svg>`,
    );

    expect(result.changed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.source).toContain('M5 7H15V17H5z');
    expect(result.source).not.toContain('<use');
  });

  it('skips unsupported use targets', () => {
    const result = expandUseElements(
      `<svg xmlns="http://www.w3.org/2000/svg"><defs><g id="label"><text x="0" y="10">Hello</text></g></defs><use href="#label" /></svg>`,
    );

    expect(result.changed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.source).toContain('<use href="#label"/>');
  });
});

describe('inlineSimpleStyles', () => {
  it('inlines simple style rules into matching elements', () => {
    const result = inlineSimpleStyles(
      `<svg xmlns="http://www.w3.org/2000/svg"><style>.shape { fill: red; stroke: blue; }</style><rect class="shape" width="10" height="10" /></svg>`,
    );

    expect(result.changed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.source).toContain('style="fill: red; stroke: blue"');
    expect(result.source).not.toContain('<style>');
  });

  it('leaves blocked style rules in place', () => {
    const result = inlineSimpleStyles(
      `<svg xmlns="http://www.w3.org/2000/svg"><style>.shape { fill: red; } g .nested { opacity: 0.5; }</style><rect class="shape" width="10" height="10" /></svg>`,
    );

    expect(result.changed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.source).toContain('style="fill: red"');
    expect(result.source).toContain('g .nested');
  });
});

describe('convertTextToPaths', () => {
  it('converts text with an embedded font to path geometry', () => {
    const fontDataUrl = createEmbeddedFontDataUrl();
    const result = convertTextToPaths(
      `<svg xmlns="http://www.w3.org/2000/svg"><style>@font-face { font-family: 'Workbench Font'; src: url(${fontDataUrl}); }</style><text font-family="Workbench Font" font-size="32" x="10" y="40" fill="red">A</text></svg>`,
    );

    expect(result.changed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.source).toContain('<path');
    expect(result.source).toContain('fill="red"');
    expect(result.source).not.toContain('<text');
  });

  it('leaves text blocked when no embedded font is available', () => {
    const result = convertTextToPaths('<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="20">A</text></svg>');

    expect(result.changed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.source).toContain('<text');
  });

  it('converts text with a mapped uploaded font', () => {
    const uploadedFont = createUploadedFontAsset();
    const result = convertTextToPaths(
      '<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Missing Font" font-size="32" x="10" y="40">A</text></svg>',
      {
        uploadedFonts: [uploadedFont],
        fontMappings: { 'missing font': uploadedFont.id },
      },
    );

    expect(result.changed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.source).toContain('<path');
    expect(result.source).not.toContain('<text');
  });
});

describe('applySafeRepairs', () => {
  it('chains the safe repair steps into one output', () => {
    const fontDataUrl = createEmbeddedFontDataUrl();
    const result = applySafeRepairs(
      `<svg xmlns="http://www.w3.org/2000/svg">
        <style>@font-face { font-family: 'Workbench Font'; src: url(${fontDataUrl}); } .shape { fill: red; }</style>
        <defs>
          <rect id="shape" class="shape" width="10" height="10" transform="translate(1 2)" />
        </defs>
        <g transform="translate(3 4)">
          <rect x="0" y="0" width="5" height="6" />
        </g>
        <text font-family="Workbench Font" font-size="32" x="0" y="40">A</text>
        <use href="#shape" x="5" y="7" />
      </svg>`,
    );

    expect(result.changed).toBe(7);
    expect(result.skipped).toBe(0);
    expect(result.details.styleRules).toBe(1);
    expect(result.details.textPaths).toBe(1);
    expect(result.details.shapes).toBe(2);
    expect(result.details.directTransforms).toBe(1);
    expect(result.details.containerTransforms).toBe(1);
    expect(result.details.useExpansions).toBe(1);
    expect(result.source).not.toContain('<rect');
    expect(result.source).not.toContain('<text');
    expect(result.source).toContain('@font-face');
    expect(result.source).not.toContain('.shape');
    expect(result.source).not.toContain('<use');
    expect(result.source).not.toContain('transform=');
  });

  it('reports blocked repairs without corrupting the source', () => {
    const result = applySafeRepairs(
      `<svg xmlns="http://www.w3.org/2000/svg">
        <defs><g id="label"><text x="0" y="10">Hello</text></g></defs>
        <g transform="translate(1 2)"><text x="0" y="10">World</text></g>
        <use href="#label" />
      </svg>`,
    );

    expect(result.changed).toBe(0);
  expect(result.skipped).toBe(4);
  expect(result.details.blockedTexts).toBe(2);
    expect(result.details.blockedContainers).toBe(1);
    expect(result.details.blockedUses).toBe(1);
    expect(result.source).toContain('<text');
    expect(result.source).toContain('<use href="#label"/>');
  });
});
