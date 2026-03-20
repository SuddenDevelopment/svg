import { generate as generateCss, parse as parseCss } from 'css-tree';
import type { CssNode } from 'css-tree';
import * as opentype from 'opentype.js';
import { normalizeFontFamilyName } from './svg-fonts';
import type { TextConversionOptions, UploadedFontAsset } from './svg-fonts';
import { SVGPathData } from 'svg-pathdata';

export type NormalizationOpportunities = {
  primitiveShapeCount: number;
  convertibleTextCount: number;
  blockedTextCount: number;
  referencedTextFamilies: Array<{
    key: string;
    label: string;
    usageCount: number;
    status: 'embedded' | 'uploaded' | 'mapped' | 'blocked';
    matchedFontId: string | null;
    matchedFontFamily: string | null;
  }>;
  directTransformCount: number;
  containerTransformCount: number;
  bakeableContainerTransformCount: number;
  blockedContainerTransformCount: number;
  expandableUseCount: number;
  blockedUseCount: number;
  inlineableStyleRuleCount: number;
  blockedStyleRuleCount: number;
};

export type NormalizationResult = {
  source: string;
  changed: number;
  skipped: number;
};

export type SafeRepairResult = {
  source: string;
  changed: number;
  skipped: number;
  details: {
    styleRules: number;
    textPaths: number;
    shapes: number;
    directTransforms: number;
    containerTransforms: number;
    useExpansions: number;
    blockedStyleRules: number;
    blockedTexts: number;
    blockedContainers: number;
    blockedUses: number;
  };
};

type Matrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

type Specificity = [number, number, number];

type InlineableStyleRule = {
  selectors: Array<{
    selector: string;
    specificity: Specificity;
  }>;
  declarations: Array<{
    property: string;
    value: string;
  }>;
};

type ParsedStyleElement = {
  element: Element;
  inlineableRules: InlineableStyleRule[];
  retainedCss: string[];
  blockedRules: string[];
};

type TextConversionContext = {
  embeddedFonts: Map<string, opentype.Font>;
  uploadedFontsById: Map<string, UploadedFontAsset>;
  uploadedFontsByFamily: Map<string, UploadedFontAsset>;
  fontMappings: Record<string, string>;
};

type TextConversionInfo = {
  text: string;
  font: opentype.Font;
  fontSize: number;
  x: number;
  y: number;
  textAnchor: 'start' | 'middle' | 'end';
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const primitiveTags = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const transformableTags = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const containerTags = new Set(['g', 'svg', 'defs', 'symbol']);
const nonVisualTags = new Set(['title', 'desc', 'metadata']);
const transformedContainerSelector = 'g[transform], svg[transform], defs[transform], symbol[transform]';
const useAttributeOmissions = new Set(['href', 'xlink:href', 'x', 'y', 'width', 'height', 'transform', 'id']);
const simpleSelectorPattern = /^(?:[a-zA-Z_][\w-]*)?(?:[#.][\w-]+)+$|^(?:[a-zA-Z_][\w-]*)$|^(?:[#.][\w-]+)+$/;
const textAttributeOmissions = new Set([
  'x',
  'y',
  'dx',
  'dy',
  'rotate',
  'textLength',
  'lengthAdjust',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'alignment-baseline',
  'baseline-shift',
  'letter-spacing',
  'word-spacing',
  'inline-size',
  'shape-inside',
]);

function parseSvgRoot(source: string) {
  const documentRoot = new DOMParser().parseFromString(source, 'image/svg+xml');
  const parserError = documentRoot.querySelector('parsererror');
  if (parserError) {
    throw new Error(parserError.textContent?.trim() || 'Unable to parse SVG markup.');
  }

  const root = documentRoot.documentElement;
  if (root.tagName.toLowerCase() !== 'svg') {
    throw new Error('The provided markup does not have an <svg> root element.');
  }

  return root as unknown as SVGSVGElement;
}

function serializeSvg(svgRoot: SVGSVGElement) {
  return new XMLSerializer().serializeToString(svgRoot);
}

function parseNumber(value: string | null, fallback = 0) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseStyleAttribute(styleValue: string | null) {
  const declarations = new Map<string, string>();
  if (!styleValue) {
    return declarations;
  }

  styleValue.split(';').forEach((chunk) => {
    const [rawName, ...rawValue] = chunk.split(':');
    const name = rawName?.trim().toLowerCase();
    const value = rawValue.join(':').trim();
    if (name && value) {
      declarations.set(name, value);
    }
  });

  return declarations;
}

function decodeBase64DataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:[^;,]+(?:;charset=[^;,]+)?;base64,([a-z0-9+/=]+)$/i);
  if (!match) {
    return null;
  }

  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function parsePoints(value: string | null) {
  if (!value) {
    return [] as Array<[number, number]>;
  }

  const matches = value.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const points: Array<[number, number]> = [];

  for (let index = 0; index < matches.length; index += 2) {
    const x = Number.parseFloat(matches[index] ?? '0');
    const y = Number.parseFloat(matches[index + 1] ?? '0');
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push([x, y]);
    }
  }

  return points;
}

function clampRadius(radius: number, limit: number) {
  return Math.max(0, Math.min(radius, limit));
}

function rectToPath(element: Element) {
  const x = parseNumber(element.getAttribute('x'));
  const y = parseNumber(element.getAttribute('y'));
  const width = Math.max(0, parseNumber(element.getAttribute('width')));
  const height = Math.max(0, parseNumber(element.getAttribute('height')));
  const rawRx = element.getAttribute('rx');
  const rawRy = element.getAttribute('ry');
  const rx = clampRadius(parseNumber(rawRx, rawRy ? parseNumber(rawRy) : 0), width / 2);
  const ry = clampRadius(parseNumber(rawRy, rawRx ? parseNumber(rawRx) : 0), height / 2);

  if (!rx && !ry) {
    return `M${x} ${y}H${x + width}V${y + height}H${x}Z`;
  }

  return [
    `M${x + rx} ${y}`,
    `H${x + width - rx}`,
    `A${rx} ${ry} 0 0 1 ${x + width} ${y + ry}`,
    `V${y + height - ry}`,
    `A${rx} ${ry} 0 0 1 ${x + width - rx} ${y + height}`,
    `H${x + rx}`,
    `A${rx} ${ry} 0 0 1 ${x} ${y + height - ry}`,
    `V${y + ry}`,
    `A${rx} ${ry} 0 0 1 ${x + rx} ${y}`,
    'Z',
  ].join(' ');
}

function circleToPath(element: Element) {
  const cx = parseNumber(element.getAttribute('cx'));
  const cy = parseNumber(element.getAttribute('cy'));
  const r = Math.max(0, parseNumber(element.getAttribute('r')));

  return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
}

function ellipseToPath(element: Element) {
  const cx = parseNumber(element.getAttribute('cx'));
  const cy = parseNumber(element.getAttribute('cy'));
  const rx = Math.max(0, parseNumber(element.getAttribute('rx')));
  const ry = Math.max(0, parseNumber(element.getAttribute('ry')));

  return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
}

function lineToPath(element: Element) {
  const x1 = parseNumber(element.getAttribute('x1'));
  const y1 = parseNumber(element.getAttribute('y1'));
  const x2 = parseNumber(element.getAttribute('x2'));
  const y2 = parseNumber(element.getAttribute('y2'));

  return `M${x1} ${y1}L${x2} ${y2}`;
}

function polyPointsToPath(element: Element, closePath: boolean) {
  const points = parsePoints(element.getAttribute('points'));
  if (points.length === 0) {
    return '';
  }

  const [first, ...rest] = points;
  const commands = [`M${first[0]} ${first[1]}`];
  rest.forEach(([x, y]) => {
    commands.push(`L${x} ${y}`);
  });
  if (closePath) {
    commands.push('Z');
  }
  return commands.join(' ');
}

function elementToPathData(element: Element) {
  switch (element.tagName.toLowerCase()) {
    case 'path':
      return element.getAttribute('d') ?? '';
    case 'rect':
      return rectToPath(element);
    case 'circle':
      return circleToPath(element);
    case 'ellipse':
      return ellipseToPath(element);
    case 'line':
      return lineToPath(element);
    case 'polyline':
      return polyPointsToPath(element, false);
    case 'polygon':
      return polyPointsToPath(element, true);
    default:
      return '';
  }
}

function geometryAttributeNames(tagName: string) {
  switch (tagName) {
    case 'rect':
      return new Set(['x', 'y', 'width', 'height', 'rx', 'ry']);
    case 'circle':
      return new Set(['cx', 'cy', 'r']);
    case 'ellipse':
      return new Set(['cx', 'cy', 'rx', 'ry']);
    case 'line':
      return new Set(['x1', 'y1', 'x2', 'y2']);
    case 'polyline':
    case 'polygon':
      return new Set(['points']);
    case 'path':
      return new Set(['d']);
    default:
      return new Set<string>();
  }
}

function copyAttributes(source: Element, target: Element, omitNames: Set<string>) {
  Array.from(source.attributes).forEach((attribute) => {
    if (!omitNames.has(attribute.name)) {
      target.setAttribute(attribute.name, attribute.value);
    }
  });
}

function identityMatrix(): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function multiplyMatrix(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function rotateMatrix(angleDeg: number, cx = 0, cy = 0): Matrix {
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: cx - cx * cos + cy * sin,
    f: cy - cx * sin - cy * cos,
  };
}

function parseTransformMatrix(transformValue: string | null) {
  if (!transformValue) {
    return identityMatrix();
  }

  const transformPattern = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;
  let current = identityMatrix();
  let match: RegExpExecArray | null;

  while ((match = transformPattern.exec(transformValue)) !== null) {
    const [, type, rawArgs] = match;
    const args = (rawArgs.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map((value) => Number.parseFloat(value));
    let next = identityMatrix();

    switch (type) {
      case 'matrix':
        next = {
          a: args[0] ?? 1,
          b: args[1] ?? 0,
          c: args[2] ?? 0,
          d: args[3] ?? 1,
          e: args[4] ?? 0,
          f: args[5] ?? 0,
        };
        break;
      case 'translate':
        next = { a: 1, b: 0, c: 0, d: 1, e: args[0] ?? 0, f: args[1] ?? 0 };
        break;
      case 'scale':
        next = { a: args[0] ?? 1, b: 0, c: 0, d: args[1] ?? args[0] ?? 1, e: 0, f: 0 };
        break;
      case 'rotate':
        next = rotateMatrix(args[0] ?? 0, args[1] ?? 0, args[2] ?? 0);
        break;
      case 'skewX': {
        const angle = Math.tan(((args[0] ?? 0) * Math.PI) / 180);
        next = { a: 1, b: 0, c: angle, d: 1, e: 0, f: 0 };
        break;
      }
      case 'skewY': {
        const angle = Math.tan(((args[0] ?? 0) * Math.PI) / 180);
        next = { a: 1, b: angle, c: 0, d: 1, e: 0, f: 0 };
        break;
      }
    }

    current = multiplyMatrix(current, next);
  }

  return current;
}

function isIdentityMatrix(matrix: Matrix) {
  return matrix.a === 1 && matrix.b === 0 && matrix.c === 0 && matrix.d === 1 && matrix.e === 0 && matrix.f === 0;
}

function createPathReplacement(element: Element, pathData: string, omitTransform: boolean) {
  const pathElement = document.createElementNS(SVG_NS, 'path');
  const omitNames = geometryAttributeNames(element.tagName.toLowerCase());
  if (omitTransform) {
    omitNames.add('transform');
  }
  copyAttributes(element, pathElement, omitNames);
  pathElement.setAttribute('d', pathData);
  return pathElement;
}

function transformPathData(pathData: string, matrix: Matrix) {
  return new SVGPathData(pathData)
    .toAbs()
    .matrix(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f)
    .encode();
}

function listToArray(list: { toArray?: () => unknown[] } | null | undefined) {
  if (!list || typeof list.toArray !== 'function') {
    return [] as unknown[];
  }

  return list.toArray();
}

function isInlineableSelector(selector: string) {
  if (!selector || /[\s>+~:[\],]/.test(selector)) {
    return false;
  }

  return simpleSelectorPattern.test(selector);
}

function getSelectorSpecificity(selector: string): Specificity {
  const idCount = (selector.match(/#/g) ?? []).length;
  const classCount = (selector.match(/\./g) ?? []).length;
  const tagCount = /^[a-zA-Z_][\w-]*/.test(selector) ? 1 : 0;
  return [idCount, classCount, tagCount];
}

function compareSpecificity(left: Specificity, right: Specificity) {
  if (left[0] !== right[0]) {
    return left[0] - right[0];
  }

  if (left[1] !== right[1]) {
    return left[1] - right[1];
  }

  return left[2] - right[2];
}

function parseStyleElement(styleElement: Element): ParsedStyleElement {
  const styleText = styleElement.textContent?.trim() ?? '';
  if (!styleText) {
    return {
      element: styleElement,
      inlineableRules: [],
      retainedCss: [],
      blockedRules: [],
    };
  }

  try {
    const stylesheet = parseCss(styleText, { context: 'stylesheet' }) as { children?: { toArray?: () => unknown[] } };
    const inlineableRules: InlineableStyleRule[] = [];
    const retainedCss: string[] = [];
    const blockedRules: string[] = [];

    listToArray(stylesheet.children).forEach((childNode) => {
      const child = childNode as {
        type?: string;
        name?: string;
        prelude?: { type?: string; children?: { toArray?: () => unknown[] } };
        block?: { type?: string; children?: { toArray?: () => unknown[] } };
      };

      if (child.type === 'Atrule' && child.name?.toLowerCase() === 'font-face') {
        retainedCss.push(generateCss(childNode as CssNode));
        return;
      }

      if (child.type !== 'Rule' || child.prelude?.type !== 'SelectorList' || child.block?.type !== 'Block') {
        blockedRules.push(generateCss(childNode as CssNode));
        return;
      }

      const selectors = listToArray(child.prelude.children)
        .map((selectorNode) => generateCss(selectorNode as CssNode).trim())
        .filter(Boolean);

      const declarationNodes = listToArray(child.block.children);
      const declarations = declarationNodes
        .filter((node) => (node as { type?: string }).type === 'Declaration')
        .map((node) => {
          const declaration = node as { property: string; value: unknown };
          return {
            property: declaration.property,
            value: generateCss(declaration.value as CssNode).trim(),
          };
        })
        .filter((declaration) => declaration.property && declaration.value);

      const hasOnlyDeclarations = declarations.length > 0 && declarations.length === declarationNodes.length;

      if (!hasOnlyDeclarations || selectors.length === 0 || selectors.some((selector) => !isInlineableSelector(selector))) {
        blockedRules.push(generateCss(childNode as CssNode));
        return;
      }

      inlineableRules.push({
        selectors: selectors.map((selector) => ({
          selector,
          specificity: getSelectorSpecificity(selector),
        })),
        declarations,
      });
    });

    return {
      element: styleElement,
      inlineableRules,
      retainedCss,
      blockedRules,
    };
  } catch {
    return {
      element: styleElement,
      inlineableRules: [],
      retainedCss: [],
      blockedRules: [styleText],
    };
  }
}

function parseEmbeddedFonts(root: SVGSVGElement) {
  const embeddedFonts = new Map<string, opentype.Font>();

  Array.from(root.querySelectorAll('style')).forEach((styleElement) => {
    const styleText = styleElement.textContent ?? '';
    const fontFacePattern = /@font-face\s*{([\s\S]*?)}/gi;
    let match: RegExpExecArray | null;

    while ((match = fontFacePattern.exec(styleText)) !== null) {
      const body = match[1];
      const familyMatch = body.match(/font-family\s*:\s*([^;]+);?/i);
      const dataUrlMatch = body.match(/src\s*:\s*[^;]*url\((['"]?)(data:[^'")]+)\1\)/i);
      const familyName = normalizeFontFamilyName(familyMatch?.[1] ?? null);
      const dataUrl = dataUrlMatch?.[2];

      if (!familyName || !dataUrl || embeddedFonts.has(familyName)) {
        continue;
      }

      const fontBuffer = decodeBase64DataUrl(dataUrl);
      if (!fontBuffer) {
        continue;
      }

      try {
        embeddedFonts.set(familyName, opentype.parse(fontBuffer));
      } catch {
        continue;
      }
    }
  });

  return embeddedFonts;
}

function getPresentationValue(element: Element, propertyName: string) {
  let current: Element | null = element;
  const normalizedProperty = propertyName.toLowerCase();

  while (current) {
    const attributeValue = current.getAttribute(propertyName);
    if (attributeValue) {
      return attributeValue;
    }

    const styleValue = parseStyleAttribute(current.getAttribute('style')).get(normalizedProperty);
    if (styleValue) {
      return styleValue;
    }

    current = current.parentElement;
  }

  return null;
}

function getTextConversionContextWithOptions(root: SVGSVGElement, options: TextConversionOptions): TextConversionContext {
  const uploadedFontsById = new Map<string, UploadedFontAsset>();
  const uploadedFontsByFamily = new Map<string, UploadedFontAsset>();

  (options.uploadedFonts ?? []).forEach((fontAsset) => {
    uploadedFontsById.set(fontAsset.id, fontAsset);
    const familyKey = normalizeFontFamilyName(fontAsset.familyName);
    if (familyKey && !uploadedFontsByFamily.has(familyKey)) {
      uploadedFontsByFamily.set(familyKey, fontAsset);
    }
  });

  return {
    embeddedFonts: parseEmbeddedFonts(root),
    uploadedFontsById,
    uploadedFontsByFamily,
    fontMappings: options.fontMappings ?? {},
  };
}

function getRequestedFontFamily(textElement: Element) {
  const requestedFamily = getPresentationValue(textElement, 'font-family');

  return {
    key: normalizeFontFamilyName(requestedFamily),
    label: requestedFamily?.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') || 'Unspecified font',
  };
}

function getResolvedFont(key: string, context: TextConversionContext) {
  if (!key) {
    return { font: undefined, status: 'blocked' as const, matchedFontId: null, matchedFontFamily: null };
  }

  const embeddedFont = context.embeddedFonts.get(key);
  if (embeddedFont) {
    return { font: embeddedFont, status: 'embedded' as const, matchedFontId: null, matchedFontFamily: null };
  }

  const mappedFontId = context.fontMappings[key];
  const mappedFont = mappedFontId ? context.uploadedFontsById.get(mappedFontId) : undefined;
  if (mappedFont) {
    return {
      font: mappedFont.font,
      status: 'mapped' as const,
      matchedFontId: mappedFont.id,
      matchedFontFamily: mappedFont.familyName,
    };
  }

  const matchingUpload = context.uploadedFontsByFamily.get(key);
  if (matchingUpload) {
    return {
      font: matchingUpload.font,
      status: 'uploaded' as const,
      matchedFontId: matchingUpload.id,
      matchedFontFamily: matchingUpload.familyName,
    };
  }

  return { font: undefined, status: 'blocked' as const, matchedFontId: null, matchedFontFamily: null };
}

function getTextConversionInfo(textElement: Element, context: TextConversionContext): TextConversionInfo | null {
  if (textElement.children.length > 0) {
    return null;
  }

  const text = (textElement.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return null;
  }

  const requestedFamily = getRequestedFontFamily(textElement);
  const font = getResolvedFont(requestedFamily.key, context).font;
  if (!font) {
    return null;
  }

  const fontSize = parseNumber(getPresentationValue(textElement, 'font-size'), 16);
  const rawAnchor = (getPresentationValue(textElement, 'text-anchor') ?? 'start').trim().toLowerCase();
  const textAnchor: 'start' | 'middle' | 'end' = rawAnchor === 'middle' || rawAnchor === 'end' ? rawAnchor : 'start';

  return {
    text,
    font,
    fontSize,
    x: parseNumber(textElement.getAttribute('x')),
    y: parseNumber(textElement.getAttribute('y')),
    textAnchor,
  };
}

function getTextAnchorOffset(font: opentype.Font, text: string, fontSize: number, textAnchor: 'start' | 'middle' | 'end') {
  const advanceWidth = font.getAdvanceWidth(text, fontSize, { kerning: true });

  if (textAnchor === 'middle') {
    return advanceWidth / 2;
  }

  if (textAnchor === 'end') {
    return advanceWidth;
  }

  return 0;
}

function createTextPathReplacement(textElement: Element, pathData: string) {
  const pathElement = document.createElementNS(SVG_NS, 'path');
  copyAttributes(textElement, pathElement, textAttributeOmissions);
  pathElement.setAttribute('d', pathData);
  return pathElement;
}

function getTextConversionOpportunitiesWithOptions(root: SVGSVGElement, options: TextConversionOptions) {
  const context = getTextConversionContextWithOptions(root, options);
  let convertibleTextCount = 0;
  let blockedTextCount = 0;
  const familyUsage = new Map<string, {
    key: string;
    label: string;
    usageCount: number;
    status: 'embedded' | 'uploaded' | 'mapped' | 'blocked';
    matchedFontId: string | null;
    matchedFontFamily: string | null;
  }>();

  Array.from(root.querySelectorAll('text')).forEach((textElement) => {
    const requestedFamily = getRequestedFontFamily(textElement);
    if (requestedFamily.key) {
      const resolvedFont = getResolvedFont(requestedFamily.key, context);
      const current = familyUsage.get(requestedFamily.key);
      familyUsage.set(requestedFamily.key, {
        key: requestedFamily.key,
        label: current?.label ?? requestedFamily.label,
        usageCount: (current?.usageCount ?? 0) + 1,
        status: current?.status === 'blocked' && resolvedFont.status !== 'blocked' ? resolvedFont.status : (current?.status ?? resolvedFont.status),
        matchedFontId: resolvedFont.matchedFontId,
        matchedFontFamily: resolvedFont.matchedFontFamily,
      });
    }

    if (getTextConversionInfo(textElement, context)) {
      convertibleTextCount += 1;
    } else {
      blockedTextCount += 1;
    }
  });

  return {
    context,
    convertibleTextCount,
    blockedTextCount,
    referencedTextFamilies: Array.from(familyUsage.values()).sort((left, right) => left.label.localeCompare(right.label)),
  };
}

function translateMatrix(x: number, y: number): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
}

function getUseReference(useElement: Element, root: SVGSVGElement) {
  const href = useElement.getAttribute('href') ?? useElement.getAttribute('xlink:href');
  if (!href?.startsWith('#')) {
    return null;
  }

  const referenceId = href.slice(1);
  return root.ownerDocument.getElementById(referenceId);
}

function getUseMatrix(useElement: Element) {
  const x = parseNumber(useElement.getAttribute('x'));
  const y = parseNumber(useElement.getAttribute('y'));
  const baseMatrix = translateMatrix(x, y);
  return multiplyMatrix(baseMatrix, parseTransformMatrix(useElement.getAttribute('transform')));
}

function copyUseAttributes(useElement: Element, target: Element) {
  Array.from(useElement.attributes).forEach((attribute) => {
    if (!useAttributeOmissions.has(attribute.name)) {
      target.setAttribute(attribute.name, attribute.value);
    }
  });
  target.removeAttribute('id');
}

function createUseContainerClone(reference: Element) {
  if (reference.tagName.toLowerCase() === 'symbol') {
    const group = document.createElementNS(SVG_NS, 'g');
    Array.from(reference.attributes).forEach((attribute) => {
      if (attribute.name !== 'id' && attribute.name !== 'viewBox' && attribute.name !== 'preserveAspectRatio') {
        group.setAttribute(attribute.name, attribute.value);
      }
    });
    Array.from(reference.childNodes).forEach((child) => {
      group.appendChild(child.cloneNode(true));
    });
    return group;
  }

  return reference.cloneNode(true) as Element;
}

function isExpandableUseReference(reference: Element | null, textContext?: TextConversionContext) {
  if (!reference) {
    return false;
  }

  const tagName = reference.tagName.toLowerCase();
  if (transformableTags.has(tagName)) {
    return true;
  }

  if (tagName === 'text') {
    return Boolean(textContext && getTextConversionInfo(reference, textContext));
  }

  if (tagName === 'g' || tagName === 'symbol') {
    return isBakeableContainer(reference, textContext);
  }

  return false;
}

function isBakeableContainer(container: Element, textContext?: TextConversionContext) {
  return !Array.from(container.querySelectorAll('*')).some((element) => {
    const tagName = element.tagName.toLowerCase();

    if (transformableTags.has(tagName) || containerTags.has(tagName) || nonVisualTags.has(tagName)) {
      return false;
    }

    if (tagName === 'text') {
      return !(textContext && getTextConversionInfo(element, textContext));
    }

    return true;
  });
}

function getStyleRuleOpportunities(root: SVGSVGElement) {
  const styleElements = Array.from(root.querySelectorAll('style'));
  const parsedStyles = styleElements.map((styleElement) => parseStyleElement(styleElement));

  return {
    parsedStyles,
    inlineableStyleRuleCount: parsedStyles.reduce((count, styleEntry) => count + styleEntry.inlineableRules.length, 0),
    blockedStyleRuleCount: parsedStyles.reduce((count, styleEntry) => count + styleEntry.blockedRules.length, 0),
  };
}

function bakeContainerGeometry(container: Element, inheritedMatrix: Matrix) {
  let changed = 0;

  Array.from(container.children).forEach((childNode) => {
    const child = childNode as Element;
    const tagName = child.tagName.toLowerCase();
    const childMatrix = multiplyMatrix(inheritedMatrix, parseTransformMatrix(child.getAttribute('transform')));

    if (transformableTags.has(tagName)) {
      const pathData = elementToPathData(child);
      if (!pathData) {
        return;
      }

      const transformedPath = transformPathData(pathData, childMatrix);
      const pathElement = createPathReplacement(child, transformedPath, true);
      child.replaceWith(pathElement);
      changed += 1;
      return;
    }

    if (containerTags.has(tagName)) {
      changed += bakeContainerGeometry(child, childMatrix);
      child.removeAttribute('transform');
    }
  });

  return changed;
}

export function detectNormalizationOpportunities(source: string, options: TextConversionOptions = {}): NormalizationOpportunities {
  const root = parseSvgRoot(source);
  const textOpportunities = getTextConversionOpportunitiesWithOptions(root, options);
  const transformedContainers = Array.from(root.querySelectorAll(transformedContainerSelector));
  const bakeableContainerTransformCount = transformedContainers.filter((element) => isBakeableContainer(element, textOpportunities.context)).length;
  const useElements = Array.from(root.querySelectorAll('use'));
  const expandableUseCount = useElements.filter((element) => isExpandableUseReference(getUseReference(element, root), textOpportunities.context)).length;
  const styleOpportunities = getStyleRuleOpportunities(root);
  return {
    primitiveShapeCount: root.querySelectorAll('rect, circle, ellipse, line, polyline, polygon').length,
    convertibleTextCount: textOpportunities.convertibleTextCount,
    blockedTextCount: textOpportunities.blockedTextCount,
    referencedTextFamilies: textOpportunities.referencedTextFamilies,
    directTransformCount: root.querySelectorAll('path[transform], rect[transform], circle[transform], ellipse[transform], line[transform], polyline[transform], polygon[transform]').length,
    containerTransformCount: transformedContainers.length,
    bakeableContainerTransformCount,
    blockedContainerTransformCount: transformedContainers.length - bakeableContainerTransformCount,
    expandableUseCount,
    blockedUseCount: useElements.length - expandableUseCount,
    inlineableStyleRuleCount: styleOpportunities.inlineableStyleRuleCount,
    blockedStyleRuleCount: styleOpportunities.blockedStyleRuleCount,
  };
}

export function convertTextToPaths(source: string, options: TextConversionOptions = {}): NormalizationResult {
  const root = parseSvgRoot(source);
  const textOpportunities = getTextConversionOpportunitiesWithOptions(root, options);
  let changed = 0;
  let skipped = 0;

  Array.from(root.querySelectorAll('text')).forEach((textElement) => {
    const info = getTextConversionInfo(textElement, textOpportunities.context);
    if (!info) {
      skipped += 1;
      return;
    }

    const anchorOffset = getTextAnchorOffset(info.font, info.text, info.fontSize, info.textAnchor);
    const pathData = info.font
      .getPath(info.text, info.x - anchorOffset, info.y, info.fontSize, { kerning: true })
      .toPathData(3);

    if (!pathData) {
      skipped += 1;
      return;
    }

    const pathElement = createTextPathReplacement(textElement, pathData);
    textElement.replaceWith(pathElement);
    changed += 1;
  });

  return {
    source: serializeSvg(root),
    changed,
    skipped,
  };
}

export function inlineSimpleStyles(source: string): NormalizationResult {
  const root = parseSvgRoot(source);
  const styleOpportunities = getStyleRuleOpportunities(root);
  let changed = 0;
  let skipped = 0;
  let ruleOrder = 0;
  const elementStyles = new Map<Element, Map<string, { value: string; specificity: Specificity; order: number }>>();

  styleOpportunities.parsedStyles.forEach((styleEntry) => {
    skipped += styleEntry.blockedRules.length;

    styleEntry.inlineableRules.forEach((rule) => {
      changed += 1;
      rule.selectors.forEach((selectorEntry) => {
        Array.from(root.querySelectorAll(selectorEntry.selector)).forEach((element) => {
          const propertyMap = elementStyles.get(element) ?? new Map<string, { value: string; specificity: Specificity; order: number }>();

          rule.declarations.forEach((declaration) => {
            const current = propertyMap.get(declaration.property);
            const nextOrder = ruleOrder;

            if (
              !current ||
              compareSpecificity(selectorEntry.specificity, current.specificity) > 0 ||
              (compareSpecificity(selectorEntry.specificity, current.specificity) === 0 && nextOrder >= current.order)
            ) {
              propertyMap.set(declaration.property, {
                value: declaration.value,
                specificity: selectorEntry.specificity,
                order: nextOrder,
              });
            }
          });

          elementStyles.set(element, propertyMap);
        });

        ruleOrder += 1;
      });
    });

    if (styleEntry.inlineableRules.length > 0) {
      if (styleEntry.blockedRules.length === 0 && styleEntry.retainedCss.length === 0) {
        styleEntry.element.remove();
      } else {
        styleEntry.element.textContent = [...styleEntry.retainedCss, ...styleEntry.blockedRules].join(' ');
      }
    }
  });

  elementStyles.forEach((propertyMap, element) => {
    const declarations = Array.from(propertyMap.entries())
      .sort((left, right) => left[1].order - right[1].order)
      .map(([property, value]) => `${property}: ${value.value}`);

    if (declarations.length === 0) {
      return;
    }

    const existingStyle = element.getAttribute('style')?.trim();
    const mergedStyle = existingStyle ? `${declarations.join('; ')}; ${existingStyle}` : declarations.join('; ');
    element.setAttribute('style', mergedStyle);
  });

  return {
    source: serializeSvg(root),
    changed,
    skipped,
  };
}

export function normalizeShapesToPaths(source: string): NormalizationResult {
  const root = parseSvgRoot(source);
  let changed = 0;

  Array.from(root.querySelectorAll('rect, circle, ellipse, line, polyline, polygon')).forEach((element) => {
    const pathData = elementToPathData(element);
    if (!pathData) {
      return;
    }

    const pathElement = createPathReplacement(element, pathData, false);
    element.replaceWith(pathElement);
    changed += 1;
  });

  return {
    source: serializeSvg(root),
    changed,
    skipped: 0,
  };
}

export function bakeDirectTransforms(source: string): NormalizationResult {
  const root = parseSvgRoot(source);
  let changed = 0;

  Array.from(root.querySelectorAll('[transform]')).forEach((element) => {
    const tagName = element.tagName.toLowerCase();
    if (!transformableTags.has(tagName)) {
      return;
    }

    const matrix = parseTransformMatrix(element.getAttribute('transform'));
    if (isIdentityMatrix(matrix)) {
      element.removeAttribute('transform');
      changed += 1;
      return;
    }

    const pathData = elementToPathData(element);
    if (!pathData) {
      return;
    }

    const transformedPath = transformPathData(pathData, matrix);
    const pathElement = createPathReplacement(element, transformedPath, true);
    element.replaceWith(pathElement);
    changed += 1;
  });

  return {
    source: serializeSvg(root),
    changed,
    skipped: 0,
  };
}

export function bakeContainerTransforms(source: string): NormalizationResult {
  const root = parseSvgRoot(source);
  let changed = 0;
  let skipped = 0;

  const candidates = Array.from(root.querySelectorAll(transformedContainerSelector)).filter((element) => {
    const parentContainer = element.parentElement?.closest(transformedContainerSelector);
    return !parentContainer;
  });

  candidates.forEach((container) => {
    if (!isBakeableContainer(container)) {
      skipped += 1;
      return;
    }

    const containerMatrix = parseTransformMatrix(container.getAttribute('transform'));
    changed += 1;
    bakeContainerGeometry(container, containerMatrix);
    container.removeAttribute('transform');
  });

  return {
    source: serializeSvg(root),
    changed,
    skipped,
  };
}

export function expandUseElements(source: string): NormalizationResult {
  const root = parseSvgRoot(source);
  let changed = 0;
  let skipped = 0;

  Array.from(root.querySelectorAll('use')).forEach((useElement) => {
    const reference = getUseReference(useElement, root);
    if (!reference || !isExpandableUseReference(reference)) {
      skipped += 1;
      return;
    }

    const referenceTag = reference.tagName.toLowerCase();
    const useMatrix = getUseMatrix(useElement);

    if (transformableTags.has(referenceTag)) {
      const combinedMatrix = multiplyMatrix(useMatrix, parseTransformMatrix(reference.getAttribute('transform')));
      const pathData = elementToPathData(reference);
      if (!pathData) {
        skipped += 1;
        return;
      }

      const transformedPath = transformPathData(pathData, combinedMatrix);
      const pathElement = createPathReplacement(reference, transformedPath, true);
      copyUseAttributes(useElement, pathElement);
      useElement.replaceWith(pathElement);
      changed += 1;
      return;
    }

    const containerClone = createUseContainerClone(reference);
    const combinedMatrix = multiplyMatrix(useMatrix, parseTransformMatrix(containerClone.getAttribute('transform')));
    containerClone.removeAttribute('transform');
    copyUseAttributes(useElement, containerClone);
    bakeContainerGeometry(containerClone, combinedMatrix);
    useElement.replaceWith(containerClone);
    changed += 1;
  });

  return {
    source: serializeSvg(root),
    changed,
    skipped,
  };
}

export function applySafeRepairs(source: string, options: TextConversionOptions = {}): SafeRepairResult {
  const styleResult = inlineSimpleStyles(source);
  const textResult = convertTextToPaths(styleResult.source, options);
  const shapeResult = normalizeShapesToPaths(textResult.source);
  const directTransformResult = bakeDirectTransforms(shapeResult.source);
  const containerTransformResult = bakeContainerTransforms(directTransformResult.source);
  const useExpansionResult = expandUseElements(containerTransformResult.source);

  return {
    source: useExpansionResult.source,
    changed:
      styleResult.changed +
      textResult.changed +
      shapeResult.changed +
      directTransformResult.changed +
      containerTransformResult.changed +
      useExpansionResult.changed,
    skipped: styleResult.skipped + textResult.skipped + containerTransformResult.skipped + useExpansionResult.skipped,
    details: {
      styleRules: styleResult.changed,
      textPaths: textResult.changed,
      shapes: shapeResult.changed,
      directTransforms: directTransformResult.changed,
      containerTransforms: containerTransformResult.changed,
      useExpansions: useExpansionResult.changed,
      blockedStyleRules: styleResult.skipped,
      blockedTexts: textResult.skipped,
      blockedContainers: containerTransformResult.skipped,
      blockedUses: useExpansionResult.skipped,
    },
  };
}

export function getTextConversionMessage(convertibleCount: number, blockedCount: number) {
  if (convertibleCount === 0 && blockedCount === 0) {
    return 'No text elements detected.';
  }

  if (blockedCount === 0) {
    return `${convertibleCount} text element${convertibleCount === 1 ? '' : 's'} can be converted to paths.`;
  }

  if (convertibleCount === 0) {
    return `${blockedCount} text element${blockedCount === 1 ? '' : 's'} remain blocked by missing embedded fonts or unsupported structure.`;
  }

  return `${convertibleCount} text element${convertibleCount === 1 ? '' : 's'} can be converted to paths. ${blockedCount} remain blocked by missing embedded fonts or unsupported structure.`;
}

export function getContainerTransformMessage(bakeableCount: number, blockedCount: number) {
  if (bakeableCount === 0 && blockedCount === 0) {
    return 'No transformed containers detected.';
  }

  if (blockedCount === 0) {
    return `${bakeableCount} transformed container${bakeableCount === 1 ? '' : 's'} can be baked safely.`;
  }

  if (bakeableCount === 0) {
    return `${blockedCount} transformed container${blockedCount === 1 ? '' : 's'} remain blocked by unsupported descendants.`;
  }

  return `${bakeableCount} transformed container${bakeableCount === 1 ? '' : 's'} can be baked safely. ${blockedCount} remain blocked by unsupported descendants.`;
}

export function getUseExpansionMessage(expandableCount: number, blockedCount: number) {
  if (expandableCount === 0 && blockedCount === 0) {
    return 'No <use> references detected.';
  }

  if (blockedCount === 0) {
    return `${expandableCount} <use> reference${expandableCount === 1 ? '' : 's'} can be expanded into concrete geometry.`;
  }

  if (expandableCount === 0) {
    return `${blockedCount} <use> reference${blockedCount === 1 ? '' : 's'} remain blocked by missing or unsupported targets.`;
  }

  return `${expandableCount} <use> reference${expandableCount === 1 ? '' : 's'} can be expanded into concrete geometry. ${blockedCount} remain blocked by missing or unsupported targets.`;
}

export function getStyleInliningMessage(inlineableCount: number, blockedCount: number) {
  if (inlineableCount === 0 && blockedCount === 0) {
    return 'No inlineable <style> rules detected.';
  }

  if (blockedCount === 0) {
    return `${inlineableCount} simple style rule${inlineableCount === 1 ? '' : 's'} can be inlined safely.`;
  }

  if (inlineableCount === 0) {
    return `${blockedCount} style rule${blockedCount === 1 ? '' : 's'} remain blocked by unsupported selectors or syntax.`;
  }

  return `${inlineableCount} simple style rule${inlineableCount === 1 ? '' : 's'} can be inlined safely. ${blockedCount} remain blocked by unsupported selectors or syntax.`;
}

export const normalizationMetadata = {
  primitiveTags,
  transformableTags,
  containerTags,
};
