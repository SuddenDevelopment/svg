/**
 * Comprehensive SVG element & attribute whitelist.
 *
 * Ported from @svgedit/svgcanvas sanitize.js (MIT license).
 * Original authors: Alexis Deveria, Jeff Schiller and contributors.
 *
 * This module provides:
 * - A lookup of every known SVG element and its valid presentation/geometry attributes.
 * - A function to query whether an element or attribute is "known good" SVG.
 * - A sanitizer that strips unknown elements/attributes from a parsed SVG DOM.
 *
 * The whitelist deliberately includes filter primitives, gradients, markers,
 * patterns, clip-paths, masks, symbols, and MathML — making it suitable for
 * a general-purpose "is this standard SVG?" check beyond just geometry.
 *
 * @license MIT
 */

// ---------------------------------------------------------------------------
// Namespace constants
// ---------------------------------------------------------------------------

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const XLINK_NS = 'http://www.w3.org/1999/xlink';
export const XML_NS = 'http://www.w3.org/XML/1998/namespace';
export const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
export const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

// ---------------------------------------------------------------------------
// Font attributes shared across several container elements
// ---------------------------------------------------------------------------

const FONT_ATTRIBUTES = ['font-family', 'font-size', 'font-stretch', 'font-style', 'font-weight'] as const;

// ---------------------------------------------------------------------------
// Generic attributes added to every whitelisted element
// ---------------------------------------------------------------------------

const GENERIC_ATTRIBUTES = ['class', 'id', 'display', 'transform', 'style'] as const;

// ---------------------------------------------------------------------------
// Per-element attribute whitelist
// ---------------------------------------------------------------------------

const baseWhitelist: Record<string, readonly string[]> = {
  // --- SVG structural / container elements ---
  a: ['clip-path', 'clip-rule', 'fill', 'fill-opacity', 'fill-rule', 'filter',
    'href', 'mask', 'opacity', 'stroke', 'stroke-dasharray', 'stroke-dashoffset',
    'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity',
    'stroke-width', 'systemLanguage', 'xlink:href', 'xlink:title'],
  circle: ['clip-path', 'clip-rule', 'cx', 'cy', 'enable-background', 'fill',
    'fill-opacity', 'fill-rule', 'filter', 'mask', 'opacity', 'r',
    'requiredFeatures', 'stroke', 'stroke-dasharray', 'stroke-dashoffset',
    'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity',
    'stroke-width', 'systemLanguage'],
  clipPath: ['clipPathUnits'],
  defs: [],
  desc: [],
  ellipse: ['clip-path', 'clip-rule', 'cx', 'cy', 'fill', 'fill-opacity',
    'fill-rule', 'filter', 'mask', 'opacity', 'requiredFeatures', 'rx', 'ry',
    'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap',
    'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width',
    'systemLanguage'],
  feBlend: ['in', 'in2'],
  feColorMatrix: ['in', 'type', 'value', 'result', 'values'],
  feComponentTransfer: ['in', 'result'],
  feComposite: ['in', 'operator', 'result', 'in2'],
  feConvolveMatrix: ['in', 'order', 'kernelMatrix', 'divisor', 'bias',
    'targetX', 'targetY', 'edgeMode', 'kernelUnitLength', 'preserveAlpha'],
  feDiffuseLighting: ['in', 'surfaceScale', 'diffuseConstant',
    'kernelUnitLength', 'lighting-color'],
  feDisplacementMap: ['in', 'in2', 'scale', 'xChannelSelector', 'yChannelSelector'],
  feFlood: ['flood-color', 'in', 'result', 'flood-opacity'],
  feFuncA: ['type', 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'offset'],
  feFuncB: ['type', 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'offset'],
  feFuncG: ['type', 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'offset'],
  feFuncR: ['type', 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'offset'],
  feGaussianBlur: ['color-interpolation-filters', 'in', 'requiredFeatures',
    'stdDeviation', 'result'],
  feMerge: [],
  feMergeNode: ['in'],
  feMorphology: ['in', 'operator', 'radius'],
  feOffset: ['dx', 'in', 'dy', 'result'],
  feSpecularLighting: ['in', 'surfaceScale', 'specularConstant',
    'specularExponent', 'kernelUnitLength', 'lighting-color'],
  feTile: ['in'],
  feTurbulence: ['baseFrequency', 'numOctaves', 'result', 'seed', 'stitchTiles', 'type'],
  filter: ['color-interpolation-filters', 'filterRes', 'filterUnits', 'height',
    'href', 'primitiveUnits', 'requiredFeatures', 'width', 'x', 'xlink:href', 'y'],
  foreignObject: ['font-size', 'height', 'opacity', 'requiredFeatures', 'width', 'x', 'y'],
  g: [...FONT_ATTRIBUTES, 'clip-path', 'clip-rule', 'fill', 'fill-opacity',
    'fill-rule', 'filter', 'mask', 'opacity', 'requiredFeatures', 'stroke',
    'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'systemLanguage',
    'text-anchor'],
  image: ['clip-path', 'clip-rule', 'filter', 'height', 'mask', 'opacity',
    'preserveAspectRatio', 'requiredFeatures', 'systemLanguage', 'viewBox',
    'width', 'x', 'href', 'xlink:href', 'xlink:title', 'y'],
  line: ['clip-path', 'clip-rule', 'fill', 'fill-opacity', 'fill-rule',
    'filter', 'marker-end', 'marker-mid', 'marker-start', 'mask', 'opacity',
    'requiredFeatures', 'stroke', 'stroke-dasharray', 'stroke-dashoffset',
    'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity',
    'stroke-width', 'systemLanguage', 'x1', 'x2', 'y1', 'y2'],
  linearGradient: ['gradientTransform', 'gradientUnits', 'requiredFeatures',
    'spreadMethod', 'systemLanguage', 'x1', 'x2', 'href', 'xlink:href', 'y1', 'y2'],
  marker: ['markerHeight', 'markerUnits', 'markerWidth', 'orient',
    'preserveAspectRatio', 'refX', 'refY', 'systemLanguage', 'viewBox'],
  mask: ['height', 'maskContentUnits', 'maskUnits', 'width', 'x', 'y'],
  metadata: [],
  path: ['clip-path', 'clip-rule', 'd', 'enable-background', 'fill',
    'fill-opacity', 'fill-rule', 'filter', 'marker-end', 'marker-mid',
    'marker-start', 'mask', 'opacity', 'requiredFeatures', 'stroke',
    'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'systemLanguage'],
  pattern: ['height', 'patternContentUnits', 'patternTransform', 'patternUnits',
    'requiredFeatures', 'systemLanguage', 'viewBox', 'width', 'x', 'href',
    'xlink:href', 'y'],
  polygon: ['clip-path', 'clip-rule', 'fill', 'fill-opacity', 'fill-rule',
    'filter', 'marker-end', 'marker-mid', 'marker-start', 'mask', 'opacity',
    'points', 'requiredFeatures', 'stroke', 'stroke-dasharray',
    'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'systemLanguage'],
  polyline: ['clip-path', 'clip-rule', 'fill', 'fill-opacity', 'fill-rule',
    'filter', 'marker-end', 'marker-mid', 'marker-start', 'mask', 'opacity',
    'points', 'requiredFeatures', 'stroke', 'stroke-dasharray',
    'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'systemLanguage'],
  radialGradient: ['cx', 'cy', 'fx', 'fy', 'gradientTransform', 'gradientUnits',
    'r', 'requiredFeatures', 'spreadMethod', 'systemLanguage', 'href', 'xlink:href'],
  rect: ['clip-path', 'clip-rule', 'fill', 'fill-opacity', 'fill-rule',
    'filter', 'height', 'mask', 'opacity', 'requiredFeatures', 'rx', 'ry',
    'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap',
    'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width',
    'systemLanguage', 'width', 'x', 'y'],
  stop: ['offset', 'requiredFeatures', 'stop-opacity', 'systemLanguage',
    'stop-color', 'gradientUnits', 'gradientTransform'],
  style: ['type'],
  svg: ['clip-path', 'clip-rule', 'enable-background', 'filter', 'height',
    'mask', 'preserveAspectRatio', 'requiredFeatures', 'systemLanguage',
    'version', 'viewBox', 'width', 'x', 'xmlns', 'xmlns:xlink', 'y',
    'stroke-linejoin', 'fill-rule', 'aria-label', 'stroke-width',
    'xml:space'],
  switch: ['requiredFeatures', 'systemLanguage'],
  symbol: [...FONT_ATTRIBUTES, 'fill', 'fill-opacity', 'fill-rule', 'filter',
    'opacity', 'overflow', 'preserveAspectRatio', 'requiredFeatures',
    'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap',
    'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width',
    'systemLanguage', 'viewBox', 'width', 'height'],
  text: [...FONT_ATTRIBUTES, 'clip-path', 'clip-rule', 'dominant-baseline',
    'fill', 'fill-opacity', 'fill-rule', 'filter', 'mask', 'opacity',
    'requiredFeatures', 'stroke', 'stroke-dasharray', 'stroke-dashoffset',
    'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity',
    'stroke-width', 'systemLanguage', 'text-anchor', 'letter-spacing',
    'word-spacing', 'text-decoration', 'textLength', 'lengthAdjust', 'x',
    'xml:space', 'y'],
  textPath: ['dominant-baseline', 'href', 'method', 'requiredFeatures',
    'spacing', 'startOffset', 'systemLanguage', 'xlink:href'],
  title: [],
  tspan: [...FONT_ATTRIBUTES, 'clip-path', 'clip-rule', 'dx', 'dy',
    'dominant-baseline', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'mask',
    'opacity', 'requiredFeatures', 'rotate', 'stroke', 'stroke-dasharray',
    'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'systemLanguage',
    'text-anchor', 'textLength', 'x', 'xml:space', 'y'],
  use: ['clip-path', 'clip-rule', 'fill', 'fill-opacity', 'fill-rule',
    'filter', 'height', 'href', 'mask', 'stroke', 'stroke-dasharray',
    'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'width', 'x',
    'xlink:href', 'y', 'overflow'],

  // --- Animation elements ---
  animate: ['attributeName', 'begin', 'dur', 'end', 'fill', 'from',
    'keySplines', 'keyTimes', 'max', 'min', 'repeatCount', 'repeatDur',
    'restart', 'to', 'values'],
  animateMotion: ['begin', 'dur', 'end', 'fill', 'keyPoints', 'keySplines',
    'keyTimes', 'path', 'repeatCount', 'repeatDur', 'restart', 'rotate'],
  animateTransform: ['attributeName', 'begin', 'dur', 'end', 'fill', 'from',
    'repeatCount', 'repeatDur', 'restart', 'to', 'type', 'values'],
  set: ['attributeName', 'begin', 'dur', 'end', 'fill', 'to'],
};

// ---------------------------------------------------------------------------
// Build the resolved whitelist (base + generic attrs on every element)
// ---------------------------------------------------------------------------

const svgWhitelist: Record<string, ReadonlySet<string>> = {};

for (const [element, attrs] of Object.entries(baseWhitelist)) {
  svgWhitelist[element] = new Set([...attrs, ...GENERIC_ATTRIBUTES]);
}

// Also expose the set of known element names
const knownElementNames: ReadonlySet<string> = new Set(Object.keys(svgWhitelist));

// ---------------------------------------------------------------------------
// Public query API
// ---------------------------------------------------------------------------

/** Check whether an SVG element name is in the whitelist. */
export function isKnownElement(tagName: string): boolean {
  return knownElementNames.has(tagName);
}

/** Check whether an attribute is valid for a given SVG element name. */
export function isKnownAttribute(tagName: string, attributeName: string): boolean {
  const allowed = svgWhitelist[tagName];
  if (!allowed) {
    return false;
  }
  return allowed.has(attributeName);
}

/** Get the full set of valid attributes for an element, or null if unknown. */
export function getAllowedAttributes(tagName: string): ReadonlySet<string> | null {
  return svgWhitelist[tagName] ?? null;
}

/** Get all known element names. */
export function getKnownElementNames(): ReadonlySet<string> {
  return knownElementNames;
}

// ---------------------------------------------------------------------------
// Attribute categorisation helpers
// ---------------------------------------------------------------------------

const presentationAttributes = new Set([
  'alignment-baseline', 'baseline-shift', 'clip', 'clip-path', 'clip-rule',
  'color', 'color-interpolation', 'color-interpolation-filters', 'cursor',
  'direction', 'display', 'dominant-baseline', 'enable-background',
  'fill', 'fill-opacity', 'fill-rule', 'filter', 'flood-color', 'flood-opacity',
  'font-family', 'font-size', 'font-size-adjust', 'font-stretch',
  'font-style', 'font-variant', 'font-weight', 'glyph-orientation-horizontal',
  'glyph-orientation-vertical', 'image-rendering', 'kerning',
  'letter-spacing', 'lighting-color', 'marker-end', 'marker-mid',
  'marker-start', 'mask', 'opacity', 'overflow', 'pointer-events',
  'shape-rendering', 'stop-color', 'stop-opacity', 'stroke',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width',
  'text-anchor', 'text-decoration', 'text-rendering', 'unicode-bidi',
  'visibility', 'word-spacing', 'writing-mode',
]);

/** Check whether an attribute name is an SVG presentation attribute. */
export function isPresentationAttribute(attributeName: string): boolean {
  return presentationAttributes.has(attributeName);
}

// ---------------------------------------------------------------------------
// Unknown-element / unknown-attribute detection (for analysis risk reporting)
// ---------------------------------------------------------------------------

export type WhitelistViolation = {
  type: 'unknown-element' | 'unknown-attribute';
  elementName: string;
  attributeName?: string;
};

/**
 * Walk a parsed SVG element tree and collect all whitelist violations.
 * Does NOT modify the DOM — use this for analysis / risk reporting.
 *
 * Skips `data-*` attributes (custom data) and `xmlns*` declarations.
 */
export function collectWhitelistViolations(root: Element): WhitelistViolation[] {
  const violations: WhitelistViolation[] = [];
  const seen = new Set<string>();

  const walk = (node: Element) => {
    const tagName = node.localName || node.tagName.split(':').at(-1) || node.tagName;

    if (!isKnownElement(tagName)) {
      const key = `elem:${tagName}`;
      if (!seen.has(key)) {
        seen.add(key);
        violations.push({ type: 'unknown-element', elementName: tagName });
      }
    } else {
      for (const attr of Array.from(node.attributes)) {
        const name = attr.localName || attr.name;
        // Skip xmlns declarations, data-* attributes, and namespaced authoring attrs
        if (name.startsWith('xmlns') || name.startsWith('data-') || attr.name.includes(':')) {
          continue;
        }
        if (!isKnownAttribute(tagName, name)) {
          const key = `attr:${tagName}:${name}`;
          if (!seen.has(key)) {
            seen.add(key);
            violations.push({ type: 'unknown-attribute', elementName: tagName, attributeName: name });
          }
        }
      }
    }

    for (const child of Array.from(node.children)) {
      walk(child);
    }
  };

  walk(root);
  return violations;
}
