export type StyleDraft = {
  fill: string;
  stroke: string;
  strokeWidth: string;
  opacity: string;
  fillOpacity: string;
  strokeOpacity: string;
  display: string;
  visibility: string;
  fillRule: string;
};

export type StyleMutationResult = {
  source: string;
  updatedCount: number;
  skippedPaths: string[];
};

export function isStyleDirectlyHidden(attributes: Partial<Record<string, string>> = {}) {
  const display = attributes.display?.trim().toLowerCase() ?? '';
  const visibility = attributes.visibility?.trim().toLowerCase() ?? '';
  return display === 'none' || visibility === 'hidden' || visibility === 'collapse';
}

function parseSvgRoot(source: string) {
  const documentRoot = new DOMParser().parseFromString(source, 'image/svg+xml');
  const parserError = documentRoot.querySelector('parsererror');
  if (parserError) {
    throw new Error(parserError.textContent?.trim() || 'Unable to parse SVG markup.');
  }

  const documentElement = documentRoot.documentElement;
  if ((documentElement.localName || documentElement.tagName).toLowerCase() !== 'svg') {
    throw new Error('The provided markup does not have an <svg> root element.');
  }

  return documentElement as unknown as SVGSVGElement;
}

function resolveElementByPath(root: SVGSVGElement, path: string) {
  const segments = path.split('.').map((segment) => Number(segment));
  if (segments.length === 0 || segments[0] !== 0 || segments.some((segment) => Number.isNaN(segment) || segment < 0)) {
    return null;
  }

  let current: Element = root;
  for (let index = 1; index < segments.length; index += 1) {
    const next = current.children.item(segments[index]);
    if (!(next instanceof Element)) {
      return null;
    }
    current = next;
  }

  return current;
}

function normalizeAttributeValue(value: string) {
  return value.trim();
}

function setOrRemoveAttribute(target: Element, attributeName: string, nextValue: string) {
  const normalizedValue = normalizeAttributeValue(nextValue);
  const currentValue = target.getAttribute(attributeName) ?? '';

  if (normalizedValue.length === 0) {
    if (!target.hasAttribute(attributeName)) {
      return false;
    }
    target.removeAttribute(attributeName);
    return true;
  }

  if (currentValue === normalizedValue) {
    return false;
  }

  target.setAttribute(attributeName, normalizedValue);
  return true;
}

export function createStyleDraft(attributes: Partial<Record<string, string>> = {}): StyleDraft {
  return {
    fill: attributes.fill ?? '',
    stroke: attributes.stroke ?? '',
    strokeWidth: attributes['stroke-width'] ?? '',
    opacity: attributes.opacity ?? '',
    fillOpacity: attributes['fill-opacity'] ?? '',
    strokeOpacity: attributes['stroke-opacity'] ?? '',
    display: attributes.display ?? '',
    visibility: attributes.visibility ?? '',
    fillRule: attributes['fill-rule'] ?? '',
  };
}

export function inferStyleDraftForPath(source: string, targetPath: string): StyleDraft | null {
  try {
    const root = parseSvgRoot(source);
    const target = resolveElementByPath(root, targetPath);
    if (!target) {
      return null;
    }

    const attributes = Object.fromEntries(Array.from(target.attributes).map((attr) => [attr.name, attr.value]));
    return createStyleDraft(attributes);
  } catch {
    return null;
  }
}

export function applyStyleDraftToSource(
  source: string,
  targetPaths: string[],
  draft: StyleDraft,
): StyleMutationResult {
  const root = parseSvgRoot(source);
  const uniquePaths = Array.from(new Set(targetPaths));
  const skippedPaths: string[] = [];
  let updatedCount = 0;

  uniquePaths.forEach((path) => {
    const target = resolveElementByPath(root, path);
    if (!target) {
      skippedPaths.push(path);
      return;
    }

    let changed = false;

    changed = setOrRemoveAttribute(target, 'fill', draft.fill) || changed;
    changed = setOrRemoveAttribute(target, 'stroke', draft.stroke) || changed;
    changed = setOrRemoveAttribute(target, 'stroke-width', draft.strokeWidth) || changed;
    changed = setOrRemoveAttribute(target, 'opacity', draft.opacity) || changed;
    changed = setOrRemoveAttribute(target, 'fill-opacity', draft.fillOpacity) || changed;
    changed = setOrRemoveAttribute(target, 'stroke-opacity', draft.strokeOpacity) || changed;
    changed = setOrRemoveAttribute(target, 'display', draft.display) || changed;
    changed = setOrRemoveAttribute(target, 'visibility', draft.visibility) || changed;
    changed = setOrRemoveAttribute(target, 'fill-rule', draft.fillRule) || changed;

    if (changed) {
      updatedCount += 1;
    }
  });

  return {
    source: new XMLSerializer().serializeToString(root),
    updatedCount,
    skippedPaths,
  };
}

export function setHiddenStateForPaths(
  source: string,
  targetPaths: string[],
  hidden: boolean,
): StyleMutationResult {
  const root = parseSvgRoot(source);
  const uniquePaths = Array.from(new Set(targetPaths));
  const skippedPaths: string[] = [];
  let updatedCount = 0;

  uniquePaths.forEach((path) => {
    const target = resolveElementByPath(root, path);
    if (!target) {
      skippedPaths.push(path);
      return;
    }

    let changed = false;

    if (hidden) {
      changed = setOrRemoveAttribute(target, 'display', 'none') || changed;
    } else {
      if ((target.getAttribute('display') ?? '').trim().toLowerCase() === 'none') {
        target.removeAttribute('display');
        changed = true;
      }

      const visibility = (target.getAttribute('visibility') ?? '').trim().toLowerCase();
      if (visibility === 'hidden' || visibility === 'collapse') {
        target.removeAttribute('visibility');
        changed = true;
      }
    }

    if (changed) {
      updatedCount += 1;
    }
  });

  return {
    source: new XMLSerializer().serializeToString(root),
    updatedCount,
    skippedPaths,
  };
}

/** Attempt to coerce an SVG paint value to a CSS hex color for <input type="color"> binding.
 *  Returns a fallback hex if the value is not a usable color. */
export function paintValueToColorInput(value: string): string {
  const trimmed = value.trim().toLowerCase();

  if (!trimmed || trimmed === 'none' || trimmed === 'inherit' || trimmed === 'currentcolor' || trimmed.startsWith('url(')) {
    return '#000000';
  }

  // Already a hex color
  if (/^#[0-9a-f]{3,8}$/.test(trimmed)) {
    // Normalize 3-char to 6-char hex for the color input
    if (trimmed.length === 4) {
      const [, r, g, b] = trimmed.split('');
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    // 8-char hex (with alpha) — strip alpha
    if (trimmed.length === 9) {
      return trimmed.slice(0, 7);
    }
    return trimmed;
  }

  // Named colors: attempt a quick lookup via canvas
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.fillStyle = trimmed;
      const resolved = ctx.fillStyle;
      if (/^#[0-9a-f]{6}$/.test(resolved)) {
        return resolved;
      }
    }
  } catch {
    // ignore
  }

  return '#000000';
}

/** Return true if a draft paint value is a special keyword that cannot round-trip through a hex color input. */
export function isPaintKeyword(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return !trimmed || trimmed === 'none' || trimmed === 'inherit' || trimmed === 'currentcolor' || trimmed.startsWith('url(');
}
