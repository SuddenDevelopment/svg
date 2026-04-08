import { generate as generateCss, parse as parseCss } from 'css-tree';
import type { CssNode } from 'css-tree';
import * as opentype from 'opentype.js';
import { normalizeFontFamilyName } from './svg-fonts';
import type { TextConversionOptions, UploadedFontAsset } from './svg-fonts';
import { SVGPathData } from 'svg-pathdata';
import type { SVGCommand } from 'svg-pathdata';
import { type Matrix, isIdentityMatrix, multiplyMatrix, parseTransformMatrix } from './svg-math';

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
  strokeOutlineCount: number;
  blockedStrokeOutlineCount: number;
  pathCleanupCount: number;
  referenceCleanupCount: number;
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
    strokeOutlines: number;
    pathCleanups: number;
    directTransforms: number;
    containerTransforms: number;
    useExpansions: number;
    blockedStyleRules: number;
    blockedTexts: number;
    blockedStrokeOutlines: number;
    blockedContainers: number;
    blockedUses: number;
  };
};

const removableAuthoringPrefixes = new Set(['inkscape', 'sodipodi', 'dc', 'cc', 'rdf']);
const removableAuthoringElementPrefixes = new Set(['inkscape', 'sodipodi']);



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

type StrokeOutlineCandidate = {
  element: Element;
  stroke: string;
  strokeOpacity: string | null;
  pathData: string;
  fillRule: 'evenodd' | null;
};

type ReferenceCleanupAction = {
  type: 'remove-element' | 'remove-attributes';
  element: Element;
  reason: 'broken-local' | 'external-dependency' | 'unsafe';
};

type ReferenceCleanupOptions = {
  preserveExternalDependencies?: boolean;
};

type PathCleanupAction = {
  remove?: boolean;
  pathData?: string;
  fillRule?: string | null;
};

type Point = {
  x: number;
  y: number;
};

type OpenPathJoinCandidate = {
  start: Point;
  end: Point;
};

type PolygonRing = {
  points: Point[];
  signedArea: number;
};

type PathCleanupState = {
  element: Element;
  attributeSignature: string;
  pathData: string;
  commands: SVGCommand[];
  joinCandidate: OpenPathJoinCandidate | null;
  action: PathCleanupAction;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const primitiveTags = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const transformableTags = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const outlineableStrokeTags = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline']);
const containerTags = new Set(['g', 'svg', 'defs', 'symbol']);
const nonVisualTags = new Set(['title', 'desc', 'metadata']);
const removableReferenceElementTags = new Set(['use', 'image', 'feimage', 'script', 'mpath']);
const transformedContainerSelector = 'g[transform], svg[transform], defs[transform], symbol[transform]';
const useAttributeOmissions = new Set(['href', 'xlink:href', 'x', 'y', 'width', 'height', 'transform', 'id']);
const pathCleanupAttributeOmissions = new Set(['id', 'd']);
const strokeOutlineAttributeOmissions = new Set([
  'd',
  'x',
  'y',
  'width',
  'height',
  'rx',
  'ry',
  'cx',
  'cy',
  'r',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'vector-effect',
  'paint-order',
]);
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

function getLocalTagName(element: Element) {
  return element.localName || element.tagName.split(':').at(-1) || element.tagName;
}

function parseSvgRoot(source: string) {
  const documentRoot = new DOMParser().parseFromString(source, 'image/svg+xml');
  const parserError = documentRoot.querySelector('parsererror');
  if (parserError) {
    throw new Error(parserError.textContent?.trim() || 'Unable to parse SVG markup.');
  }

  const root = documentRoot.documentElement;
  if (getLocalTagName(root).toLowerCase() !== 'svg') {
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

function formatNumber(value: number) {
  const rounded = Number.parseFloat(value.toFixed(3));
  return Number.isFinite(rounded) ? `${rounded}` : '0';
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

function rectPathFromNumbers(x: number, y: number, width: number, height: number) {
  return `M${formatNumber(x)} ${formatNumber(y)}H${formatNumber(x + width)}V${formatNumber(y + height)}H${formatNumber(x)}Z`;
}

function circleToPath(element: Element) {
  const cx = parseNumber(element.getAttribute('cx'));
  const cy = parseNumber(element.getAttribute('cy'));
  const r = Math.max(0, parseNumber(element.getAttribute('r')));

  return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
}

function circlePathFromNumbers(cx: number, cy: number, radius: number) {
  return `M${formatNumber(cx - radius)} ${formatNumber(cy)}A${formatNumber(radius)} ${formatNumber(radius)} 0 1 0 ${formatNumber(cx + radius)} ${formatNumber(cy)}A${formatNumber(radius)} ${formatNumber(radius)} 0 1 0 ${formatNumber(cx - radius)} ${formatNumber(cy)}Z`;
}

function ellipseToPath(element: Element) {
  const cx = parseNumber(element.getAttribute('cx'));
  const cy = parseNumber(element.getAttribute('cy'));
  const rx = Math.max(0, parseNumber(element.getAttribute('rx')));
  const ry = Math.max(0, parseNumber(element.getAttribute('ry')));

  return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
}

function ellipsePathFromNumbers(cx: number, cy: number, rx: number, ry: number) {
  return `M${formatNumber(cx - rx)} ${formatNumber(cy)}A${formatNumber(rx)} ${formatNumber(ry)} 0 1 0 ${formatNumber(cx + rx)} ${formatNumber(cy)}A${formatNumber(rx)} ${formatNumber(ry)} 0 1 0 ${formatNumber(cx - rx)} ${formatNumber(cy)}Z`;
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

function lineOutlinePathFromNumbers(x1: number, y1: number, x2: number, y2: number, strokeWidth: number, linecap: string) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length === 0 || strokeWidth <= 0) {
    return '';
  }

  const half = strokeWidth / 2;
  const tx = dx / length;
  const ty = dy / length;
  const nx = (-dy / length) * half;
  const ny = (dx / length) * half;
  const extension = linecap === 'square' ? half : 0;
  const sx = x1 - tx * extension;
  const sy = y1 - ty * extension;
  const ex = x2 + tx * extension;
  const ey = y2 + ty * extension;

  return [
    `M${formatNumber(sx + nx)} ${formatNumber(sy + ny)}`,
    `L${formatNumber(ex + nx)} ${formatNumber(ey + ny)}`,
    `L${formatNumber(ex - nx)} ${formatNumber(ey - ny)}`,
    `L${formatNumber(sx - nx)} ${formatNumber(sy - ny)}`,
    'Z',
  ].join(' ');
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

function hasVisiblePaint(value: string | null) {
  if (!value) {
    return false;
  }

  return value.trim().toLowerCase() !== 'none';
}

function hasVisibleFill(element: Element) {
  const fillValue = getPresentationValue(element, 'fill');
  const fillOpacity = parseNumber(getPresentationValue(element, 'fill-opacity'), 1);

  if (fillOpacity <= 0) {
    return false;
  }

  if (!fillValue) {
    return true;
  }

  return hasVisiblePaint(fillValue);
}

function hasVisibleStroke(element: Element) {
  const strokeValue = getPresentationValue(element, 'stroke');
  const strokeOpacity = parseNumber(getPresentationValue(element, 'stroke-opacity'), 1);
  const strokeWidth = parseNumber(getPresentationValue(element, 'stroke-width'), 1);

  return hasVisiblePaint(strokeValue) && strokeOpacity > 0 && strokeWidth > 0;
}

function isStrokeOnlyElement(element: Element) {
  return hasVisibleStroke(element) && !hasVisibleFill(element);
}

function createStrokeOutlinePathData(element: Element, strokeWidth: number) {
  const tagName = getLocalTagName(element).toLowerCase();

  switch (tagName) {
    case 'rect': {
      const width = parseNumber(element.getAttribute('width'));
      const height = parseNumber(element.getAttribute('height'));
      const hasRoundedCorners = parseNumber(element.getAttribute('rx')) > 0 || parseNumber(element.getAttribute('ry')) > 0;
      if (width <= 0 || height <= 0 || hasRoundedCorners) {
        return { pathData: '', fillRule: null };
      }

      const x = parseNumber(element.getAttribute('x'));
      const y = parseNumber(element.getAttribute('y'));
      const half = strokeWidth / 2;
      const outer = rectPathFromNumbers(x - half, y - half, width + strokeWidth, height + strokeWidth);
      const innerWidth = width - strokeWidth;
      const innerHeight = height - strokeWidth;
      if (innerWidth <= 0 || innerHeight <= 0) {
        return { pathData: outer, fillRule: null };
      }

      const inner = rectPathFromNumbers(x + half, y + half, innerWidth, innerHeight);
      return { pathData: `${outer} ${inner}`, fillRule: 'evenodd' as const };
    }
    case 'circle': {
      const cx = parseNumber(element.getAttribute('cx'));
      const cy = parseNumber(element.getAttribute('cy'));
      const radius = parseNumber(element.getAttribute('r'));
      if (radius <= 0) {
        return { pathData: '', fillRule: null };
      }

      const outerRadius = radius + strokeWidth / 2;
      const innerRadius = radius - strokeWidth / 2;
      const outer = circlePathFromNumbers(cx, cy, outerRadius);
      if (innerRadius <= 0) {
        return { pathData: outer, fillRule: null };
      }

      const inner = circlePathFromNumbers(cx, cy, innerRadius);
      return { pathData: `${outer} ${inner}`, fillRule: 'evenodd' as const };
    }
    case 'ellipse': {
      const cx = parseNumber(element.getAttribute('cx'));
      const cy = parseNumber(element.getAttribute('cy'));
      const rx = parseNumber(element.getAttribute('rx'));
      const ry = parseNumber(element.getAttribute('ry'));
      if (rx <= 0 || ry <= 0) {
        return { pathData: '', fillRule: null };
      }

      const half = strokeWidth / 2;
      const outer = ellipsePathFromNumbers(cx, cy, rx + half, ry + half);
      const innerRx = rx - half;
      const innerRy = ry - half;
      if (innerRx <= 0 || innerRy <= 0) {
        return { pathData: outer, fillRule: null };
      }

      const inner = ellipsePathFromNumbers(cx, cy, innerRx, innerRy);
      return { pathData: `${outer} ${inner}`, fillRule: 'evenodd' as const };
    }
    case 'line': {
      const linecap = (getPresentationValue(element, 'stroke-linecap') ?? 'butt').trim().toLowerCase();
      if (linecap !== 'butt' && linecap !== 'square') {
        return { pathData: '', fillRule: null };
      }

      return {
        pathData: lineOutlinePathFromNumbers(
          parseNumber(element.getAttribute('x1')),
          parseNumber(element.getAttribute('y1')),
          parseNumber(element.getAttribute('x2')),
          parseNumber(element.getAttribute('y2')),
          strokeWidth,
          linecap,
        ),
        fillRule: null,
      };
    }
    case 'polyline': {
      const points = parsePoints(element.getAttribute('points'));
      const linecap = (getPresentationValue(element, 'stroke-linecap') ?? 'butt').trim().toLowerCase();
      if (points.length !== 2 || (linecap !== 'butt' && linecap !== 'square')) {
        return { pathData: '', fillRule: null };
      }

      return {
        pathData: lineOutlinePathFromNumbers(points[0][0], points[0][1], points[1][0], points[1][1], strokeWidth, linecap),
        fillRule: null,
      };
    }
    default:
      return { pathData: '', fillRule: null };
  }
}

function getStrokeOutlineCandidate(element: Element): StrokeOutlineCandidate | null {
  if (!isStrokeOnlyElement(element)) {
    return null;
  }

  const tagName = getLocalTagName(element).toLowerCase();
  if (!outlineableStrokeTags.has(tagName)) {
    return null;
  }

  const strokeDasharray = getPresentationValue(element, 'stroke-dasharray');
  if (strokeDasharray && strokeDasharray.trim().toLowerCase() !== 'none') {
    return null;
  }

  const vectorEffect = getPresentationValue(element, 'vector-effect');
  if (vectorEffect && vectorEffect.trim().toLowerCase() !== 'none') {
    return null;
  }

  const hasMarkers = ['marker-start', 'marker-mid', 'marker-end'].some((attributeName) => {
    const value = getPresentationValue(element, attributeName);
    return Boolean(value && value.trim().toLowerCase() !== 'none');
  });
  if (hasMarkers) {
    return null;
  }

  const stroke = getPresentationValue(element, 'stroke');
  const strokeWidth = parseNumber(getPresentationValue(element, 'stroke-width'), 1);
  const { pathData, fillRule } = createStrokeOutlinePathData(element, strokeWidth);
  if (!stroke || !pathData) {
    return null;
  }

  return {
    element,
    stroke,
    strokeOpacity: getPresentationValue(element, 'stroke-opacity'),
    pathData,
    fillRule,
  };
}

function getStrokeOutlineOpportunities(root: SVGSVGElement) {
  const strokeOnlyElements = [root, ...Array.from(root.querySelectorAll('*'))].filter((element) => isStrokeOnlyElement(element));
  const strokeOutlineCount = strokeOnlyElements.filter((element) => Boolean(getStrokeOutlineCandidate(element))).length;

  return {
    strokeOutlineCount,
    blockedStrokeOutlineCount: strokeOnlyElements.length - strokeOutlineCount,
  };
}

function getPathCommandEndpoint(command: SVGCommand, currentPoint: { x: number; y: number }, subpathStart: { x: number; y: number }) {
  switch (command.type) {
    case SVGPathData.MOVE_TO:
    case SVGPathData.LINE_TO:
    case SVGPathData.CURVE_TO:
    case SVGPathData.SMOOTH_CURVE_TO:
    case SVGPathData.QUAD_TO:
    case SVGPathData.SMOOTH_QUAD_TO:
    case SVGPathData.ARC:
      return { x: command.x, y: command.y };
    case SVGPathData.HORIZ_LINE_TO:
      return { x: command.x, y: currentPoint.y };
    case SVGPathData.VERT_LINE_TO:
      return { x: currentPoint.x, y: command.y };
    case SVGPathData.CLOSE_PATH:
      return { x: subpathStart.x, y: subpathStart.y };
    default:
      return currentPoint;
  }
}

function closeNearClosedSubpaths(commands: SVGCommand[], tolerance = 0.25) {
  const nextCommands: SVGCommand[] = [];
  let currentPoint = { x: 0, y: 0 };
  let subpathStart = { x: 0, y: 0 };
  let subpathHasDrawing = false;
  let subpathClosed = false;
  let changed = 0;

  const finalizeSubpath = () => {
    if (!subpathHasDrawing || subpathClosed) {
      return;
    }

    const distance = Math.hypot(currentPoint.x - subpathStart.x, currentPoint.y - subpathStart.y);
    if (distance <= tolerance) {
      nextCommands.push({ type: SVGPathData.CLOSE_PATH });
      currentPoint = { ...subpathStart };
      subpathClosed = true;
      changed += 1;
    }
  };

  commands.forEach((command) => {
    if (command.type === SVGPathData.MOVE_TO) {
      finalizeSubpath();
      nextCommands.push(command);
      currentPoint = { x: command.x, y: command.y };
      subpathStart = { x: command.x, y: command.y };
      subpathHasDrawing = false;
      subpathClosed = false;
      return;
    }

    nextCommands.push(command);
    currentPoint = getPathCommandEndpoint(command, currentPoint, subpathStart);

    if (command.type === SVGPathData.CLOSE_PATH) {
      subpathHasDrawing = true;
      subpathClosed = true;
      return;
    }

    subpathHasDrawing = true;
  });

  finalizeSubpath();

  return {
    commands: nextCommands,
    changed,
  };
}

function getPathCleanupAttributeSignature(element: Element) {
  const attributeSignature = Array.from(element.attributes)
    .filter((attribute) => !pathCleanupAttributeOmissions.has(attribute.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((attribute) => `${attribute.name}=${attribute.value}`)
    .join(';');

  return attributeSignature;
}

function getPathCleanupSignature(element: Element, commands: SVGCommand[]) {
  return `${SVGPathData.encode(commands)}|${getPathCleanupAttributeSignature(element)}`;
}

function pointsAreNear(left: Point, right: Point, tolerance = 0.25) {
  return Math.hypot(left.x - right.x, left.y - right.y) <= tolerance;
}

function getOpenPathJoinCandidate(commands: SVGCommand[]): OpenPathJoinCandidate | null {
  if (commands.length < 2 || commands[0]?.type !== SVGPathData.MOVE_TO) {
    return null;
  }

  let currentPoint = { x: commands[0].x, y: commands[0].y };
  const subpathStart = { ...currentPoint };
  let hasDrawing = false;

  for (let index = 1; index < commands.length; index += 1) {
    const command = commands[index];
    if (command.type === SVGPathData.MOVE_TO || command.type === SVGPathData.CLOSE_PATH) {
      return null;
    }

    currentPoint = getPathCommandEndpoint(command, currentPoint, subpathStart);
    hasDrawing = true;
  }

  if (!hasDrawing || pointsAreNear(currentPoint, subpathStart)) {
    return null;
  }

  return {
    start: subpathStart,
    end: currentPoint,
  };
}

function joinPathCommands(first: SVGCommand[], second: SVGCommand[], tolerance = 0.25) {
  const firstCandidate = getOpenPathJoinCandidate(first);
  const secondCandidate = getOpenPathJoinCandidate(second);
  if (!firstCandidate || !secondCandidate) {
    return null;
  }

  if (!pointsAreNear(firstCandidate.end, secondCandidate.start, tolerance)) {
    return null;
  }

  const joined = [...first];
  if (!pointsAreNear(firstCandidate.end, secondCandidate.start, 0.0001)) {
    joined.push({
      type: SVGPathData.LINE_TO,
      relative: false,
      x: secondCandidate.start.x,
      y: secondCandidate.start.y,
    });
  }

  joined.push(...second.slice(1));
  return joined;
}

function dedupeSequentialPoints(points: Point[]) {
  return points.filter((point, index) => {
    if (index === 0) {
      return true;
    }

    return !pointsAreNear(point, points[index - 1], 0.0001);
  });
}

function getSignedPolygonArea(points: Point[]) {
  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += (current.x * next.y) - (next.x * current.y);
  }

  return area / 2;
}

function getPolygonRings(commands: SVGCommand[]): PolygonRing[] | null {
  const rings: PolygonRing[] = [];
  let currentPoints: Point[] = [];
  let currentPoint: Point | null = null;
  let subpathStart: Point | null = null;

  const finalizeRing = () => {
    if (!subpathStart || currentPoints.length < 3) {
      return false;
    }

    const deduped = dedupeSequentialPoints(currentPoints);
    if (deduped.length < 3) {
      return false;
    }

    rings.push({
      points: deduped,
      signedArea: getSignedPolygonArea(deduped),
    });

    return true;
  };

  for (const command of commands) {
    switch (command.type) {
      case SVGPathData.MOVE_TO: {
        if (currentPoints.length > 0) {
          return null;
        }

        currentPoint = { x: command.x, y: command.y };
        subpathStart = { ...currentPoint };
        currentPoints = [{ ...currentPoint }];
        break;
      }
      case SVGPathData.LINE_TO: {
        if (!currentPoint) {
          return null;
        }

        currentPoint = { x: command.x, y: command.y };
        currentPoints.push({ ...currentPoint });
        break;
      }
      case SVGPathData.HORIZ_LINE_TO: {
        if (!currentPoint) {
          return null;
        }

        currentPoint = { x: command.x, y: currentPoint.y };
        currentPoints.push({ ...currentPoint });
        break;
      }
      case SVGPathData.VERT_LINE_TO: {
        if (!currentPoint) {
          return null;
        }

        currentPoint = { x: currentPoint.x, y: command.y };
        currentPoints.push({ ...currentPoint });
        break;
      }
      case SVGPathData.CLOSE_PATH: {
        if (!subpathStart || currentPoints.length === 0) {
          return null;
        }

        if (!finalizeRing()) {
          return null;
        }

        currentPoint = null;
        subpathStart = null;
        currentPoints = [];
        break;
      }
      default:
        return null;
    }
  }

  if (currentPoints.length > 0) {
    return null;
  }

  return rings.length > 0 ? rings : null;
}

function isPointInsidePolygon(point: Point, polygon: Point[]) {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];
    const intersects = ((current.y > point.y) !== (prior.y > point.y))
      && (point.x < ((prior.x - current.x) * (point.y - current.y)) / ((prior.y - current.y) || Number.EPSILON) + current.x);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function reverseRingPoints(points: Point[]) {
  return [points[0], ...points.slice(1).reverse()];
}

function getOrientationSign(area: number) {
  if (Math.abs(area) <= 0.0001) {
    return 0;
  }

  return area > 0 ? 1 : -1;
}

function getRingParentIndexes(rings: PolygonRing[]) {
  return rings.map((ring, ringIndex) => {
    let parentIndex = -1;
    let parentArea = Number.POSITIVE_INFINITY;

    rings.forEach((candidate, candidateIndex) => {
      if (candidateIndex === ringIndex) {
        return;
      }

      const candidateArea = Math.abs(candidate.signedArea);
      const ringArea = Math.abs(ring.signedArea);
      if (candidateArea <= ringArea) {
        return;
      }

      if (!isPointInsidePolygon(ring.points[0], candidate.points)) {
        return;
      }

      if (candidateArea < parentArea) {
        parentIndex = candidateIndex;
        parentArea = candidateArea;
      }
    });

    return parentIndex;
  });
}

function getCrossProduct(anchor: Point, left: Point, right: Point) {
  return ((left.x - anchor.x) * (right.y - anchor.y)) - ((left.y - anchor.y) * (right.x - anchor.x));
}

function isValueWithinRange(value: number, left: number, right: number) {
  return value <= Math.max(left, right) + 0.0001 && value + 0.0001 >= Math.min(left, right);
}

function segmentsIntersect(startA: Point, endA: Point, startB: Point, endB: Point) {
  const d1 = getCrossProduct(startA, endA, startB);
  const d2 = getCrossProduct(startA, endA, endB);
  const d3 = getCrossProduct(startB, endB, startA);
  const d4 = getCrossProduct(startB, endB, endA);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  if (Math.abs(d1) <= 0.0001 && isValueWithinRange(startB.x, startA.x, endA.x) && isValueWithinRange(startB.y, startA.y, endA.y)) {
    return true;
  }

  if (Math.abs(d2) <= 0.0001 && isValueWithinRange(endB.x, startA.x, endA.x) && isValueWithinRange(endB.y, startA.y, endA.y)) {
    return true;
  }

  if (Math.abs(d3) <= 0.0001 && isValueWithinRange(startA.x, startB.x, endB.x) && isValueWithinRange(startA.y, startB.y, endB.y)) {
    return true;
  }

  if (Math.abs(d4) <= 0.0001 && isValueWithinRange(endA.x, startB.x, endB.x) && isValueWithinRange(endA.y, startB.y, endB.y)) {
    return true;
  }

  return false;
}

function isSelfIntersectingRing(points: Point[]) {
  const segmentCount = points.length;
  if (segmentCount < 4) {
    return false;
  }

  for (let leftIndex = 0; leftIndex < segmentCount; leftIndex += 1) {
    const leftStart = points[leftIndex];
    const leftEnd = points[(leftIndex + 1) % segmentCount];

    for (let rightIndex = leftIndex + 1; rightIndex < segmentCount; rightIndex += 1) {
      const areAdjacent = Math.abs(leftIndex - rightIndex) <= 1 || (leftIndex === 0 && rightIndex === segmentCount - 1);
      if (areAdjacent) {
        continue;
      }

      const rightStart = points[rightIndex];
      const rightEnd = points[(rightIndex + 1) % segmentCount];
      if (segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd)) {
        return true;
      }
    }
  }

  return false;
}

function encodePolygonRings(rings: PolygonRing[]) {
  return rings.map((ring) => {
    const [start, ...rest] = ring.points;
    const commands: SVGCommand[] = [
      { type: SVGPathData.MOVE_TO, relative: false, x: start.x, y: start.y },
      ...rest.map((point) => ({ type: SVGPathData.LINE_TO, relative: false, x: point.x, y: point.y })),
      { type: SVGPathData.CLOSE_PATH },
    ];

    return SVGPathData.encode(commands);
  }).join(' ');
}

function repairPolygonalPath(pathData: string, fillRule: string | null) {
  let commands: SVGCommand[];
  try {
    commands = new SVGPathData(pathData).toAbs().commands;
  } catch {
    return null;
  }

  const rings = getPolygonRings(commands);
  if (!rings) {
    return null;
  }

  const normalizedFillRule = fillRule?.trim().toLowerCase() ?? '';
  let windingChanged = 0;
  const nextRings = rings.map((ring) => ({
    ...ring,
    points: [...ring.points],
  }));

  if (normalizedFillRule !== 'evenodd') {
    const parentIndexes = getRingParentIndexes(nextRings);
    parentIndexes.forEach((parentIndex, ringIndex) => {
      if (parentIndex < 0) {
        return;
      }

      const parentSign = getOrientationSign(nextRings[parentIndex].signedArea);
      const ringSign = getOrientationSign(nextRings[ringIndex].signedArea);
      if (parentSign === 0 || ringSign === 0 || parentSign !== ringSign) {
        return;
      }

      nextRings[ringIndex].points = reverseRingPoints(nextRings[ringIndex].points);
      nextRings[ringIndex].signedArea = getSignedPolygonArea(nextRings[ringIndex].points);
      windingChanged += 1;
    });
  }

  const hasSelfIntersection = nextRings.some((ring) => isSelfIntersectingRing(ring.points));
  const nextFillRule = hasSelfIntersection && normalizedFillRule !== 'evenodd' ? 'evenodd' : fillRule;

  if (windingChanged === 0 && nextFillRule === fillRule) {
    return null;
  }

  return {
    pathData: encodePolygonRings(nextRings),
    fillRule: nextFillRule,
  };
}

function analyzePathCleanup(root: SVGSVGElement) {
  const actions = new Map<Element, PathCleanupAction>();
  const seenPaths = new Set<string>();
  let closeablePathCount = 0;
  let duplicatePathCount = 0;
  let tinyPathCount = 0;
  const states: PathCleanupState[] = [];

  Array.from(root.querySelectorAll('path')).forEach((element) => {
    const pathData = element.getAttribute('d')?.trim();
    if (!pathData) {
      actions.set(element, { remove: true });
      tinyPathCount += 1;
      return;
    }

    let absolutePath: SVGPathData;
    try {
      absolutePath = new SVGPathData(pathData).toAbs();
    } catch {
      return;
    }

    const commands = absolutePath.commands;
    const hasDrawingCommands = commands.some((command) => command.type !== SVGPathData.MOVE_TO && command.type !== SVGPathData.CLOSE_PATH);
    if (!hasDrawingCommands) {
      actions.set(element, { remove: true });
      tinyPathCount += 1;
      return;
    }

    const bounds = absolutePath.getBounds();
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    if ((!Number.isFinite(width) || !Number.isFinite(height)) || (width <= 0.05 && height <= 0.05)) {
      actions.set(element, { remove: true });
      tinyPathCount += 1;
      return;
    }

    const closedPath = closeNearClosedSubpaths(commands);
    const signature = getPathCleanupSignature(element, closedPath.commands);

    if (seenPaths.has(signature)) {
      actions.set(element, { remove: true });
      duplicatePathCount += 1;
      return;
    }

    seenPaths.add(signature);
    const action: PathCleanupAction = {};
    if (closedPath.changed > 0) {
      action.pathData = SVGPathData.encode(closedPath.commands);
      actions.set(element, action);
      closeablePathCount += 1;
    }

    states.push({
      element,
      attributeSignature: getPathCleanupAttributeSignature(element),
      pathData: action.pathData ?? SVGPathData.encode(closedPath.commands),
      commands: closedPath.commands,
      joinCandidate: getOpenPathJoinCandidate(closedPath.commands),
      action,
    });
  });

  const stateByElement = new Map(states.map((state) => [state.element, state]));

  [root, ...Array.from(root.querySelectorAll('*'))].forEach((parent) => {
    const children = Array.from(parent.children);
    for (let index = 0; index < children.length - 1; index += 1) {
      const currentState = stateByElement.get(children[index]);
      const nextState = stateByElement.get(children[index + 1]);
      if (!currentState || !nextState || !currentState.joinCandidate || !nextState.joinCandidate || currentState.action.remove || nextState.action.remove) {
        continue;
      }

      if (currentState.attributeSignature !== nextState.attributeSignature) {
        continue;
      }

      const joinedCommands = joinPathCommands(currentState.commands, nextState.commands);
      if (!joinedCommands) {
        continue;
      }

      currentState.commands = joinedCommands;
      currentState.pathData = SVGPathData.encode(joinedCommands);
      currentState.joinCandidate = getOpenPathJoinCandidate(joinedCommands);
      currentState.action.pathData = currentState.pathData;
      nextState.action.remove = true;
      actions.set(currentState.element, currentState.action);
      actions.set(nextState.element, nextState.action);
    }
  });

  states.forEach((state) => {
    if (state.action.remove) {
      return;
    }

    const repaired = repairPolygonalPath(state.pathData, state.element.getAttribute('fill-rule'));
    if (!repaired) {
      return;
    }

    if (repaired.pathData !== state.pathData) {
      state.pathData = repaired.pathData;
      state.commands = new SVGPathData(repaired.pathData).toAbs().commands;
      state.joinCandidate = getOpenPathJoinCandidate(state.commands);
      state.action.pathData = repaired.pathData;
    }

    if (repaired.fillRule !== state.element.getAttribute('fill-rule')) {
      state.action.fillRule = repaired.fillRule;
    }

    actions.set(state.element, state.action);
  });

  const pathCleanupCount = Array.from(actions.values()).filter((action) => action.remove || action.pathData || action.fillRule !== undefined).length;

  return {
    actions,
    closeablePathCount,
    duplicatePathCount,
    tinyPathCount,
    pathCleanupCount,
  };
}

function classifyReferenceValue(value: string) {
  const normalized = value.trim().toLowerCase();

  if (normalized.startsWith('#')) {
    return 'local' as const;
  }

  if (normalized.startsWith('data:')) {
    return 'embedded' as const;
  }

  if (normalized.startsWith('javascript:')) {
    return 'unsafe' as const;
  }

  return 'external' as const;
}

function getReferenceAttributeValue(element: Element) {
  return element.getAttribute('href') ?? element.getAttribute('xlink:href');
}

function removeReferenceAttributes(element: Element) {
  element.removeAttribute('href');
  element.removeAttribute('xlink:href');
}

function resolveReferenceCleanupReason(
  element: Element,
  root: SVGSVGElement,
  options: ReferenceCleanupOptions = {},
  memo = new Map<Element, ReferenceCleanupAction['reason'] | null>(),
  visiting = new Set<Element>(),
): ReferenceCleanupAction['reason'] | null {
  const cached = memo.get(element);
  if (cached !== undefined) {
    return cached;
  }

  const referenceValue = getReferenceAttributeValue(element)?.trim();
  if (!referenceValue) {
    memo.set(element, null);
    return null;
  }

  const tagName = getLocalTagName(element).toLowerCase();
  const referenceType = classifyReferenceValue(referenceValue);

  if (referenceType === 'embedded') {
    memo.set(element, null);
    return null;
  }

  if (referenceType === 'unsafe') {
    memo.set(element, 'unsafe');
    return 'unsafe';
  }

  if (referenceType === 'external') {
    const reason = tagName === 'a' || options.preserveExternalDependencies ? null : 'external-dependency';
    memo.set(element, reason);
    return reason;
  }

  const referenceId = referenceValue.slice(1);
  const referenceTarget = referenceId ? root.ownerDocument.getElementById(referenceId) : null;
  if (!referenceTarget) {
    memo.set(element, 'broken-local');
    return 'broken-local';
  }

  if (visiting.has(referenceTarget) || referenceTarget === element) {
    memo.set(element, 'broken-local');
    return 'broken-local';
  }

  const targetReferenceValue = getReferenceAttributeValue(referenceTarget)?.trim();
  if (!targetReferenceValue) {
    memo.set(element, null);
    return null;
  }

  visiting.add(element);
  const chainedReason = resolveReferenceCleanupReason(referenceTarget, root, options, memo, visiting);
  visiting.delete(element);
  memo.set(element, chainedReason);
  return chainedReason;
}

function analyzeReferenceCleanup(root: SVGSVGElement, options: ReferenceCleanupOptions = {}) {
  const actions = new Map<Element, ReferenceCleanupAction>();
  const memo = new Map<Element, ReferenceCleanupAction['reason'] | null>();

  [root, ...Array.from(root.querySelectorAll('*'))].forEach((element) => {
    const referenceValue = getReferenceAttributeValue(element)?.trim();
    if (!referenceValue) {
      return;
    }

    const tagName = getLocalTagName(element).toLowerCase();
    const reason = resolveReferenceCleanupReason(element, root, options, memo);
    if (!reason) {
      return;
    }

    actions.set(element, {
      type: removableReferenceElementTags.has(tagName) ? 'remove-element' : 'remove-attributes',
      element,
      reason,
    });
  });

  return {
    actions,
    referenceCleanupCount: actions.size,
  };
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
  const strokeOpportunities = getStrokeOutlineOpportunities(root);
  const pathCleanup = analyzePathCleanup(root);
  const referenceCleanup = analyzeReferenceCleanup(root);
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
    strokeOutlineCount: strokeOpportunities.strokeOutlineCount,
    blockedStrokeOutlineCount: strokeOpportunities.blockedStrokeOutlineCount,
    pathCleanupCount: pathCleanup.pathCleanupCount,
    referenceCleanupCount: referenceCleanup.referenceCleanupCount,
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

export function convertStrokesToOutlines(source: string): NormalizationResult {
  const root = parseSvgRoot(source);
  let changed = 0;
  let skipped = 0;

  [root, ...Array.from(root.querySelectorAll('*'))].forEach((element) => {
    if (!isStrokeOnlyElement(element)) {
      return;
    }

    const candidate = getStrokeOutlineCandidate(element);
    if (!candidate) {
      skipped += 1;
      return;
    }

    const pathElement = document.createElementNS(SVG_NS, 'path');
    copyAttributes(candidate.element, pathElement, strokeOutlineAttributeOmissions);
    pathElement.setAttribute('d', candidate.pathData);
    pathElement.setAttribute('fill', candidate.stroke);

    if (candidate.strokeOpacity && candidate.strokeOpacity.trim() !== '' && candidate.strokeOpacity.trim() !== '1') {
      pathElement.setAttribute('fill-opacity', candidate.strokeOpacity);
    }

    if (candidate.fillRule) {
      pathElement.setAttribute('fill-rule', candidate.fillRule);
    }

    candidate.element.replaceWith(pathElement);
    changed += 1;
  });

  return {
    source: serializeSvg(root),
    changed,
    skipped,
  };
}

export function cleanupPaths(source: string): NormalizationResult {
  const root = parseSvgRoot(source);
  const pathCleanup = analyzePathCleanup(root);
  let changed = 0;

  Array.from(root.querySelectorAll('path')).forEach((element) => {
    const action = pathCleanup.actions.get(element);
    if (!action) {
      return;
    }

    if (action.remove) {
      element.remove();
      changed += 1;
      return;
    }

    if (action.pathData) {
      element.setAttribute('d', action.pathData);
      changed += 1;
    }

    if (action.fillRule !== undefined && action.fillRule !== element.getAttribute('fill-rule')) {
      if (action.fillRule) {
        element.setAttribute('fill-rule', action.fillRule);
      } else {
        element.removeAttribute('fill-rule');
      }

      changed += 1;
    }
  });

  return {
    source: serializeSvg(root),
    changed,
    skipped: 0,
  };
}

export function cleanupReferences(source: string, options: ReferenceCleanupOptions = {}): NormalizationResult {
  const root = parseSvgRoot(source);
  const referenceCleanup = analyzeReferenceCleanup(root, options);
  let changed = 0;

  [root, ...Array.from(root.querySelectorAll('*'))].forEach((element) => {
    const action = referenceCleanup.actions.get(element);
    if (!action) {
      return;
    }

    if (action.type === 'remove-element') {
      element.remove();
      changed += 1;
      return;
    }

    removeReferenceAttributes(element);
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

export function cleanupAuthoringMetadata(source: string): NormalizationResult {
  const root = parseSvgRoot(source);
  let changed = 0;

  Array.from(root.querySelectorAll('*')).forEach((element) => {
    const prefix = element.tagName.includes(':') ? element.tagName.split(':')[0] : '';
    const localName = getLocalTagName(element).toLowerCase();
    if (localName === 'metadata' || removableAuthoringElementPrefixes.has(prefix)) {
      element.remove();
      changed += 1;
    }
  });

  [root, ...Array.from(root.querySelectorAll('*'))].forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const prefix = attribute.name.includes(':') ? attribute.name.split(':')[0] : '';
      if (removableAuthoringPrefixes.has(prefix)) {
        element.removeAttribute(attribute.name);
        changed += 1;
      }
    });
  });

  removableAuthoringPrefixes.forEach((prefix) => {
    const namespaceAttribute = `xmlns:${prefix}`;
    if (root.hasAttribute(namespaceAttribute)) {
      root.removeAttribute(namespaceAttribute);
      changed += 1;
    }
  });

  return {
    source: serializeSvg(root),
    changed,
    skipped: 0,
  };
}

export function applySafeRepairs(source: string, options: TextConversionOptions = {}): SafeRepairResult {
  const styleResult = inlineSimpleStyles(source);
  const textResult = convertTextToPaths(styleResult.source, options);
  const strokeResult = convertStrokesToOutlines(textResult.source);
  const shapeResult = normalizeShapesToPaths(strokeResult.source);
  const directTransformResult = bakeDirectTransforms(shapeResult.source);
  const containerTransformResult = bakeContainerTransforms(directTransformResult.source);
  const useExpansionResult = expandUseElements(containerTransformResult.source);
  const pathCleanupResult = cleanupPaths(useExpansionResult.source);

  return {
    source: pathCleanupResult.source,
    changed:
      styleResult.changed +
      textResult.changed +
      shapeResult.changed +
      strokeResult.changed +
      directTransformResult.changed +
      containerTransformResult.changed +
      useExpansionResult.changed +
      pathCleanupResult.changed,
    skipped:
      styleResult.skipped +
      textResult.skipped +
      strokeResult.skipped +
      containerTransformResult.skipped +
      useExpansionResult.skipped,
    details: {
      styleRules: styleResult.changed,
      textPaths: textResult.changed,
      shapes: shapeResult.changed,
      strokeOutlines: strokeResult.changed,
      pathCleanups: pathCleanupResult.changed,
      directTransforms: directTransformResult.changed,
      containerTransforms: containerTransformResult.changed,
      useExpansions: useExpansionResult.changed,
      blockedStyleRules: styleResult.skipped,
      blockedTexts: textResult.skipped,
      blockedStrokeOutlines: strokeResult.skipped,
      blockedContainers: containerTransformResult.skipped,
      blockedUses: useExpansionResult.skipped,
    },
  };
}

export function getStrokeOutlineMessage(outlineableCount: number, blockedCount: number) {
  if (outlineableCount === 0 && blockedCount === 0) {
    return 'No stroke-only geometry detected.';
  }

  if (blockedCount === 0) {
    return `${outlineableCount} stroke-driven node${outlineableCount === 1 ? '' : 's'} can be converted to filled outlines.`;
  }

  if (outlineableCount === 0) {
    return `${blockedCount} stroke-driven node${blockedCount === 1 ? '' : 's'} remain blocked by unsupported stroke styling or geometry.`;
  }

  return `${outlineableCount} stroke-driven node${outlineableCount === 1 ? '' : 's'} can be converted to filled outlines. ${blockedCount} remain blocked by unsupported stroke styling or geometry.`;
}

export function getPathCleanupMessage(pathCleanupCount: number) {
  if (pathCleanupCount === 0) {
    return 'No path cleanup opportunities detected.';
  }

  return `${pathCleanupCount} path cleanup${pathCleanupCount === 1 ? '' : 's'} can close near-open paths, join fragments, repair polygon winding, stabilize self-intersections, or remove duplicate and tiny geometry.`;
}

export function getReferenceCleanupMessage(referenceCleanupCount: number) {
  if (referenceCleanupCount === 0) {
    return 'No broken, chained, or external dependency references detected for cleanup.';
  }

  return `${referenceCleanupCount} broken, chained, or external dependency reference${referenceCleanupCount === 1 ? '' : 's'} can be cleaned. External <a> links are preserved.`;
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
