export type InteractionHoverPresetId = 'none' | 'lift' | 'glow';
export type InteractionFocusPresetId = 'none' | 'ring' | 'glow';
export type InteractionBehaviorPresetId = 'button' | 'link-card' | 'focusable-hotspot';

export type InteractionDraft = {
  ariaLabel: string;
  tabIndex: string;
  focusable: string;
  pointerEvents: string;
  cursor: string;
  href: string;
  target: string;
  rel: string;
  tooltipText: string;
  hoverPreset: InteractionHoverPresetId;
  focusPreset: InteractionFocusPresetId;
};

export type InteractionMutationResult = {
  source: string;
  updatedCount: number;
  skippedPaths: string[];
};

export type InteractionSignalSummary = {
  href: string | null;
  hrefKind: ReturnType<typeof classifyInteractionHref>;
  inlineEventAttributes: string[];
  pointerEvents: string | null;
  cursor: string | null;
  tabIndex: string | null;
  focusable: string | null;
  ariaLabel: string | null;
  target: string | null;
  rel: string | null;
  tooltipText: string | null;
  hoverPreset: InteractionHoverPresetId;
  focusPreset: InteractionFocusPresetId;
  hasManagedStyles: boolean;
};

export type InteractionBehaviorPresetDefinition = {
  id: InteractionBehaviorPresetId;
  label: string;
  description: string;
  tags: string[];
  apply: (draft: InteractionDraft) => InteractionDraft;
};

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const WORKBENCH_INTERACTION_STYLE_ATTRIBUTE = 'data-svg-workbench-interaction';
const WORKBENCH_TOOLTIP_ATTRIBUTE = 'data-svg-workbench-tooltip';
const hoverPresetClassMap: Record<Exclude<InteractionHoverPresetId, 'none'>, string> = {
  lift: 'svgwb-hover-lift',
  glow: 'svgwb-hover-glow',
};
const focusPresetClassMap: Record<Exclude<InteractionFocusPresetId, 'none'>, string> = {
  ring: 'svgwb-focus-ring',
  glow: 'svgwb-focus-glow',
};
const managedInteractionClasses = [
  ...Object.values(hoverPresetClassMap),
  ...Object.values(focusPresetClassMap),
];

const interactionStylesheet = [
  '.svgwb-hover-lift, .svgwb-hover-glow, .svgwb-focus-ring, .svgwb-focus-glow { transition: transform 160ms ease, filter 160ms ease, opacity 160ms ease; transform-box: fill-box; transform-origin: center; }',
  '.svgwb-hover-lift:hover, .svgwb-hover-lift:focus-visible { transform: translateY(-2px) scale(1.03); }',
  '.svgwb-hover-glow:hover, .svgwb-hover-glow:focus-visible { filter: drop-shadow(0 0 6px rgba(255, 138, 61, 0.78)) brightness(1.05); }',
  '.svgwb-focus-ring:focus, .svgwb-focus-ring:focus-visible { filter: drop-shadow(0 0 0 rgba(0, 0, 0, 0)) drop-shadow(0 0 7px rgba(37, 99, 235, 0.94)); }',
  '.svgwb-focus-glow:focus, .svgwb-focus-glow:focus-visible { transform: scale(1.02); filter: drop-shadow(0 0 8px rgba(6, 182, 212, 0.88)) brightness(1.08); }',
].join('\n');

export const interactionHoverPresets: Array<{ id: InteractionHoverPresetId; label: string; description: string }> = [
  { id: 'none', label: 'None', description: 'Do not add a hover-specific state style.' },
  { id: 'lift', label: 'Lift', description: 'Raise and scale the element slightly on hover.' },
  { id: 'glow', label: 'Glow', description: 'Add a warm hover glow that also works for pointer focus.' },
];

export const interactionFocusPresets: Array<{ id: InteractionFocusPresetId; label: string; description: string }> = [
  { id: 'none', label: 'None', description: 'Do not add a focus-specific state style.' },
  { id: 'ring', label: 'Ring', description: 'Add a cool focus ring glow for keyboard focus.' },
  { id: 'glow', label: 'Glow', description: 'Scale and glow the focused element.' },
];

export const interactionBehaviorPresets: InteractionBehaviorPresetDefinition[] = [
  {
    id: 'button',
    label: 'Button',
    description: 'Turns the selection into a keyboard-focusable button-like control with pointer affordance and crisp hover/focus feedback.',
    tags: ['cursor pointer', 'hover lift', 'focus ring'],
    apply: (draft) => ({
      ...draft,
      tabIndex: draft.tabIndex.trim().length > 0 ? draft.tabIndex : '0',
      focusable: 'true',
      pointerEvents: draft.pointerEvents.trim().length > 0 ? draft.pointerEvents : 'bounding-box',
      cursor: 'pointer',
      hoverPreset: 'lift',
      focusPreset: 'ring',
    }),
  },
  {
    id: 'link-card',
    label: 'Link card',
    description: 'Optimized for larger card-like hit areas that should feel interactive, lift on hover, and stay obvious during keyboard traversal.',
    tags: ['focusable', 'hover glow', 'focus glow'],
    apply: (draft) => ({
      ...draft,
      tabIndex: draft.tabIndex.trim().length > 0 ? draft.tabIndex : '0',
      focusable: 'true',
      pointerEvents: draft.pointerEvents.trim().length > 0 ? draft.pointerEvents : 'bounding-box',
      cursor: 'pointer',
      hoverPreset: 'glow',
      focusPreset: 'glow',
    }),
  },
  {
    id: 'focusable-hotspot',
    label: 'Focusable hotspot',
    description: 'Makes a touch or image hotspot reachable from the keyboard without forcing link markup, with a glow on hover and a clear focus ring.',
    tags: ['keyboard target', 'tooltip ready', 'bounding box'],
    apply: (draft) => ({
      ...draft,
      tabIndex: draft.tabIndex.trim().length > 0 ? draft.tabIndex : '0',
      focusable: 'true',
      pointerEvents: 'bounding-box',
      cursor: 'pointer',
      hoverPreset: 'glow',
      focusPreset: 'ring',
    }),
  },
];

function getLocalTagName(element: Element) {
  return element.localName || element.tagName.split(':').at(-1) || element.tagName;
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

function normalizeClassList(classValue: string | null) {
  return Array.from(new Set((classValue ?? '').split(/\s+/).map((token) => token.trim()).filter(Boolean)));
}

function setClassList(target: Element, classes: string[]) {
  if (classes.length === 0) {
    if (!target.hasAttribute('class')) {
      return false;
    }

    target.removeAttribute('class');
    return true;
  }

  const nextValue = classes.join(' ');
  if ((target.getAttribute('class') ?? '') === nextValue) {
    return false;
  }

  target.setAttribute('class', nextValue);
  return true;
}

function setManagedPresetClass<TPreset extends string>(
  target: Element,
  preset: TPreset,
  classMap: Partial<Record<TPreset, string>>,
) {
  const currentClasses = normalizeClassList(target.getAttribute('class'));
  const managedClassesForPreset = Object.values(classMap);
  const nextClasses = currentClasses.filter((className) => !managedClassesForPreset.includes(className));
  const presetClass = classMap[preset];
  if (presetClass) {
    nextClasses.push(presetClass);
  }

  return setClassList(target, nextClasses);
}

function getDirectChildElementsByTagName(target: Element, tagName: string) {
  return Array.from(target.children).filter((child) => getLocalTagName(child).toLowerCase() === tagName.toLowerCase());
}

function readTooltipText(target: Element) {
  const titleElement = getDirectChildElementsByTagName(target, 'title')[0];
  return titleElement?.textContent?.trim() || null;
}

function syncTooltip(target: Element, tooltipText: string) {
  const normalizedText = tooltipText.trim();
  const titleElements = getDirectChildElementsByTagName(target, 'title');
  const managedTitle = titleElements.find((child) => child.getAttribute(WORKBENCH_TOOLTIP_ATTRIBUTE) === 'true');

  if (normalizedText.length === 0) {
    if (!managedTitle) {
      return false;
    }

    managedTitle.remove();
    return true;
  }

  const tooltipElement = managedTitle ?? titleElements[0] ?? target.ownerDocument.createElementNS(SVG_NAMESPACE, 'title');
  let changed = false;

  if (!tooltipElement.parentElement) {
    target.insertBefore(tooltipElement, target.firstChild);
    changed = true;
  }

  if (tooltipElement.getAttribute(WORKBENCH_TOOLTIP_ATTRIBUTE) !== 'true') {
    tooltipElement.setAttribute(WORKBENCH_TOOLTIP_ATTRIBUTE, 'true');
    changed = true;
  }

  if ((tooltipElement.textContent ?? '') !== normalizedText) {
    tooltipElement.textContent = normalizedText;
    changed = true;
  }

  return changed;
}

function hasManagedInteractionClasses(root: SVGSVGElement) {
  return managedInteractionClasses.some((className) => root.querySelector(`.${className}`));
}

function syncInteractionStylesheet(root: SVGSVGElement) {
  const existingStyleElement = root.querySelector(`style[${WORKBENCH_INTERACTION_STYLE_ATTRIBUTE}="true"]`);
  const shouldKeep = hasManagedInteractionClasses(root);

  if (!shouldKeep) {
    if (existingStyleElement) {
      existingStyleElement.remove();
      return true;
    }

    return false;
  }

  const styleElement = existingStyleElement instanceof Element
    ? existingStyleElement
    : root.ownerDocument.createElementNS(SVG_NAMESPACE, 'style');
  let changed = false;

  if (!styleElement.parentElement) {
    root.insertBefore(styleElement, root.firstChild);
    changed = true;
  }

  if (styleElement.getAttribute(WORKBENCH_INTERACTION_STYLE_ATTRIBUTE) !== 'true') {
    styleElement.setAttribute(WORKBENCH_INTERACTION_STYLE_ATTRIBUTE, 'true');
    changed = true;
  }

  if ((styleElement.textContent ?? '') !== interactionStylesheet) {
    styleElement.textContent = interactionStylesheet;
    changed = true;
  }

  return changed;
}

function getPresetFromClasses<TPreset extends string>(
  classValue: string | null,
  classMap: Record<string, string>,
  fallback: TPreset,
) {
  const classes = normalizeClassList(classValue);
  const match = (Object.entries(classMap) as Array<[string, string]>).find(([, className]) => classes.includes(className));
  return match?.[0] ?? fallback;
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

function canEditLinkAttributes(target: Element) {
  return getLocalTagName(target).toLowerCase() === 'a';
}

export function createInteractionDraft(attributes: Partial<Record<string, string>> = {}): InteractionDraft {
  return {
    ariaLabel: attributes['aria-label'] ?? '',
    tabIndex: attributes.tabindex ?? '',
    focusable: attributes.focusable ?? '',
    pointerEvents: attributes['pointer-events'] ?? '',
    cursor: attributes.cursor ?? '',
    href: attributes.href ?? attributes['xlink:href'] ?? '',
    target: attributes.target ?? '',
    rel: attributes.rel ?? '',
    tooltipText: '',
    hoverPreset: 'none',
    focusPreset: 'none',
  };
}

export function inferInteractionDraftForPath(source: string, targetPath: string): InteractionDraft | null {
  try {
    const root = parseSvgRoot(source);
    const target = resolveElementByPath(root, targetPath);
    if (!target) {
      return null;
    }

    const attributes = Object.fromEntries(Array.from(target.attributes).map((attribute) => [attribute.name, attribute.value]));

    return {
      ...createInteractionDraft(attributes),
      tooltipText: readTooltipText(target) ?? '',
      hoverPreset: getPresetFromClasses(target.getAttribute('class'), hoverPresetClassMap, 'none') as InteractionHoverPresetId,
      focusPreset: getPresetFromClasses(target.getAttribute('class'), focusPresetClassMap, 'none') as InteractionFocusPresetId,
    };
  } catch {
    return null;
  }
}

export function applyInteractionBehaviorPreset(
  draft: InteractionDraft,
  presetId: InteractionBehaviorPresetId,
) {
  const preset = interactionBehaviorPresets.find((candidate) => candidate.id === presetId);
  return preset ? preset.apply(draft) : draft;
}

export function applyInteractionDraftToSource(
  source: string,
  targetPaths: string[],
  draft: InteractionDraft,
): InteractionMutationResult {
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

    changed = setOrRemoveAttribute(target, 'aria-label', draft.ariaLabel) || changed;
    changed = setOrRemoveAttribute(target, 'tabindex', draft.tabIndex) || changed;
    changed = setOrRemoveAttribute(target, 'focusable', draft.focusable) || changed;
    changed = setOrRemoveAttribute(target, 'pointer-events', draft.pointerEvents) || changed;
    changed = setOrRemoveAttribute(target, 'cursor', draft.cursor) || changed;
    changed = setManagedPresetClass(target, draft.hoverPreset, hoverPresetClassMap) || changed;
    changed = setManagedPresetClass(target, draft.focusPreset, focusPresetClassMap) || changed;
    changed = syncTooltip(target, draft.tooltipText) || changed;

    if (canEditLinkAttributes(target)) {
      changed = setOrRemoveAttribute(target, 'href', draft.href) || changed;
      if (normalizeAttributeValue(draft.href).length === 0 && target.hasAttribute('xlink:href')) {
        target.removeAttribute('xlink:href');
        changed = true;
      }
      changed = setOrRemoveAttribute(target, 'target', draft.target) || changed;
      changed = setOrRemoveAttribute(target, 'rel', draft.rel) || changed;
    }

    if (changed) {
      updatedCount += 1;
    }
  });

  syncInteractionStylesheet(root);

  return {
    source: new XMLSerializer().serializeToString(root),
    updatedCount,
    skippedPaths,
  };
}

export function isAnchorLikeNode(nodeName: string) {
  return nodeName.toLowerCase() === 'a';
}

export function classifyInteractionHref(value: string | null) {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (!normalized) {
    return 'none' as const;
  }

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

export function getInteractionSignalSummary(
  attributes: Record<string, string>,
  options: Partial<Pick<InteractionSignalSummary, 'tooltipText' | 'hoverPreset' | 'focusPreset' | 'hasManagedStyles'>> = {},
): InteractionSignalSummary {
  const inlineEventAttributes = Object.keys(attributes)
    .filter((attributeName) => attributeName.toLowerCase().startsWith('on'))
    .sort();
  const href = attributes.href ?? attributes['xlink:href'] ?? null;

  return {
    href,
    hrefKind: classifyInteractionHref(href),
    inlineEventAttributes,
    pointerEvents: attributes['pointer-events'] ?? null,
    cursor: attributes.cursor ?? null,
    tabIndex: attributes.tabindex ?? null,
    focusable: attributes.focusable ?? null,
    ariaLabel: attributes['aria-label'] ?? null,
    target: attributes.target ?? null,
    rel: attributes.rel ?? null,
    tooltipText: options.tooltipText ?? null,
    hoverPreset: options.hoverPreset ?? 'none',
    focusPreset: options.focusPreset ?? 'none',
    hasManagedStyles: options.hasManagedStyles ?? false,
  };
}

export function inspectInteractionForPath(source: string, targetPath: string): InteractionSignalSummary | null {
  try {
    const root = parseSvgRoot(source);
    const target = resolveElementByPath(root, targetPath);
    if (!target) {
      return null;
    }

    const attributes = Object.fromEntries(Array.from(target.attributes).map((attribute) => [attribute.name, attribute.value]));
    return getInteractionSignalSummary(attributes, {
      tooltipText: readTooltipText(target),
      hoverPreset: getPresetFromClasses(target.getAttribute('class'), hoverPresetClassMap, 'none') as InteractionHoverPresetId,
      focusPreset: getPresetFromClasses(target.getAttribute('class'), focusPresetClassMap, 'none') as InteractionFocusPresetId,
      hasManagedStyles: Boolean(root.querySelector(`style[${WORKBENCH_INTERACTION_STYLE_ATTRIBUTE}="true"]`)),
    });
  } catch {
    return null;
  }
}

export { SVG_NAMESPACE };