export type AnimationPresetId = 'fade-in' | 'pulse' | 'drift' | 'blink' | 'orbit' | 'color-shift';

export type AnimationRepeatMode = 'indefinite' | 'count';
export type AnimationStartMode = 'load' | 'click';
export type AnimationEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
export type AnimationMotionDirection = 'up' | 'down' | 'left' | 'right' | 'up-right' | 'up-left' | 'down-right' | 'down-left';
export type AnimationRotateMode = 'none' | 'auto';
export type AnimationReplaceMode = 'workbench' | 'all';

export type AnimationDraft = {
  presetId: AnimationPresetId;
  durationSeconds: number;
  delaySeconds: number;
  repeatMode: AnimationRepeatMode;
  repeatCount: number;
  fillMode: 'remove' | 'freeze';
  startMode: AnimationStartMode;
  easing: AnimationEasing;
  startOpacity: number;
  midOpacity: number;
  endOpacity: number;
  motionDirection: AnimationMotionDirection;
  motionDistance: number;
  orbitRadiusX: number;
  orbitRadiusY: number;
  rotateMode: AnimationRotateMode;
  colorFrom: string;
  colorMid: string;
  colorTo: string;
};

export type AnimationPresetDefinition = {
  id: AnimationPresetId;
  label: string;
  description: string;
  defaults: AnimationDraft;
};

export type AnimationMutationResult = {
  source: string;
  appliedCount: number;
  removedCount: number;
  skippedPaths: string[];
};

export type AnimationTargetDraft = {
  path: string;
  draft: AnimationDraft;
};

export type ElementAnimationSummary = {
  nodeName: 'animate' | 'animateTransform' | 'animateMotion' | 'set';
  presetId: AnimationPresetId | null;
  label: string;
  detail: string;
  begin: string | null;
  duration: string | null;
  repeatCount: string | null;
  isWorkbenchAuthored: boolean;
};

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const WORKBENCH_ANIMATION_ATTRIBUTE = 'data-svg-workbench-animation';
const WORKBENCH_PRESET_ATTRIBUTE = 'data-svg-workbench-animation-preset';
const animationNodeNames = new Set(['animate', 'animatemotion', 'animatetransform', 'set']);
const disallowedAnimationTargets = new Set([
  'animate',
  'animatemotion',
  'animatetransform',
  'defs',
  'desc',
  'foreignobject',
  'lineargradient',
  'marker',
  'mask',
  'metadata',
  'radialgradient',
  'script',
  'set',
  'stop',
  'style',
  'title',
]);

export const animationPresets: AnimationPresetDefinition[] = [
  {
    id: 'fade-in',
    label: 'Fade in',
    description: 'Bring the target in from transparent to opaque.',
    defaults: {
      presetId: 'fade-in',
      durationSeconds: 1.2,
      delaySeconds: 0,
      repeatMode: 'count',
      repeatCount: 1,
      fillMode: 'freeze',
      startMode: 'load',
      easing: 'ease-out',
      startOpacity: 0,
      midOpacity: 0.6,
      endOpacity: 1,
      motionDirection: 'up',
      motionDistance: 20,
      orbitRadiusX: 20,
      orbitRadiusY: 12,
      rotateMode: 'none',
      colorFrom: '#ff8a3d',
      colorMid: '#ffd166',
      colorTo: '#1f7a8c',
    },
  },
  {
    id: 'pulse',
    label: 'Pulse',
    description: 'Cycle opacity to create a soft pulsing effect.',
    defaults: {
      presetId: 'pulse',
      durationSeconds: 1.8,
      delaySeconds: 0,
      repeatMode: 'indefinite',
      repeatCount: 3,
      fillMode: 'remove',
      startMode: 'load',
      easing: 'ease-in-out',
      startOpacity: 1,
      midOpacity: 0.4,
      endOpacity: 1,
      motionDirection: 'up',
      motionDistance: 14,
      orbitRadiusX: 20,
      orbitRadiusY: 12,
      rotateMode: 'none',
      colorFrom: '#ff8a3d',
      colorMid: '#ffd166',
      colorTo: '#1f7a8c',
    },
  },
  {
    id: 'drift',
    label: 'Drift',
    description: 'Translate the target in a configurable direction.',
    defaults: {
      presetId: 'drift',
      durationSeconds: 2.4,
      delaySeconds: 0,
      repeatMode: 'indefinite',
      repeatCount: 3,
      fillMode: 'remove',
      startMode: 'load',
      easing: 'ease-in-out',
      startOpacity: 1,
      midOpacity: 0.65,
      endOpacity: 1,
      motionDirection: 'up-right',
      motionDistance: 24,
      orbitRadiusX: 20,
      orbitRadiusY: 12,
      rotateMode: 'none',
      colorFrom: '#ff8a3d',
      colorMid: '#ffd166',
      colorTo: '#1f7a8c',
    },
  },
  {
    id: 'blink',
    label: 'Blink',
    description: 'Toggle visibility quickly for attention cues.',
    defaults: {
      presetId: 'blink',
      durationSeconds: 0.7,
      delaySeconds: 0,
      repeatMode: 'indefinite',
      repeatCount: 6,
      fillMode: 'remove',
      startMode: 'load',
      easing: 'linear',
      startOpacity: 1,
      midOpacity: 0,
      endOpacity: 1,
      motionDirection: 'up',
      motionDistance: 12,
      orbitRadiusX: 20,
      orbitRadiusY: 12,
      rotateMode: 'none',
      colorFrom: '#ff8a3d',
      colorMid: '#ffd166',
      colorTo: '#1f7a8c',
    },
  },
  {
    id: 'orbit',
    label: 'Orbit',
    description: 'Move the target around a compact motion path.',
    defaults: {
      presetId: 'orbit',
      durationSeconds: 3,
      delaySeconds: 0,
      repeatMode: 'indefinite',
      repeatCount: 2,
      fillMode: 'remove',
      startMode: 'load',
      easing: 'linear',
      startOpacity: 1,
      midOpacity: 1,
      endOpacity: 1,
      motionDirection: 'right',
      motionDistance: 24,
      orbitRadiusX: 24,
      orbitRadiusY: 14,
      rotateMode: 'auto',
      colorFrom: '#ff8a3d',
      colorMid: '#ffd166',
      colorTo: '#1f7a8c',
    },
  },
  {
    id: 'color-shift',
    label: 'Color shift',
    description: 'Animate the fill color through three keyed values.',
    defaults: {
      presetId: 'color-shift',
      durationSeconds: 2.2,
      delaySeconds: 0,
      repeatMode: 'indefinite',
      repeatCount: 2,
      fillMode: 'remove',
      startMode: 'load',
      easing: 'ease-in-out',
      startOpacity: 1,
      midOpacity: 1,
      endOpacity: 1,
      motionDirection: 'up',
      motionDistance: 20,
      orbitRadiusX: 20,
      orbitRadiusY: 12,
      rotateMode: 'none',
      colorFrom: '#ff8a3d',
      colorMid: '#ffd166',
      colorTo: '#1f7a8c',
    },
  },
];

function parseSvgRoot(source: string) {
  const documentRoot = new DOMParser().parseFromString(source, 'image/svg+xml');
  const parserError = documentRoot.querySelector('parsererror');
  if (parserError) {
    throw new Error(parserError.textContent?.trim() || 'Unable to parse SVG markup.');
  }

  const documentElement = documentRoot.documentElement;
  const localName = documentElement.localName || documentElement.tagName.split(':').at(-1) || documentElement.tagName;
  if (localName.toLowerCase() !== 'svg') {
    throw new Error('The provided markup does not have an <svg> root element.');
  }

  return documentElement as unknown as SVGSVGElement;
}

function formatSeconds(value: number) {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const rounded = Number(safeValue.toFixed(2));
  return `${rounded}s`;
}

function parseSeconds(value: string | null) {
  if (!value) {
    return 0;
  }

  const secondsMatch = value.match(/([0-9]*\.?[0-9]+)s/);
  if (secondsMatch) {
    return Number(secondsMatch[1]);
  }

  return Number(value) || 0;
}

function formatCount(value: number) {
  const safeValue = Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1;
  return `${safeValue}`;
}

function parseRepeatMode(value: string | null): AnimationRepeatMode {
  return value === 'indefinite' ? 'indefinite' : 'count';
}

function parseRepeatCount(value: string | null) {
  if (!value || value === 'indefinite') {
    return 1;
  }

  return Math.max(1, Number.parseInt(value, 10) || 1);
}

function clampOpacity(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Number(Math.min(1, Math.max(0, value)).toFixed(2));
}

function clampPositive(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Number(Math.max(0, value).toFixed(2));
}

function normalizeColor(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed || fallback;
}

function getLocalTagName(element: Element) {
  return element.localName || element.tagName.split(':').at(-1) || element.tagName;
}

function isAnimatableElement(element: Element) {
  return !disallowedAnimationTargets.has(getLocalTagName(element).toLowerCase());
}

function isAnimationNode(element: Element) {
  return animationNodeNames.has(getLocalTagName(element).toLowerCase());
}

function removeAnimationNodes(target: Element, replaceMode: AnimationReplaceMode) {
  let removedCount = 0;

  Array.from(target.children).forEach((child) => {
    const isWorkbench = child.getAttribute(WORKBENCH_ANIMATION_ATTRIBUTE) === 'true';
    if (isWorkbench || (replaceMode === 'all' && isAnimationNode(child))) {
      child.remove();
      removedCount += 1;
    }
  });

  return removedCount;
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

function createAnimationElement(documentRoot: XMLDocument, tagName: 'animate' | 'animateTransform' | 'animateMotion', attributes: Record<string, string>) {
  const element = documentRoot.createElementNS(SVG_NAMESPACE, tagName);
  element.setAttribute(WORKBENCH_ANIMATION_ATTRIBUTE, 'true');
  Object.entries(attributes).forEach(([name, value]) => {
    element.setAttribute(name, value);
  });
  return element;
}

function getBeginValue(draft: AnimationDraft) {
  const delay = formatSeconds(draft.delaySeconds);
  return draft.startMode === 'click'
    ? (draft.delaySeconds > 0 ? `click+${delay}` : 'click')
    : delay;
}

function parseStartMode(begin: string | null): AnimationStartMode {
  return begin?.includes('click') ? 'click' : 'load';
}

function getEasingSpline(easing: AnimationEasing) {
  switch (easing) {
    case 'ease-in':
      return '0.42 0 1 1';
    case 'ease-out':
      return '0 0 0.58 1';
    case 'ease-in-out':
      return '0.42 0 0.58 1';
    case 'linear':
    default:
      return null;
  }
}

function parseEasing(node: Element): AnimationEasing {
  const keySplines = node.getAttribute('keySplines');
  switch (keySplines) {
    case '0.42 0 1 1':
      return 'ease-in';
    case '0 0 0.58 1':
      return 'ease-out';
    case '0.42 0 0.58 1':
    case '0.42 0 0.58 1;0.42 0 0.58 1':
      return 'ease-in-out';
    default:
      return 'linear';
  }
}

function getMotionDelta(direction: AnimationMotionDirection, distance: number) {
  const safeDistance = clampPositive(distance, 0);
  const diagonal = Number((safeDistance / Math.sqrt(2)).toFixed(2));

  switch (direction) {
    case 'up':
      return { x: 0, y: -safeDistance };
    case 'down':
      return { x: 0, y: safeDistance };
    case 'left':
      return { x: -safeDistance, y: 0 };
    case 'right':
      return { x: safeDistance, y: 0 };
    case 'up-left':
      return { x: -diagonal, y: -diagonal };
    case 'up-right':
      return { x: diagonal, y: -diagonal };
    case 'down-left':
      return { x: -diagonal, y: diagonal };
    case 'down-right':
      return { x: diagonal, y: diagonal };
  }
}

function inferMotionDirection(x: number, y: number): AnimationMotionDirection {
  const horizontal = Math.abs(x) < 0.01 ? '' : x > 0 ? 'right' : 'left';
  const vertical = Math.abs(y) < 0.01 ? '' : y > 0 ? 'down' : 'up';
  if (horizontal && vertical) {
    return `${vertical}-${horizontal}` as AnimationMotionDirection;
  }
  if (horizontal) {
    return horizontal as AnimationMotionDirection;
  }
  if (vertical) {
    return vertical as AnimationMotionDirection;
  }
  return 'right';
}

function getCommonAnimationAttributes(draft: AnimationDraft) {
  return {
    begin: getBeginValue(draft),
    dur: formatSeconds(draft.durationSeconds),
    fill: draft.fillMode,
    repeatCount: draft.repeatMode === 'indefinite' ? 'indefinite' : formatCount(draft.repeatCount),
  };
}

function withSplineAttributes(attributes: Record<string, string>, easing: AnimationEasing, segmentCount: number) {
  const spline = getEasingSpline(easing);
  if (!spline) {
    return attributes;
  }

  return {
    ...attributes,
    calcMode: 'spline',
    keySplines: Array.from({ length: Math.max(1, segmentCount) }, () => spline).join(';'),
  };
}

function createOpacityAnimation(documentRoot: XMLDocument, draft: AnimationDraft, fromTo: boolean) {
  const baseAttributes = {
    [WORKBENCH_PRESET_ATTRIBUTE]: draft.presetId,
    ...getCommonAnimationAttributes(draft),
    attributeName: 'opacity',
  };

  if (fromTo) {
    return createAnimationElement(documentRoot, 'animate', withSplineAttributes({
      ...baseAttributes,
      from: `${clampOpacity(draft.startOpacity)}`,
      to: `${clampOpacity(draft.endOpacity)}`,
      keyTimes: '0;1',
    }, draft.easing, 1));
  }

  return createAnimationElement(documentRoot, 'animate', withSplineAttributes({
    ...baseAttributes,
    values: `${clampOpacity(draft.startOpacity)};${clampOpacity(draft.midOpacity)};${clampOpacity(draft.endOpacity)}`,
    keyTimes: '0;0.5;1',
  }, draft.easing, 2));
}

function createDriftAnimation(documentRoot: XMLDocument, draft: AnimationDraft) {
  const delta = getMotionDelta(draft.motionDirection, draft.motionDistance);

  return createAnimationElement(documentRoot, 'animateTransform', withSplineAttributes({
    [WORKBENCH_PRESET_ATTRIBUTE]: draft.presetId,
    ...getCommonAnimationAttributes(draft),
    additive: 'sum',
    attributeName: 'transform',
    type: 'translate',
    values: `0 0; ${delta.x} ${delta.y}; 0 0`,
    keyTimes: '0;0.5;1',
  }, draft.easing, 2));
}

function createOrbitAnimation(documentRoot: XMLDocument, draft: AnimationDraft) {
  const radiusX = clampPositive(draft.orbitRadiusX, 20);
  const radiusY = clampPositive(draft.orbitRadiusY, 12);
  const path = `M 0 0 m -${radiusX} 0 a ${radiusX} ${radiusY} 0 1 1 ${radiusX * 2} 0 a ${radiusX} ${radiusY} 0 1 1 -${radiusX * 2} 0`;

  return createAnimationElement(documentRoot, 'animateMotion', withSplineAttributes({
    [WORKBENCH_PRESET_ATTRIBUTE]: draft.presetId,
    ...getCommonAnimationAttributes(draft),
    path,
    rotate: draft.rotateMode,
    keyTimes: '0;1',
  }, draft.easing, 1));
}

function createColorShiftAnimation(documentRoot: XMLDocument, draft: AnimationDraft) {
  return createAnimationElement(documentRoot, 'animate', withSplineAttributes({
    [WORKBENCH_PRESET_ATTRIBUTE]: draft.presetId,
    ...getCommonAnimationAttributes(draft),
    attributeName: 'fill',
    values: `${normalizeColor(draft.colorFrom, '#ff8a3d')};${normalizeColor(draft.colorMid, '#ffd166')};${normalizeColor(draft.colorTo, '#1f7a8c')}`,
    keyTimes: '0;0.5;1',
  }, draft.easing, 2));
}

function createAnimationNodes(documentRoot: XMLDocument, draft: AnimationDraft) {
  switch (draft.presetId) {
    case 'fade-in':
      return [createOpacityAnimation(documentRoot, draft, true)];
    case 'pulse':
    case 'blink':
      return [createOpacityAnimation(documentRoot, draft, false)];
    case 'drift':
      return [createDriftAnimation(documentRoot, draft)];
    case 'orbit':
      return [createOrbitAnimation(documentRoot, draft)];
    case 'color-shift':
      return [createColorShiftAnimation(documentRoot, draft)];
  }
}

function getAnimationLabel(presetId: AnimationPresetId | null, nodeName: string) {
  if (presetId) {
    return getAnimationPresetDefinition(presetId).label;
  }

  switch (nodeName) {
    case 'animateTransform':
      return 'Transform animation';
    case 'animateMotion':
      return 'Motion path';
    case 'set':
      return 'Set value';
    default:
      return 'Attribute animation';
  }
}

function describeExistingAnimation(node: Element) {
  const nodeName = getLocalTagName(node);
  if (nodeName === 'animateTransform') {
    return `${node.getAttribute('type') ?? 'transform'} on ${node.getAttribute('attributeName') ?? 'transform'}${node.getAttribute('values') ? `: ${node.getAttribute('values')}` : ''}`;
  }
  if (nodeName === 'animateMotion') {
    return node.getAttribute('path') ? `motion path: ${node.getAttribute('path')}` : 'motion path animation';
  }
  if (nodeName === 'set') {
    return `set ${node.getAttribute('attributeName') ?? 'attribute'} to ${node.getAttribute('to') ?? ''}`.trim();
  }
  if (node.getAttribute('values')) {
    return `${node.getAttribute('attributeName') ?? 'attribute'}: ${node.getAttribute('values')}`;
  }
  if (node.getAttribute('from') || node.getAttribute('to')) {
    return `${node.getAttribute('attributeName') ?? 'attribute'} from ${node.getAttribute('from') ?? ''} to ${node.getAttribute('to') ?? ''}`.trim();
  }
  return `${node.getAttribute('attributeName') ?? 'attribute'} animation`;
}

function buildDraftBase(presetId: AnimationPresetId, node: Element) {
  const defaults = getAnimationPresetDefinition(presetId).defaults;
  const begin = node.getAttribute('begin');
  const delaySeconds = parseSeconds(begin?.includes('+') ? begin.split('+')[1] ?? null : begin);
  return createAnimationDraft(presetId, {
    ...defaults,
    durationSeconds: parseSeconds(node.getAttribute('dur')) || defaults.durationSeconds,
    delaySeconds,
    repeatMode: parseRepeatMode(node.getAttribute('repeatCount')),
    repeatCount: parseRepeatCount(node.getAttribute('repeatCount')),
    fillMode: node.getAttribute('fill') === 'freeze' ? 'freeze' : 'remove',
    startMode: parseStartMode(begin),
    easing: parseEasing(node),
  });
}

export function getAnimationPresetDefinition(presetId: AnimationPresetId) {
  return animationPresets.find((preset) => preset.id === presetId) ?? animationPresets[0];
}

export function createAnimationDraft(presetId: AnimationPresetId, current?: Partial<AnimationDraft>): AnimationDraft {
  const defaults = getAnimationPresetDefinition(presetId).defaults;
  return {
    ...defaults,
    durationSeconds: current?.durationSeconds ?? defaults.durationSeconds,
    delaySeconds: current?.delaySeconds ?? defaults.delaySeconds,
    repeatMode: current?.repeatMode ?? defaults.repeatMode,
    repeatCount: current?.repeatCount ?? defaults.repeatCount,
    fillMode: current?.fillMode ?? defaults.fillMode,
    startMode: current?.startMode ?? defaults.startMode,
    easing: current?.easing ?? defaults.easing,
    startOpacity: current?.startOpacity ?? defaults.startOpacity,
    midOpacity: current?.midOpacity ?? defaults.midOpacity,
    endOpacity: current?.endOpacity ?? defaults.endOpacity,
    motionDirection: current?.motionDirection ?? defaults.motionDirection,
    motionDistance: current?.motionDistance ?? defaults.motionDistance,
    orbitRadiusX: current?.orbitRadiusX ?? defaults.orbitRadiusX,
    orbitRadiusY: current?.orbitRadiusY ?? defaults.orbitRadiusY,
    rotateMode: current?.rotateMode ?? defaults.rotateMode,
    colorFrom: current?.colorFrom ?? defaults.colorFrom,
    colorMid: current?.colorMid ?? defaults.colorMid,
    colorTo: current?.colorTo ?? defaults.colorTo,
    presetId,
  };
}

export function describeAnimationDraft(draft: AnimationDraft) {
  switch (draft.presetId) {
    case 'fade-in':
      return `Fade opacity from ${clampOpacity(draft.startOpacity)} to ${clampOpacity(draft.endOpacity)} over ${formatSeconds(draft.durationSeconds)} with ${draft.easing} timing.`;
    case 'pulse':
      return `Pulse opacity through ${clampOpacity(draft.midOpacity)} every ${formatSeconds(draft.durationSeconds)} using ${draft.easing} timing.`;
    case 'blink':
      return `Blink between ${clampOpacity(draft.startOpacity)} and ${clampOpacity(draft.midOpacity)} every ${formatSeconds(draft.durationSeconds)}.`;
    case 'drift':
      return `Move ${draft.motionDirection} by ${clampPositive(draft.motionDistance, 0)} units over ${formatSeconds(draft.durationSeconds)}.`;
    case 'orbit':
      return `Orbit on a ${clampPositive(draft.orbitRadiusX, 20)} by ${clampPositive(draft.orbitRadiusY, 12)} path over ${formatSeconds(draft.durationSeconds)}.`;
    case 'color-shift':
      return `Shift fill from ${normalizeColor(draft.colorFrom, '#ff8a3d')} through ${normalizeColor(draft.colorMid, '#ffd166')} to ${normalizeColor(draft.colorTo, '#1f7a8c')}.`;
  }
}

export function listAnimationsForPath(source: string, targetPath: string): ElementAnimationSummary[] {
  try {
    const root = parseSvgRoot(source);
    const target = resolveElementByPath(root, targetPath);
    if (!target) {
      return [];
    }

    return Array.from(target.children)
      .filter((child) => isAnimationNode(child))
      .map((child) => {
        const nodeName = getLocalTagName(child) as ElementAnimationSummary['nodeName'];
        const presetValue = child.getAttribute(WORKBENCH_PRESET_ATTRIBUTE);
        const presetId = animationPresets.some((preset) => preset.id === presetValue)
          ? presetValue as AnimationPresetId
          : null;
        return {
          nodeName,
          presetId,
          label: getAnimationLabel(presetId, nodeName),
          detail: describeExistingAnimation(child),
          begin: child.getAttribute('begin'),
          duration: child.getAttribute('dur'),
          repeatCount: child.getAttribute('repeatCount'),
          isWorkbenchAuthored: child.getAttribute(WORKBENCH_ANIMATION_ATTRIBUTE) === 'true',
        };
      });
  } catch {
    return [];
  }
}

export function inferAnimationDraftForPath(source: string, targetPath: string): AnimationDraft | null {
  try {
    const root = parseSvgRoot(source);
    const target = resolveElementByPath(root, targetPath);
    if (!target) {
      return null;
    }

    const animationNode = Array.from(target.children).find((child) => isAnimationNode(child));
    if (!animationNode) {
      return null;
    }

    const presetAttribute = animationNode.getAttribute(WORKBENCH_PRESET_ATTRIBUTE);
    if (presetAttribute && animationPresets.some((preset) => preset.id === presetAttribute)) {
      return buildDraftBase(presetAttribute as AnimationPresetId, animationNode);
    }

    const nodeName = getLocalTagName(animationNode);
    if (nodeName === 'animateMotion') {
      return buildDraftBase('orbit', animationNode);
    }

    if (nodeName === 'animateTransform' && animationNode.getAttribute('type') === 'translate') {
      const values = animationNode.getAttribute('values')?.split(';').map((value) => value.trim()) ?? [];
      const middle = values[1]?.split(/\s+/).map(Number) ?? [0, 0];
      const x = middle[0] ?? 0;
      const y = middle[1] ?? 0;
      return createAnimationDraft('drift', {
        ...buildDraftBase('drift', animationNode),
        motionDirection: inferMotionDirection(x, y),
        motionDistance: Number(Math.max(Math.abs(x), Math.abs(y)).toFixed(2)),
      });
    }

    if (nodeName === 'animate' && animationNode.getAttribute('attributeName') === 'fill') {
      const values = animationNode.getAttribute('values')?.split(';').map((value) => value.trim()) ?? [];
      return createAnimationDraft('color-shift', {
        ...buildDraftBase('color-shift', animationNode),
        colorFrom: values[0] ?? '#ff8a3d',
        colorMid: values[1] ?? values[0] ?? '#ffd166',
        colorTo: values[2] ?? values[1] ?? values[0] ?? '#1f7a8c',
      });
    }

    if (nodeName === 'animate' && animationNode.getAttribute('attributeName') === 'opacity') {
      const values = animationNode.getAttribute('values')?.split(';').map((value) => Number(value.trim())) ?? [];
      if (values.length >= 3) {
        const presetId = values[1] <= 0.05 ? 'blink' : 'pulse';
        return createAnimationDraft(presetId, {
          ...buildDraftBase(presetId, animationNode),
          startOpacity: values[0] ?? 1,
          midOpacity: values[1] ?? 0.4,
          endOpacity: values[2] ?? 1,
        });
      }

      return createAnimationDraft('fade-in', {
        ...buildDraftBase('fade-in', animationNode),
        startOpacity: Number(animationNode.getAttribute('from') ?? 0),
        endOpacity: Number(animationNode.getAttribute('to') ?? 1),
      });
    }

    return null;
  } catch {
    return null;
  }
}

export function applyAnimationDraftsToSource(
  source: string,
  targetDrafts: AnimationTargetDraft[],
  replaceMode: AnimationReplaceMode = 'workbench',
): AnimationMutationResult {
  const root = parseSvgRoot(source);
  let appliedCount = 0;
  let removedCount = 0;
  const skippedPaths: string[] = [];

  targetDrafts.forEach(({ path, draft }) => {
    const target = resolveElementByPath(root, path);
    if (!target || !isAnimatableElement(target)) {
      skippedPaths.push(path);
      return;
    }

    removedCount += removeAnimationNodes(target, replaceMode);
    const animationNodes = createAnimationNodes(root.ownerDocument, draft);
    animationNodes.forEach((node) => target.appendChild(node));
    appliedCount += 1;
  });

  return {
    source: new XMLSerializer().serializeToString(root),
    appliedCount,
    removedCount,
    skippedPaths,
  };
}

export function applyAnimationPresetToSource(
  source: string,
  targetPaths: string[],
  draft: AnimationDraft,
  replaceMode: AnimationReplaceMode = 'workbench',
): AnimationMutationResult {
  return applyAnimationDraftsToSource(
    source,
    Array.from(new Set(targetPaths)).map((path) => ({ path, draft })),
    replaceMode,
  );
}

export function removeWorkbenchAnimationsFromSource(
  source: string,
  targetPaths: string[],
  replaceMode: AnimationReplaceMode = 'workbench',
): AnimationMutationResult {
  const root = parseSvgRoot(source);
  const uniqueTargetPaths = Array.from(new Set(targetPaths));
  let removedCount = 0;
  const skippedPaths: string[] = [];

  uniqueTargetPaths.forEach((path) => {
    const target = resolveElementByPath(root, path);
    if (!target) {
      skippedPaths.push(path);
      return;
    }

    removedCount += removeAnimationNodes(target, replaceMode);
  });

  return {
    source: new XMLSerializer().serializeToString(root),
    appliedCount: 0,
    removedCount,
    skippedPaths,
  };
}
