export type AnimationPresetId = 'fade-in' | 'pulse' | 'drift' | 'blink' | 'random-flicker' | 'rotate' | 'scale' | 'orbit' | 'color-shift' | 'path-morph';
export type AnimationMorphTarget = 'circle' | 'jitter';

export type AnimationRepeatMode = 'indefinite' | 'count';
export type AnimationStartMode = 'load' | 'click';
export type AnimationEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
export type AnimationMotionDirection = 'up' | 'down' | 'left' | 'right' | 'up-right' | 'up-left' | 'down-right' | 'down-left';
export type AnimationTurnDirection = 'clockwise' | 'counterclockwise';
export type AnimationRotateMode = 'none' | 'auto';
export type AnimationReplaceMode = 'workbench' | 'all';
export type AnimationStackMode = 'replace-target' | 'replace-selected' | 'append' | 'prepend';

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
  turnDirection: AnimationTurnDirection;
  turnDegrees: number;
  startScale: number;
  midScale: number;
  endScale: number;
  orbitRadiusX: number;
  orbitRadiusY: number;
  rotateMode: AnimationRotateMode;
  colorFrom: string;
  colorMid: string;
  colorTo: string;
  morphTarget: AnimationMorphTarget;
  morphAmount: number;
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

export type AnimationApplyOptions = {
  replaceMode?: AnimationReplaceMode;
  stackMode?: AnimationStackMode;
  targetAnimationIndex?: number | null;
};

export type ElementAnimationSummary = {
  index: number;
  nodeName: 'animate' | 'animateTransform' | 'animateMotion' | 'set';
  presetId: AnimationPresetId | null;
  label: string;
  detail: string;
  begin: string | null;
  duration: string | null;
  repeatCount: string | null;
  isWorkbenchAuthored: boolean;
  isEditable: boolean;
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
      startMode: 'click',
      easing: 'ease-out',
      startOpacity: 0,
      midOpacity: 0.6,
      endOpacity: 1,
      motionDirection: 'up',
      motionDistance: 20,
      turnDirection: 'clockwise',
      turnDegrees: 180,
      startScale: 1,
      midScale: 1.12,
      endScale: 1,
      orbitRadiusX: 20,
      orbitRadiusY: 12,
      rotateMode: 'none',
      colorFrom: '#ff8a3d',
      colorMid: '#ffd166',
      colorTo: '#1f7a8c',
      morphTarget: 'circle',
      morphAmount: 80,
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
      startMode: 'click',
      easing: 'ease-in-out',
      startOpacity: 1,
      midOpacity: 0.4,
      endOpacity: 1,
      motionDirection: 'up',
      motionDistance: 14,
      turnDirection: 'clockwise',
      turnDegrees: 180,
      startScale: 1,
      midScale: 1.12,
      endScale: 1,
      orbitRadiusX: 20,
      orbitRadiusY: 12,
      rotateMode: 'none',
      colorFrom: '#ff8a3d',
      colorMid: '#ffd166',
      colorTo: '#1f7a8c',
      morphTarget: 'circle',
      morphAmount: 80,
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
      startMode: 'click',
      easing: 'ease-in-out',
      startOpacity: 1,
      midOpacity: 0.65,
      endOpacity: 1,
      motionDirection: 'up-right',
      motionDistance: 24,
      turnDirection: 'clockwise',
      turnDegrees: 180,
      startScale: 1,
      midScale: 1.12,
      endScale: 1,
      orbitRadiusX: 20,
      orbitRadiusY: 12,
      rotateMode: 'none',
      colorFrom: '#ff8a3d',
      colorMid: '#ffd166',
      colorTo: '#1f7a8c',
      morphTarget: 'circle',
      morphAmount: 80,
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
      startMode: 'click',
      easing: 'linear',
      startOpacity: 1,
      midOpacity: 0,
      endOpacity: 1,
      motionDirection: 'up',
      motionDistance: 12,
      turnDirection: 'clockwise',
      turnDegrees: 180,
      startScale: 1,
      midScale: 1.12,
      endScale: 1,
      orbitRadiusX: 20,
      orbitRadiusY: 12,
      rotateMode: 'none',
      colorFrom: '#ff8a3d',
      colorMid: '#ffd166',
      colorTo: '#1f7a8c',
      morphTarget: 'circle',
      morphAmount: 80,
    },
  },
  {
    id: 'random-flicker',
    label: 'Random flicker',
    description: 'Flash opacity through an irregular flicker pattern for neon, glitch, or failing-power cues.',
    defaults: {
      presetId: 'random-flicker',
      durationSeconds: 1.1,
      delaySeconds: 0,
      repeatMode: 'indefinite',
      repeatCount: 5,
      fillMode: 'remove',
      startMode: 'click',
      easing: 'linear',
      startOpacity: 1,
      midOpacity: 0.18,
      endOpacity: 0.96,
      motionDirection: 'up',
      motionDistance: 12,
      turnDirection: 'clockwise',
      turnDegrees: 180,
      startScale: 1,
      midScale: 1.12,
      endScale: 1,
      orbitRadiusX: 20,
      orbitRadiusY: 12,
      rotateMode: 'none',
      colorFrom: '#ff8a3d',
      colorMid: '#ffd166',
      colorTo: '#1f7a8c',
      morphTarget: 'circle',
      morphAmount: 80,
    },
  },
  {
    id: 'rotate',
    label: 'Rotate',
    description: 'Spin the target by a configurable angle and direction.',
    defaults: {
      presetId: 'rotate',
      durationSeconds: 1.6,
      delaySeconds: 0,
      repeatMode: 'indefinite',
      repeatCount: 2,
      fillMode: 'remove',
      startMode: 'click',
      easing: 'ease-in-out',
      startOpacity: 1,
      midOpacity: 1,
      endOpacity: 1,
      motionDirection: 'up',
      motionDistance: 20,
      turnDirection: 'clockwise',
      turnDegrees: 180,
      startScale: 1,
      midScale: 1.12,
      endScale: 1,
      orbitRadiusX: 20,
      orbitRadiusY: 12,
      rotateMode: 'none',
      colorFrom: '#ff8a3d',
      colorMid: '#ffd166',
      colorTo: '#1f7a8c',
      morphTarget: 'circle',
      morphAmount: 80,
    },
  },
  {
    id: 'scale',
    label: 'Scale',
    description: 'Resize the target through configurable start, peak, and end scales.',
    defaults: {
      presetId: 'scale',
      durationSeconds: 1.5,
      delaySeconds: 0,
      repeatMode: 'indefinite',
      repeatCount: 2,
      fillMode: 'remove',
      startMode: 'click',
      easing: 'ease-in-out',
      startOpacity: 1,
      midOpacity: 1,
      endOpacity: 1,
      motionDirection: 'up',
      motionDistance: 20,
      turnDirection: 'clockwise',
      turnDegrees: 180,
      startScale: 1,
      midScale: 1.12,
      endScale: 1,
      orbitRadiusX: 20,
      orbitRadiusY: 12,
      rotateMode: 'none',
      colorFrom: '#ff8a3d',
      colorMid: '#ffd166',
      colorTo: '#1f7a8c',
      morphTarget: 'circle',
      morphAmount: 80,
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
      startMode: 'click',
      easing: 'linear',
      startOpacity: 1,
      midOpacity: 1,
      endOpacity: 1,
      motionDirection: 'right',
      motionDistance: 24,
      turnDirection: 'clockwise',
      turnDegrees: 180,
      startScale: 1,
      midScale: 1.12,
      endScale: 1,
      orbitRadiusX: 24,
      orbitRadiusY: 14,
      rotateMode: 'auto',
      colorFrom: '#ff8a3d',
      colorMid: '#ffd166',
      colorTo: '#1f7a8c',
      morphTarget: 'circle',
      morphAmount: 80,
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
      startMode: 'click',
      easing: 'ease-in-out',
      startOpacity: 1,
      midOpacity: 1,
      endOpacity: 1,
      motionDirection: 'up',
      motionDistance: 20,
      turnDirection: 'clockwise',
      turnDegrees: 180,
      startScale: 1,
      midScale: 1.12,
      endScale: 1,
      orbitRadiusX: 20,
      orbitRadiusY: 12,
      rotateMode: 'none',
      colorFrom: '#ff8a3d',
      colorMid: '#ffd166',
      colorTo: '#1f7a8c',
      morphTarget: 'circle',
      morphAmount: 80,
    },
  },
  {
    id: 'path-morph',
    label: 'Path morph',
    description: 'Animate path outline points by morphing the shape toward a circle or jittering each point by a random offset.',
    defaults: {
      presetId: 'path-morph',
      durationSeconds: 2,
      delaySeconds: 0,
      repeatMode: 'indefinite',
      repeatCount: 2,
      fillMode: 'remove',
      startMode: 'click',
      easing: 'ease-in-out',
      startOpacity: 1,
      midOpacity: 1,
      endOpacity: 1,
      motionDirection: 'up',
      motionDistance: 20,
      turnDirection: 'clockwise',
      turnDegrees: 180,
      startScale: 1,
      midScale: 1.12,
      endScale: 1,
      orbitRadiusX: 20,
      orbitRadiusY: 12,
      rotateMode: 'none',
      colorFrom: '#ff8a3d',
      colorMid: '#ffd166',
      colorTo: '#1f7a8c',
      morphTarget: 'circle',
      morphAmount: 80,
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

function clampScale(value: number, fallback: number) {
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

function getDirectAnimationChildren(target: Element) {
  return Array.from(target.children).filter((child) => isAnimationNode(child));
}

function canReplaceAnimationNode(node: Element, replaceMode: AnimationReplaceMode) {
  return node.getAttribute(WORKBENCH_ANIMATION_ATTRIBUTE) === 'true' || replaceMode === 'all';
}

function removeAnimationNodes(target: Element, replaceMode: AnimationReplaceMode) {
  let removedCount = 0;

  getDirectAnimationChildren(target).forEach((child) => {
    if (canReplaceAnimationNode(child, replaceMode)) {
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

function createRandomFlickerAnimation(documentRoot: XMLDocument, draft: AnimationDraft) {
  const keyTimes = [0, 0.07, 0.16, 0.28, 0.41, 0.55, 0.69, 0.83, 1];
  const lowWeights = [0, 0.68, 1, 0.22, 0.86, 0.35, 0.94, 0.12, 0];
  const lowOpacity = clampOpacity(draft.midOpacity);
  const values = keyTimes.map((time, index) => {
    if (index === 0) {
      return clampOpacity(draft.startOpacity);
    }
    if (index === keyTimes.length - 1) {
      return clampOpacity(draft.endOpacity);
    }

    const baseline = clampOpacity(draft.startOpacity + ((draft.endOpacity - draft.startOpacity) * time));
    const weight = lowWeights[index] ?? 0;
    const flickerValue = baseline - ((baseline - lowOpacity) * weight);
    return clampOpacity(flickerValue);
  });

  return createAnimationElement(documentRoot, 'animate', withSplineAttributes({
    [WORKBENCH_PRESET_ATTRIBUTE]: draft.presetId,
    ...getCommonAnimationAttributes(draft),
    attributeName: 'opacity',
    values: values.join(';'),
    keyTimes: keyTimes.join(';'),
  }, draft.easing, keyTimes.length - 1));
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

function getSignedTurnDegrees(direction: AnimationTurnDirection, degrees: number) {
  const safeDegrees = clampPositive(degrees, 180);
  return direction === 'counterclockwise' ? -safeDegrees : safeDegrees;
}

function createRotateAnimation(documentRoot: XMLDocument, draft: AnimationDraft) {
  const signedDegrees = getSignedTurnDegrees(draft.turnDirection, draft.turnDegrees);

  return createAnimationElement(documentRoot, 'animateTransform', withSplineAttributes({
    [WORKBENCH_PRESET_ATTRIBUTE]: draft.presetId,
    ...getCommonAnimationAttributes(draft),
    additive: 'sum',
    attributeName: 'transform',
    type: 'rotate',
    values: `0; ${signedDegrees}`,
    keyTimes: '0;1',
  }, draft.easing, 1));
}

function createScaleAnimation(documentRoot: XMLDocument, draft: AnimationDraft) {
  const startScale = clampScale(draft.startScale, 1);
  const midScale = clampScale(draft.midScale, 1.12);
  const endScale = clampScale(draft.endScale, startScale);

  return createAnimationElement(documentRoot, 'animateTransform', withSplineAttributes({
    [WORKBENCH_PRESET_ATTRIBUTE]: draft.presetId,
    ...getCommonAnimationAttributes(draft),
    additive: 'sum',
    attributeName: 'transform',
    type: 'scale',
    values: `${startScale} ${startScale}; ${midScale} ${midScale}; ${endScale} ${endScale}`,
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

// ─── Path morph helpers ──────────────────────────────────────────────────────

const PATH_ARGS_PER_STEP: Record<string, number> = {
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
};

type PathStep = { cmd: string; nums: number[] };

function tokenizePathData(d: string): PathStep[] {
  const result: PathStep[] = [];
  const re = /([MmZzLlHhVvCcSsQqTtAa])([^MmZzLlHhVvCcSsQqTtAa]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    const cmd = m[1]!;
    const raw = m[2]!.trim();
    const nums = raw
      ? (raw.match(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number)
      : [];
    result.push({ cmd, nums });
  }
  return result;
}

function absolutizePath(tokens: PathStep[]): PathStep[] {
  const result: PathStep[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;

  for (const { cmd, nums } of tokens) {
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;

    if (upper === 'Z') {
      result.push({ cmd: 'Z', nums: [] });
      cx = sx;
      cy = sy;
      continue;
    }

    const step = PATH_ARGS_PER_STEP[upper] ?? 2;
    const count = step === 0 ? 1 : Math.max(1, Math.floor(nums.length / step));

    for (let i = 0; i < count; i++) {
      const slice = nums.slice(i * step, (i + 1) * step);
      let out: number[];

      if (upper === 'H') {
        out = [rel ? cx + (slice[0] ?? 0) : (slice[0] ?? cx)];
        cx = out[0]!;
      } else if (upper === 'V') {
        out = [rel ? cy + (slice[0] ?? 0) : (slice[0] ?? cy)];
        cy = out[0]!;
      } else if (upper === 'A') {
        out = [...slice];
        if (rel) {
          out[5] = (slice[5] ?? 0) + cx;
          out[6] = (slice[6] ?? 0) + cy;
        }
        cx = out[5] ?? cx;
        cy = out[6] ?? cy;
      } else {
        out = rel ? slice.map((v, idx) => v + (idx % 2 === 0 ? cx : cy)) : [...slice];
        cx = out[out.length - 2] ?? cx;
        cy = out[out.length - 1] ?? cy;
      }

      const effectiveCmd = upper === 'M' && i > 0 ? 'L' : upper;
      if (upper === 'M' && i === 0) {
        sx = cx;
        sy = cy;
      }
      result.push({ cmd: effectiveCmd, nums: out });
    }
  }
  return result;
}

function serializePathSteps(steps: PathStep[]): string {
  return steps
    .map(({ cmd, nums }) =>
      nums.length === 0 ? cmd : `${cmd} ${nums.map((n) => Number(n.toFixed(3))).join(' ')}`,
    )
    .join(' ');
}

function getPathAnchorPoints(steps: PathStep[]): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (const { cmd, nums } of steps) {
    if (cmd === 'Z') { continue; }
    if (cmd === 'H') {
      points.push({ x: nums[0] ?? 0, y: 0 });
    } else if (cmd === 'V') {
      points.push({ x: 0, y: nums[0] ?? 0 });
    } else if (cmd === 'A') {
      points.push({ x: nums[5] ?? 0, y: nums[6] ?? 0 });
    } else {
      points.push({ x: nums[nums.length - 2] ?? 0, y: nums[nums.length - 1] ?? 0 });
    }
  }
  return points;
}

function computePathBoundingBox(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) { return { cx: 0, cy: 0, r: 0 }; }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    r: Math.max((maxX - minX) / 2, (maxY - minY) / 2),
  };
}

function morphPathStepsToCircle(
  steps: PathStep[],
  bbox: ReturnType<typeof computePathBoundingBox>,
  amount: number,
): PathStep[] {
  const t = Math.min(1, Math.max(0, amount / 100));
  const { cx, cy, r } = bbox;
  const safeR = r || 1;

  return steps.map(({ cmd, nums }) => {
    if (cmd === 'Z' || nums.length === 0) { return { cmd, nums }; }
    const morphed = [...nums];

    if (cmd === 'H') {
      const x = morphed[0] ?? 0;
      morphed[0] = x + (cx + safeR * Math.cos(Math.atan2(0, x - cx)) - x) * t;
    } else if (cmd === 'V') {
      const y = morphed[0] ?? 0;
      morphed[0] = y + (cy + safeR * Math.sin(Math.atan2(y - cy, 0)) - y) * t;
    } else if (cmd === 'A') {
      const ax = morphed[5] ?? 0;
      const ay = morphed[6] ?? 0;
      const angle = Math.atan2(ay - cy, ax - cx);
      morphed[5] = ax + (cx + safeR * Math.cos(angle) - ax) * t;
      morphed[6] = ay + (cy + safeR * Math.sin(angle) - ay) * t;
    } else {
      for (let i = 0; i < morphed.length - 1; i += 2) {
        const x = morphed[i] ?? 0;
        const y = morphed[i + 1] ?? 0;
        const angle = Math.atan2(y - cy, x - cx);
        morphed[i] = x + (cx + safeR * Math.cos(angle) - x) * t;
        morphed[i + 1] = y + (cy + safeR * Math.sin(angle) - y) * t;
      }
    }
    return { cmd, nums: morphed };
  });
}

function seededJitterOffset(index: number, scale: number): number {
  const raw = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return (raw - Math.floor(raw)) * 2 * scale - scale;
}

function morphPathStepsWithJitter(steps: PathStep[], amount: number): PathStep[] {
  let coordIndex = 0;
  return steps.map(({ cmd, nums }) => {
    if (cmd === 'Z' || nums.length === 0) { return { cmd, nums }; }
    const morphed = [...nums];

    if (cmd === 'H' || cmd === 'V') {
      morphed[0] = (morphed[0] ?? 0) + seededJitterOffset(coordIndex++, amount);
    } else if (cmd === 'A') {
      morphed[5] = (morphed[5] ?? 0) + seededJitterOffset(coordIndex++, amount);
      morphed[6] = (morphed[6] ?? 0) + seededJitterOffset(coordIndex++, amount);
    } else {
      for (let i = 0; i < morphed.length - 1; i += 2) {
        morphed[i] = (morphed[i] ?? 0) + seededJitterOffset(coordIndex++, amount);
        morphed[i + 1] = (morphed[i + 1] ?? 0) + seededJitterOffset(coordIndex++, amount);
      }
    }
    return { cmd, nums: morphed };
  });
}

function createPathMorphAnimation(documentRoot: XMLDocument, draft: AnimationDraft, target: Element): Element | null {
  const d = target.getAttribute('d');
  if (!d) { return null; }

  const absSteps = absolutizePath(tokenizePathData(d));
  if (absSteps.length === 0) { return null; }

  const originalD = serializePathSteps(absSteps);
  const amount = Math.max(0, draft.morphAmount);

  let morphedSteps: PathStep[];
  if (draft.morphTarget === 'jitter') {
    morphedSteps = morphPathStepsWithJitter(absSteps, amount);
  } else {
    const bbox = computePathBoundingBox(getPathAnchorPoints(absSteps));
    morphedSteps = morphPathStepsToCircle(absSteps, bbox, amount);
  }

  const morphedD = serializePathSteps(morphedSteps);

  return createAnimationElement(documentRoot, 'animate', withSplineAttributes({
    [WORKBENCH_PRESET_ATTRIBUTE]: draft.presetId,
    ...getCommonAnimationAttributes(draft),
    attributeName: 'd',
    from: originalD,
    to: morphedD,
    keyTimes: '0;1',
  }, draft.easing, 1));
}

function createAnimationNodes(documentRoot: XMLDocument, draft: AnimationDraft, target?: Element): Element[] | null {
  switch (draft.presetId) {
    case 'fade-in':
      return [createOpacityAnimation(documentRoot, draft, true)];
    case 'pulse':
    case 'blink':
      return [createOpacityAnimation(documentRoot, draft, false)];
    case 'random-flicker':
      return [createRandomFlickerAnimation(documentRoot, draft)];
    case 'drift':
      return [createDriftAnimation(documentRoot, draft)];
    case 'rotate':
      return [createRotateAnimation(documentRoot, draft)];
    case 'scale':
      return [createScaleAnimation(documentRoot, draft)];
    case 'orbit':
      return [createOrbitAnimation(documentRoot, draft)];
    case 'color-shift':
      return [createColorShiftAnimation(documentRoot, draft)];
    case 'path-morph': {
      if (!target) { return null; }
      const node = createPathMorphAnimation(documentRoot, draft, target);
      return node ? [node] : null;
    }
  }
}

function normalizeAnimationApplyOptions(options?: AnimationReplaceMode | AnimationApplyOptions) {
  if (!options || typeof options === 'string') {
    return {
      replaceMode: options ?? 'workbench',
      stackMode: 'replace-target' as AnimationStackMode,
      targetAnimationIndex: null,
    };
  }

  return {
    replaceMode: options.replaceMode ?? 'workbench',
    stackMode: options.stackMode ?? 'replace-target',
    targetAnimationIndex: typeof options.targetAnimationIndex === 'number' ? options.targetAnimationIndex : null,
  };
}

function insertAnimationNodesBefore(target: Element, referenceNode: Element | null, animationNodes: Element[]) {
  animationNodes.forEach((node) => target.insertBefore(node, referenceNode));
}

function moveAnimationNode(target: Element, fromIndex: number, toPosition: number) {
  const directAnimationChildren = getDirectAnimationChildren(target);
  const animationNode = directAnimationChildren[fromIndex];
  if (!animationNode) {
    return false;
  }

  const boundedToPosition = Math.max(0, Math.min(toPosition, directAnimationChildren.length));
  const adjustedToIndex = boundedToPosition > fromIndex ? boundedToPosition - 1 : boundedToPosition;
  if (adjustedToIndex === fromIndex) {
    return false;
  }

  animationNode.remove();
  const remainingAnimationChildren = getDirectAnimationChildren(target);
  const referenceNode = remainingAnimationChildren[adjustedToIndex] ?? null;
  target.insertBefore(animationNode, referenceNode);
  return true;
}

function applyAnimationNodesToTarget(
  target: Element,
  documentRoot: XMLDocument,
  draft: AnimationDraft,
  options: ReturnType<typeof normalizeAnimationApplyOptions>,
) {
  const animationNodes = createAnimationNodes(documentRoot, draft, target);
  if (!animationNodes) {
    return { applied: false, removedCount: 0 };
  }

  switch (options.stackMode) {
    case 'append':
      animationNodes.forEach((node) => target.appendChild(node));
      return { applied: true, removedCount: 0 };
    case 'prepend': {
      const firstAnimationChild = getDirectAnimationChildren(target)[0] ?? null;
      insertAnimationNodesBefore(target, firstAnimationChild, animationNodes);
      return { applied: true, removedCount: 0 };
    }
    case 'replace-selected': {
      const targetAnimationIndex = options.targetAnimationIndex;
      if (targetAnimationIndex === null || targetAnimationIndex < 0) {
        return { applied: false, removedCount: 0 };
      }

      const directAnimationChildren = getDirectAnimationChildren(target);
      const selectedAnimationNode = directAnimationChildren[targetAnimationIndex];
      if (!selectedAnimationNode || !canReplaceAnimationNode(selectedAnimationNode, options.replaceMode)) {
        return { applied: false, removedCount: 0 };
      }

      insertAnimationNodesBefore(target, selectedAnimationNode, animationNodes);
      selectedAnimationNode.remove();
      return { applied: true, removedCount: 1 };
    }
    case 'replace-target':
    default: {
      const removedCount = removeAnimationNodes(target, options.replaceMode);
      animationNodes.forEach((node) => target.appendChild(node));
      return { applied: true, removedCount };
    }
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

function parseAnimationValueList(node: Element) {
  return node.getAttribute('values')?.split(';').map((value) => value.trim()).filter(Boolean) ?? [];
}

function parseTransformNumberPair(value: string) {
  const numbers = value.split(/\s+/).map(Number).filter((number) => Number.isFinite(number));
  return {
    first: numbers[0] ?? 0,
    second: numbers[1] ?? numbers[0] ?? 0,
  };
}

function inferAnimationPresetId(animationNode: Element): AnimationPresetId | null {
  const presetAttribute = animationNode.getAttribute(WORKBENCH_PRESET_ATTRIBUTE);
  if (presetAttribute && animationPresets.some((preset) => preset.id === presetAttribute)) {
    return presetAttribute as AnimationPresetId;
  }

  const nodeName = getLocalTagName(animationNode);
  if (nodeName === 'animateMotion') {
    return 'orbit';
  }

  if (nodeName === 'animateTransform') {
    switch (animationNode.getAttribute('type')) {
      case 'rotate':
        return 'rotate';
      case 'translate':
        return 'drift';
      case 'scale':
        return 'scale';
      default:
        return null;
    }
  }

  if (nodeName === 'animate' && animationNode.getAttribute('attributeName') === 'fill') {
    return 'color-shift';
  }

  if (nodeName === 'animate' && animationNode.getAttribute('attributeName') === 'd') {
    return 'path-morph';
  }

  if (nodeName === 'animate' && animationNode.getAttribute('attributeName') === 'opacity') {
    const values = parseAnimationValueList(animationNode).map((value) => Number(value));
    if (values.length > 3) {
      return 'random-flicker';
    }
    if (values.length >= 3) {
      return values[1] <= 0.05 ? 'blink' : 'pulse';
    }

    return 'fade-in';
  }

  return null;
}

function inferAnimationDraftFromNode(animationNode: Element): AnimationDraft | null {
  const inferredPresetId = inferAnimationPresetId(animationNode);
  if (!inferredPresetId) {
    return null;
  }

  const baseDraft = buildDraftBase(inferredPresetId, animationNode);

  const nodeName = getLocalTagName(animationNode);
  if (nodeName === 'animateMotion') {
    return baseDraft;
  }

  if (nodeName === 'animateTransform' && animationNode.getAttribute('type') === 'rotate') {
    const values = parseAnimationValueList(animationNode).map((value) => Number(value.split(/\s+/)[0]));
    const targetDegrees = values.at(-1) ?? 0;
    return createAnimationDraft('rotate', {
      ...baseDraft,
      turnDirection: targetDegrees < 0 ? 'counterclockwise' : 'clockwise',
      turnDegrees: Number(Math.abs(targetDegrees).toFixed(2)),
    });
  }

  if (nodeName === 'animateTransform' && animationNode.getAttribute('type') === 'translate') {
    const values = parseAnimationValueList(animationNode);
    const middle = values[1]?.split(/\s+/).map(Number) ?? [0, 0];
    const x = middle[0] ?? 0;
    const y = middle[1] ?? 0;
    return createAnimationDraft('drift', {
      ...baseDraft,
      motionDirection: inferMotionDirection(x, y),
      motionDistance: Number(Math.max(Math.abs(x), Math.abs(y)).toFixed(2)),
    });
  }

  if (nodeName === 'animateTransform' && animationNode.getAttribute('type') === 'scale') {
    const values = parseAnimationValueList(animationNode);
    const startPair = parseTransformNumberPair(values[0] ?? '1 1');
    const middlePair = parseTransformNumberPair(values[1] ?? values.at(-1) ?? `${startPair.first} ${startPair.second}`);
    const endPair = parseTransformNumberPair(values[2] ?? values.at(-1) ?? `${startPair.first} ${startPair.second}`);
    return createAnimationDraft('scale', {
      ...baseDraft,
      startScale: Number(startPair.first.toFixed(2)),
      midScale: Number(middlePair.first.toFixed(2)),
      endScale: Number(endPair.first.toFixed(2)),
    });
  }

  if (nodeName === 'animate' && animationNode.getAttribute('attributeName') === 'fill') {
    const values = parseAnimationValueList(animationNode);
    return createAnimationDraft('color-shift', {
      ...baseDraft,
      colorFrom: values[0] ?? '#ff8a3d',
      colorMid: values[1] ?? values[0] ?? '#ffd166',
      colorTo: values[2] ?? values[1] ?? values[0] ?? '#1f7a8c',
    });
  }

  if (nodeName === 'animate' && animationNode.getAttribute('attributeName') === 'd') {
    return createAnimationDraft('path-morph', baseDraft);
  }

  if (nodeName === 'animate' && animationNode.getAttribute('attributeName') === 'opacity') {
    const values = parseAnimationValueList(animationNode).map((value) => Number(value));
    if (values.length > 3) {
      const interiorValues = values.slice(1, -1).filter((value) => Number.isFinite(value));
      return createAnimationDraft('random-flicker', {
        ...baseDraft,
        startOpacity: values[0] ?? 1,
        midOpacity: Number(Math.min(...interiorValues, values[0] ?? 1).toFixed(2)),
        endOpacity: values.at(-1) ?? 1,
      });
    }
    if (values.length >= 3) {
      const presetId = inferredPresetId === 'random-flicker'
        ? 'random-flicker'
        : values[1] <= 0.05 ? 'blink' : 'pulse';
      return createAnimationDraft(presetId, {
        ...baseDraft,
        startOpacity: values[0] ?? 1,
        midOpacity: values[1] ?? 0.4,
        endOpacity: values[2] ?? 1,
      });
    }

    return createAnimationDraft('fade-in', {
      ...baseDraft,
      startOpacity: Number(animationNode.getAttribute('from') ?? 0),
      endOpacity: Number(animationNode.getAttribute('to') ?? 1),
    });
  }

  return baseDraft;
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
    turnDirection: current?.turnDirection ?? defaults.turnDirection,
    turnDegrees: current?.turnDegrees ?? defaults.turnDegrees,
    startScale: current?.startScale ?? defaults.startScale,
    midScale: current?.midScale ?? defaults.midScale,
    endScale: current?.endScale ?? defaults.endScale,
    orbitRadiusX: current?.orbitRadiusX ?? defaults.orbitRadiusX,
    orbitRadiusY: current?.orbitRadiusY ?? defaults.orbitRadiusY,
    rotateMode: current?.rotateMode ?? defaults.rotateMode,
    colorFrom: current?.colorFrom ?? defaults.colorFrom,
    colorMid: current?.colorMid ?? defaults.colorMid,
    colorTo: current?.colorTo ?? defaults.colorTo,
    morphTarget: current?.morphTarget ?? defaults.morphTarget,
    morphAmount: current?.morphAmount ?? defaults.morphAmount,
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
    case 'random-flicker':
      return `Flicker irregularly from ${clampOpacity(draft.startOpacity)} down to ${clampOpacity(draft.midOpacity)} and recover toward ${clampOpacity(draft.endOpacity)} every ${formatSeconds(draft.durationSeconds)}.`;
    case 'drift':
      return `Move ${draft.motionDirection} by ${clampPositive(draft.motionDistance, 0)} units over ${formatSeconds(draft.durationSeconds)}.`;
    case 'rotate':
      return `Rotate ${draft.turnDirection} by ${clampPositive(draft.turnDegrees, 180)} degrees over ${formatSeconds(draft.durationSeconds)}.`;
    case 'scale':
      return `Scale from ${clampScale(draft.startScale, 1)} to ${clampScale(draft.midScale, 1.12)} and settle at ${clampScale(draft.endScale, 1)} over ${formatSeconds(draft.durationSeconds)}.`;
    case 'orbit':
      return `Orbit on a ${clampPositive(draft.orbitRadiusX, 20)} by ${clampPositive(draft.orbitRadiusY, 12)} path over ${formatSeconds(draft.durationSeconds)}.`;
    case 'color-shift':
      return `Shift fill from ${normalizeColor(draft.colorFrom, '#ff8a3d')} through ${normalizeColor(draft.colorMid, '#ffd166')} to ${normalizeColor(draft.colorTo, '#1f7a8c')}.`;
    case 'path-morph':
      return draft.morphTarget === 'jitter'
        ? `Jitter each path point by up to ${Math.max(0, draft.morphAmount)} units over ${formatSeconds(draft.durationSeconds)}.`
        : `Morph path outline ${Math.min(100, Math.max(0, draft.morphAmount))}% toward a circle over ${formatSeconds(draft.durationSeconds)}.`;
  }
}

export function listAnimationsForPath(source: string, targetPath: string): ElementAnimationSummary[] {
  try {
    const root = parseSvgRoot(source);
    const target = resolveElementByPath(root, targetPath);
    if (!target) {
      return [];
    }

    return getDirectAnimationChildren(target)
      .map((child, index) => {
        const nodeName = getLocalTagName(child) as ElementAnimationSummary['nodeName'];
        const presetValue = child.getAttribute(WORKBENCH_PRESET_ATTRIBUTE);
        const presetId = animationPresets.some((preset) => preset.id === presetValue)
          ? presetValue as AnimationPresetId
          : null;
        return {
          index,
          nodeName,
          presetId,
          label: getAnimationLabel(presetId, nodeName),
          detail: describeExistingAnimation(child),
          begin: child.getAttribute('begin'),
          duration: child.getAttribute('dur'),
          repeatCount: child.getAttribute('repeatCount'),
          isWorkbenchAuthored: child.getAttribute(WORKBENCH_ANIMATION_ATTRIBUTE) === 'true',
          isEditable: inferAnimationDraftFromNode(child) !== null,
        };
      });
  } catch {
    return [];
  }
}

export function inferAnimationDraftForPath(source: string, targetPath: string, animationIndex = 0): AnimationDraft | null {
  try {
    const root = parseSvgRoot(source);
    const target = resolveElementByPath(root, targetPath);
    if (!target) {
      return null;
    }

    const animationNode = getDirectAnimationChildren(target)[animationIndex];
    if (!animationNode) {
      return null;
    }

    return inferAnimationDraftFromNode(animationNode);
  } catch {
    return null;
  }
}

export function applyAnimationDraftsToSource(
  source: string,
  targetDrafts: AnimationTargetDraft[],
  options?: AnimationReplaceMode | AnimationApplyOptions,
): AnimationMutationResult {
  const root = parseSvgRoot(source);
  const resolvedOptions = normalizeAnimationApplyOptions(options);
  let appliedCount = 0;
  let removedCount = 0;
  const skippedPaths: string[] = [];

  targetDrafts.forEach(({ path, draft }) => {
    const target = resolveElementByPath(root, path);
    if (!target || !isAnimatableElement(target)) {
      skippedPaths.push(path);
      return;
    }

    const result = applyAnimationNodesToTarget(target, root.ownerDocument, draft, resolvedOptions);
    if (!result.applied) {
      skippedPaths.push(path);
      return;
    }

    removedCount += result.removedCount;
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
  options?: AnimationReplaceMode | AnimationApplyOptions,
): AnimationMutationResult {
  return applyAnimationDraftsToSource(
    source,
    Array.from(new Set(targetPaths)).map((path) => ({ path, draft })),
    options,
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

export function reorderAnimationInSource(
  source: string,
  targetPath: string,
  fromIndex: number,
  toPosition: number,
  replaceMode: AnimationReplaceMode = 'workbench',
): AnimationMutationResult {
  const root = parseSvgRoot(source);
  const target = resolveElementByPath(root, targetPath);
  if (!target || !isAnimatableElement(target)) {
    return {
      source,
      appliedCount: 0,
      removedCount: 0,
      skippedPaths: [targetPath],
    };
  }

  const directAnimationChildren = getDirectAnimationChildren(target);
  const animationNode = directAnimationChildren[fromIndex];
  if (!animationNode || !canReplaceAnimationNode(animationNode, replaceMode)) {
    return {
      source,
      appliedCount: 0,
      removedCount: 0,
      skippedPaths: [targetPath],
    };
  }

  const changed = moveAnimationNode(target, fromIndex, toPosition);

  return {
    source: changed ? new XMLSerializer().serializeToString(root) : source,
    appliedCount: changed ? 1 : 0,
    removedCount: 0,
    skippedPaths: [],
  };
}

export function removeAnimationAtIndexFromSource(
  source: string,
  targetPath: string,
  animationIndex: number,
  replaceMode: AnimationReplaceMode = 'workbench',
): AnimationMutationResult {
  const root = parseSvgRoot(source);
  const target = resolveElementByPath(root, targetPath);
  if (!target || !isAnimatableElement(target)) {
    return {
      source,
      appliedCount: 0,
      removedCount: 0,
      skippedPaths: [targetPath],
    };
  }

  const animationNode = getDirectAnimationChildren(target)[animationIndex];
  if (!animationNode || !canReplaceAnimationNode(animationNode, replaceMode)) {
    return {
      source,
      appliedCount: 0,
      removedCount: 0,
      skippedPaths: [targetPath],
    };
  }

  animationNode.remove();

  return {
    source: new XMLSerializer().serializeToString(root),
    appliedCount: 0,
    removedCount: 1,
    skippedPaths: [],
  };
}
