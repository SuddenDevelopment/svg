import { useDeferredValue, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent, DragEvent, KeyboardEvent, MouseEvent, PointerEvent, WheelEvent } from 'react';
import { sampleSvg } from './lib/sample-svg';
import {
  animationPresets,
  applyAnimationDraftsToSource,
  createAnimationDraft,
  describeAnimationDraft,
  getAnimationPresetDefinition,
  inferAnimationDraftForPath,
  listAnimationsForPath,
  removeAnimationAtIndexFromSource,
  removeWorkbenchAnimationsFromSource,
  reorderAnimationInSource,
} from './lib/svg-animation';
import {
  applyInteractionBehaviorPreset,
  applyInteractionDraftToSource,
  createInteractionDraft,
  inferInteractionDraftForPath,
  interactionBehaviorPresets,
  inspectInteractionForPath,
  interactionFocusPresets,
  interactionHoverPresets,
  type InteractionBehaviorPresetId,
  isAnchorLikeNode,
} from './lib/svg-interaction';
import { buildAnalysis, getChangedPreviewNodePaths } from './lib/svg-analysis';
import type { Analysis } from './lib/svg-analysis';
import type {
  AnimationDraft,
  AnimationEasing,
  AnimationMorphTarget,
  AnimationMotionDirection,
  AnimationPresetId,
  AnimationReplaceMode,
  AnimationRotateMode,
  AnimationStackMode,
  AnimationStartMode,
  AnimationTurnDirection,
  ElementAnimationSummary,
} from './lib/svg-animation';
import {
  buildExportFileName,
  buildPngExportFileName,
  copySvgSourceToClipboard,
  createPngSnapshot,
  downloadBlob,
  downloadSvgSource,
  getExportVariantLabel,
} from './lib/svg-export';
import type { ExportVariant } from './lib/svg-export';
import { parseUploadedFontFile } from './lib/svg-fonts';
import type { FontMapping, TextConversionOptions, UploadedFontAsset } from './lib/svg-fonts';
import { clearSvgSource, optimizeSvgSource, prettifySvgSource } from './lib/svg-source';
import {
  buildTracedSvgFileName,
  createRasterTraceSettings,
  isJpegRasterAsset,
  isSupportedRasterFile,
  loadRasterTraceAsset,
  rasterTraceAccept,
  rasterTraceFormatLabel,
  rasterTracePresets,
  traceRasterAssetToSvg,
  type RasterTraceAsset,
  type RasterTraceMode,
  type RasterTracePresetId,
  type RasterTraceSettings,
} from './lib/svg-tracing';
import {
  applySafeRepairs,
  bakeContainerTransforms,
  bakeDirectTransforms,
  cleanupPaths,
  cleanupReferences,
  cleanupAuthoringMetadata,
  convertStrokesToOutlines,
  convertTextToPaths,
  expandUseElements,
  getContainerTransformMessage,
  getPathCleanupMessage,
  getReferenceCleanupMessage,
  getStyleInliningMessage,
  getStrokeOutlineMessage,
  getTextConversionMessage,
  getUseExpansionMessage,
  inlineSimpleStyles,
  normalizeShapesToPaths,
} from './lib/svg-normalization';
import {
  applyStyleDraftToSource,
  createStyleDraft,
  inferStyleDraftForPath,
  isPaintKeyword,
  isStyleDirectlyHidden,
  paintValueToColorInput,
  setHiddenStateForPaths,
} from './lib/svg-style';
import type { StyleDraft } from './lib/svg-style';

type PreviewTab = 'preview' | 'source';
type WorkspaceSection = 'file' | 'repair' | 'export';
type InspectorTab = 'overview' | 'selection' | 'warnings';
type SelectionFacet = 'style' | 'animate' | 'interact';
type RightPanelMode = 'collapsed' | 'quarter' | 'half';

type ExportReport = {
  action: 'download' | 'copy';
  format: 'svg' | 'png';
  variant: ExportVariant;
  fileName: string;
  applied: string[];
  remaining: string[];
};

type PreviewViewport = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

type SourceSelection = {
  start: number;
  end: number;
};

function formatByteCount(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type SelectionAppearancePresetId = 'studio' | 'signal' | 'blueprint';
type SelectionAppearanceStateId = 'selected' | 'hovered' | 'changed' | 'targeted';
type SelectionAppearanceIntensity = 'soft' | 'medium' | 'strong';

type SelectionAppearanceStateSettings = {
  visible: boolean;
  intensity: SelectionAppearanceIntensity;
};

type SelectionAppearanceSettings = Record<SelectionAppearanceStateId, SelectionAppearanceStateSettings>;
type SelectionAppearanceSnapshot = {
  preset: SelectionAppearancePresetId;
  settings: SelectionAppearanceSettings;
};

const exportPresetCards: Array<{ id: ExportVariant; title: string; description: string }> = [
  {
    id: 'current',
    title: 'Current',
    description: 'Download the source exactly as it appears in the editor.',
  },
  {
    id: 'runtime',
    title: 'Browser/runtime',
    description: 'Preserve media, animation, and links while cleaning broken chained references and authoring noise.',
  },
  {
    id: 'safe',
    title: 'Geometry-safe',
    description: 'Apply the geometry-focused safe repair pipeline before export.',
  },
  {
    id: 'blender',
    title: 'Blender-friendly',
    description: 'Use the geometry-safe export with a Blender-specific preset label and report framing.',
  },
];

const resourceCards: Array<{
  id: 'examples' | 'addon' | 'discord';
  title: string;
  description: string;
  href: string;
  note?: string;
}> = [
  {
    id: 'examples',
    title: 'Example SVGs',
    description: 'Browse the repository sample SVG library used for testing and workbench validation.',
    href: 'https://github.com/SuddenDevelopment/svg/tree/main/tests/SVG',
  },
  {
    id: 'addon',
    title: 'Blender Addon',
    description: 'Open the published Blender addon repository from the same owner.',
    href: 'https://github.com/SuddenDevelopment/blender-manifest-addon',
  },
  {
    id: 'discord',
    title: 'Discord link',
    description: 'Open Discord. Replace this destination with the real invite URL when you have it.',
    href: 'https://discord.com/',
    note: 'Placeholder destination until the project invite URL is available.',
  },
];

const primaryNavItems: Array<{
  id: WorkspaceSection;
  label: string;
  shortLabel: string;
}> = [
  {
    id: 'file',
    label: 'File',
    shortLabel: 'Fi',
  },
  {
    id: 'repair',
    label: 'Repair',
    shortLabel: 'Re',
  },
  {
    id: 'export',
    label: 'Export',
    shortLabel: 'Ex',
  },
];

const featuredTags = ['path', 'text', 'image', 'video', 'use', 'defs', 'style', 'animate', 'animateTransform', 'set'];
const inspectorTabsBySection: Record<WorkspaceSection, InspectorTab[]> = {
  file: ['overview', 'warnings', 'selection'],
  repair: ['overview', 'warnings', 'selection'],
  export: ['overview', 'warnings', 'selection'],
};

const defaultInspectorTabBySection: Record<WorkspaceSection, InspectorTab> = {
  file: 'overview',
  repair: 'overview',
  export: 'overview',
};

const selectionFacetLabels: Record<SelectionFacet, string> = {
  style: 'Style',
  animate: 'Animate',
  interact: 'Interact',
};

const inspectorTabLabels: Record<InspectorTab, string> = {
  overview: 'Overview',
  selection: 'Selection',
  warnings: 'Warnings',
};

const SELECTION_APPEARANCE_STORAGE_KEY = 'svg-workbench.selection-appearance';
const selectionAppearanceStateIds: SelectionAppearanceStateId[] = ['selected', 'hovered', 'changed', 'targeted'];
const selectionAppearanceIntensityOptions: SelectionAppearanceIntensity[] = ['soft', 'medium', 'strong'];
const selectionAppearanceShadowScale: Record<SelectionAppearanceIntensity, { blur: number; alpha: number }> = {
  soft: { blur: 5, alpha: 0.48 },
  medium: { blur: 9, alpha: 0.82 },
  strong: { blur: 13, alpha: 0.96 },
};

const selectionAppearancePresets: Array<{
  id: SelectionAppearancePresetId;
  label: string;
  description: string;
  palette: {
    selected: string;
    hovered: string;
    changed: string;
    targeted: string;
  };
}> = [
  {
    id: 'studio',
    label: 'Studio',
    description: 'Warm focus colors that match the current workbench preview.',
    palette: {
      selected: '#ff8a3d',
      hovered: '#1f7a8c',
      changed: '#ffb15d',
      targeted: '#0b6e4f',
    },
  },
  {
    id: 'signal',
    label: 'Signal',
    description: 'Punchy red and gold highlights for dense or low-contrast artboards.',
    palette: {
      selected: '#d1495b',
      hovered: '#edae49',
      changed: '#f79256',
      targeted: '#00798c',
    },
  },
  {
    id: 'blueprint',
    label: 'Blueprint',
    description: 'Cool cyan and blue cues that read cleanly on light technical artwork.',
    palette: {
      selected: '#2563eb',
      hovered: '#06b6d4',
      changed: '#8b5cf6',
      targeted: '#0f766e',
    },
  },
];

const selectionAppearanceLegend: Array<{
  id: SelectionAppearanceStateId;
  label: string;
  description: string;
}> = [
  {
    id: 'selected',
    label: 'Selected node',
    description: 'The actively inspected element.',
  },
  {
    id: 'hovered',
    label: 'Risk hover',
    description: 'Nodes spotlighted from warnings or related lists.',
  },
  {
    id: 'changed',
    label: 'Recent repair',
    description: 'Elements affected by the latest cleanup action.',
  },
  {
    id: 'targeted',
    label: 'Animation target',
    description: 'Nodes included in the current animation target set.',
  },
];

function createDefaultSelectionAppearanceSettings(): SelectionAppearanceSettings {
  return {
    selected: { visible: true, intensity: 'strong' },
    hovered: { visible: true, intensity: 'medium' },
    changed: { visible: true, intensity: 'strong' },
    targeted: { visible: true, intensity: 'medium' },
  };
}

function createDefaultSelectionAppearanceSnapshot(): SelectionAppearanceSnapshot {
  return {
    preset: 'studio',
    settings: createDefaultSelectionAppearanceSettings(),
  };
}

function isSelectionAppearancePresetId(value: unknown): value is SelectionAppearancePresetId {
  return selectionAppearancePresets.some((preset) => preset.id === value);
}

function isSelectionAppearanceIntensity(value: unknown): value is SelectionAppearanceIntensity {
  return selectionAppearanceIntensityOptions.includes(value as SelectionAppearanceIntensity);
}

function normalizeSelectionAppearanceSettings(value: unknown): SelectionAppearanceSettings {
  const defaults = createDefaultSelectionAppearanceSettings();
  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const record = value as Record<string, unknown>;
  return Object.fromEntries(selectionAppearanceStateIds.map((stateId) => {
    const stateValue = record[stateId];
    const stateDefaults = defaults[stateId];
    if (!stateValue || typeof stateValue !== 'object') {
      return [stateId, stateDefaults];
    }

    const stateRecord = stateValue as Record<string, unknown>;
    return [
      stateId,
      {
        visible: typeof stateRecord.visible === 'boolean' ? stateRecord.visible : stateDefaults.visible,
        intensity: isSelectionAppearanceIntensity(stateRecord.intensity) ? stateRecord.intensity : stateDefaults.intensity,
      },
    ];
  })) as SelectionAppearanceSettings;
}

function parseSelectionAppearanceSnapshot(value: unknown): SelectionAppearanceSnapshot {
  const fallback = createDefaultSelectionAppearanceSnapshot();
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  return {
    preset: isSelectionAppearancePresetId(record.preset) ? record.preset : fallback.preset,
    settings: normalizeSelectionAppearanceSettings(record.settings),
  };
}

function readStoredSelectionAppearance() {
  const fallback = createDefaultSelectionAppearanceSnapshot();

  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(SELECTION_APPEARANCE_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    return parseSelectionAppearanceSnapshot(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

function hexToRgbChannels(value: string) {
  const normalized = value.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((character) => `${character}${character}`).join('')
    : normalized;

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);

  return `${red}, ${green}, ${blue}`;
}

function buildSelectionAppearanceStyle(
  preset: (typeof selectionAppearancePresets)[number],
  settings: SelectionAppearanceSettings,
) {
  const style: Record<string, string> = {};

  selectionAppearanceStateIds.forEach((stateId) => {
    const intensity = selectionAppearanceShadowScale[settings[stateId].intensity];
    const rgbChannels = hexToRgbChannels(preset.palette[stateId]);

    style[`--preview-selection-${stateId}-shadow`] = `0 0 ${intensity.blur}px rgba(${rgbChannels}, ${settings[stateId].visible ? intensity.alpha : 0})`;
    style[`--selection-legend-${stateId}`] = preset.palette[stateId];
    style[`--selection-legend-${stateId}-opacity`] = settings[stateId].visible ? '1' : '0.28';
  });

  return style as CSSProperties;
}

const DEFAULT_PREVIEW_VIEWPORT: PreviewViewport = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

const PREVIEW_MIN_SCALE = 0.5;
const PREVIEW_MAX_SCALE = 4;
const PREVIEW_SCALE_STEP = 0.25;
const PREVIEW_PAN_STEP = 36;

function clampPreviewScale(scale: number) {
  return Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, Number(scale.toFixed(2))));
}

function getPreviewMotionVector(direction: AnimationMotionDirection, distance: number) {
  const safeDistance = Math.max(0, distance);
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

function getPreviewFlickerStops(startOpacity: number, lowOpacity: number, endOpacity: number) {
  const keyTimes = [0.07, 0.16, 0.28, 0.41, 0.55, 0.69, 0.83];
  const lowWeights = [0.68, 1, 0.22, 0.86, 0.35, 0.94, 0.12];
  return keyTimes.map((time, index) => {
    const baseline = startOpacity + ((endOpacity - startOpacity) * time);
    const weight = lowWeights[index] ?? 0;
    const value = baseline - ((baseline - lowOpacity) * weight);
    return Number(Math.min(1, Math.max(0, value)).toFixed(2));
  });
}

function parseAnimationSummarySeconds(value: string | null) {
  if (!value) {
    return 0;
  }

  const normalized = value.includes('+') ? value.split('+').at(-1) ?? value : value;
  const secondsMatch = normalized.match(/([0-9]*\.?[0-9]+)s/);
  if (secondsMatch) {
    return Number(secondsMatch[1]);
  }

  return Number(normalized) || 0;
}

function getAnimationDraftTimelineEnd(draft: AnimationDraft) {
  return draft.delaySeconds + draft.durationSeconds * (draft.repeatMode === 'indefinite' ? 3 : Math.max(1, draft.repeatCount));
}

function getAnimationSummaryTimelineEnd(animation: ElementAnimationSummary) {
  const beginSeconds = parseAnimationSummarySeconds(animation.begin);
  const durationSeconds = parseAnimationSummarySeconds(animation.duration);
  const repeatCount = animation.repeatCount === 'indefinite'
    ? 3
    : Math.max(1, Number.parseInt(animation.repeatCount ?? '1', 10) || 1);

  return beginSeconds + durationSeconds * repeatCount;
}

function getAnimationStackIndexAfterMove(fromIndex: number, toPosition: number) {
  return toPosition > fromIndex ? toPosition - 1 : toPosition;
}

function getSourceMetrics(source: string, selection: SourceSelection) {
  const safeStart = Math.max(0, Math.min(selection.start, source.length));
  const safeEnd = Math.max(safeStart, Math.min(selection.end, source.length));
  const lineBreaks = source.slice(0, safeStart).split('\n');
  return {
    line: lineBreaks.length,
    column: (lineBreaks.at(-1)?.length ?? 0) + 1,
    selectionLength: safeEnd - safeStart,
    lines: source.length === 0 ? 1 : source.split('\n').length,
    characters: source.length,
  };
}

function getReadinessLabel(status: Analysis['exportReadiness']['status']) {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'repairable':
      return 'Repairable';
    default:
      return 'Blocked';
  }
}

function getPngSnapshotLabel(variant: ExportVariant) {
  switch (variant) {
    case 'current':
      return 'Current PNG snapshot';
    case 'runtime':
      return 'Browser/runtime PNG snapshot';
    case 'safe':
      return 'Geometry-safe PNG snapshot';
    case 'blender':
      return 'Blender-friendly PNG snapshot';
  }
}

function hasInlineOverflow(element: HTMLElement) {
  return element.scrollWidth > element.clientWidth + 1;
}

function getNextRightPanelMode(current: RightPanelMode): RightPanelMode {
  switch (current) {
    case 'collapsed':
      return 'quarter';
    case 'quarter':
      return 'half';
    case 'half':
      return 'collapsed';
  }
}

function getRightPanelToggleLabel(mode: RightPanelMode) {
  switch (mode) {
    case 'collapsed':
      return 'Expand inspection panel to 25% width';
    case 'quarter':
      return 'Expand inspection panel to 50% width';
    case 'half':
      return 'Collapse inspection panel';
  }
}

function getRightPanelToggleIcon(mode: RightPanelMode) {
  return mode === 'half' ? '>' : '<';
}

function syncFitContainers(root: ParentNode | null) {
  if (!root) {
    return;
  }

  root.querySelectorAll<HTMLElement>('[data-fit-container]').forEach((element) => {
    const shouldWrap = element.dataset.fitMode === 'children'
      ? Array.from(element.children).some((child) => child instanceof HTMLElement && hasInlineOverflow(child))
      : hasInlineOverflow(element);

    element.dataset.fitState = shouldWrap ? 'wrap' : 'fit';
  });
}

function App() {
  const inputId = useId();
  const rasterInputId = useId();
  const fontInputId = useId();
  const sourceId = useId();
  const resourcesDialogTitleId = useId();
  const settingsDialogTitleId = useId();
  const inspectorTabsId = useId();
  const selectionFacetTabsId = useId();
  const previewTabsId = useId();
  const exportPresetTabsId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rasterInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const inspectorPanelRef = useRef<HTMLElement | null>(null);
  const previewTimelineIntervalRef = useRef<number | null>(null);
  const previewPointerRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
    distance: number;
  } | null>(null);
  const previewHitCycleRef = useRef<{
    clientX: number;
    clientY: number;
    nodeIds: string[];
    nextIndex: number;
  } | null>(null);
  const suppressPreviewClickRef = useRef(false);
  const initialSelectionAppearanceRef = useRef<ReturnType<typeof readStoredSelectionAppearance> | null>(null);

  if (initialSelectionAppearanceRef.current === null) {
    initialSelectionAppearanceRef.current = readStoredSelectionAppearance();
  }

  const [source, setSource] = useState(sampleSvg);
  const [fileName, setFileName] = useState('sample.svg');
  const [previewTab, setPreviewTab] = useState<PreviewTab>('preview');
  const [previewViewport, setPreviewViewport] = useState<PreviewViewport>(DEFAULT_PREVIEW_VIEWPORT);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedPreviewNodeIds, setSelectedPreviewNodeIds] = useState<string[]>([]);
  const [activeAnimationTargetPath, setActiveAnimationTargetPath] = useState<string | null>(null);
  const [activeAnimationStackIndex, setActiveAnimationStackIndex] = useState<number | null>(null);
  const [animationDraft, setAnimationDraft] = useState<AnimationDraft>(() => createAnimationDraft('fade-in'));
  const [targetAnimationOverrides, setTargetAnimationOverrides] = useState<Record<string, Partial<AnimationDraft>>>({});
  const [animationReplaceMode, setAnimationReplaceMode] = useState<AnimationReplaceMode>('workbench');
  const [animationStackMode, setAnimationStackMode] = useState<AnimationStackMode>('replace-target');
  const [draggedAnimationStackIndex, setDraggedAnimationStackIndex] = useState<number | null>(null);
  const [animationStackDropPosition, setAnimationStackDropPosition] = useState<number | null>(null);
  const [animationMessage, setAnimationMessage] = useState<string | null>(null);
  const [interactionDraft, setInteractionDraft] = useState(() => createInteractionDraft());
  const [interactionMessage, setInteractionMessage] = useState<string | null>(null);
  const [styleDraft, setStyleDraft] = useState<StyleDraft>(() => createStyleDraft());
  const [styleMessage, setStyleMessage] = useState<string | null>(null);
  const [previewTimelineSeconds, setPreviewTimelineSeconds] = useState(0);
  const [isPreviewTimelinePlaying, setIsPreviewTimelinePlaying] = useState(true);
  const [hoveredPreviewNodeIds, setHoveredPreviewNodeIds] = useState<string[]>([]);
  const [recentChangePaths, setRecentChangePaths] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanningPreview, setIsPanningPreview] = useState(false);
  const [selectionAppearancePreset, setSelectionAppearancePreset] = useState<SelectionAppearancePresetId>(
    () => initialSelectionAppearanceRef.current?.preset ?? 'studio',
  );
  const [selectionAppearanceSettings, setSelectionAppearanceSettings] = useState<SelectionAppearanceSettings>(
    () => initialSelectionAppearanceRef.current?.settings ?? createDefaultSelectionAppearanceSettings(),
  );
  const [selectionAppearanceTransferText, setSelectionAppearanceTransferText] = useState('');
  const [selectionAppearanceMessage, setSelectionAppearanceMessage] = useState<string | null>(null);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const [sourceActionMessage, setSourceActionMessage] = useState<string | null>(null);
  const [sourceSelection, setSourceSelection] = useState<SourceSelection>({ start: 0, end: 0 });
  const [rasterTraceAsset, setRasterTraceAsset] = useState<RasterTraceAsset | null>(null);
  const [rasterTraceSettings, setRasterTraceSettings] = useState<RasterTraceSettings>(() => createRasterTraceSettings());
  const [rasterTraceMessage, setRasterTraceMessage] = useState<string | null>(null);
  const [isTracingRaster, setIsTracingRaster] = useState(false);
  const [exportReport, setExportReport] = useState<ExportReport | null>(null);
  const [selectedExportPreset, setSelectedExportPreset] = useState<ExportVariant>('safe');
  const [uploadedFonts, setUploadedFonts] = useState<UploadedFontAsset[]>([]);
  const [fontMappings, setFontMappings] = useState<FontMapping>({});
  const [isResourcesOpen, setIsResourcesOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('file');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview');
  const [selectionFacet, setSelectionFacet] = useState<SelectionFacet>('style');
  const [isSelectedElementPanelCollapsed, setIsSelectedElementPanelCollapsed] = useState(false);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('collapsed');
  const deferredSource = useDeferredValue(source);
  const textOptions: TextConversionOptions = {
    uploadedFonts,
    fontMappings,
  };
  const isRightCollapsed = rightPanelMode === 'collapsed';

  useEffect(() => {
    try {
      const nextAnalysis = buildAnalysis(deferredSource, fileName, textOptions);
      setAnalysis(nextAnalysis);
      setParseError(null);
    } catch (error) {
      setAnalysis(null);
      setParseError(error instanceof Error ? error.message : 'Unable to parse SVG markup.');
    }
  }, [deferredSource, fileName, uploadedFonts, fontMappings]);

  useEffect(() => {
    if (parseError) {
      setRepairMessage(null);
    }
  }, [parseError]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SELECTION_APPEARANCE_STORAGE_KEY, JSON.stringify({
        preset: selectionAppearancePreset,
        settings: selectionAppearanceSettings,
      }));
    } catch {
      return;
    }
  }, [selectionAppearancePreset, selectionAppearanceSettings]);

  useEffect(() => {
    setSelectedNodeId((current) => {
      if (!analysis) {
        return null;
      }

      if (current && analysis.nodesById[current]) {
        return current;
      }

      return analysis.rootNodeId;
    });
  }, [analysis]);

  useEffect(() => {
    if (!analysis) {
      setSelectedPreviewNodeIds([]);
      return;
    }

    const validIds = new Set(Object.keys(analysis.nodesById));
    setSelectedPreviewNodeIds((current) => {
      const next = current.filter((nodeId) => validIds.has(nodeId));
      if (next.length > 0) {
        return next;
      }

      return selectedNodeId && validIds.has(selectedNodeId) ? [selectedNodeId] : [];
    });
  }, [analysis, selectedNodeId]);

  useEffect(() => {
    if (!analysis) {
      setActiveAnimationTargetPath(null);
      setActiveAnimationStackIndex(null);
      setDraggedAnimationStackIndex(null);
      setAnimationStackDropPosition(null);
      setTargetAnimationOverrides({});
      return;
    }

    const validPaths = new Set(Object.values(analysis.nodesById).map((node) => node.path));
    setTargetAnimationOverrides((current) => Object.fromEntries(Object.entries(current).filter(([path]) => validPaths.has(path))));
    setActiveAnimationTargetPath((current) => (current && validPaths.has(current) ? current : null));
  }, [analysis]);

  useEffect(() => {
    previewHitCycleRef.current = null;
  }, [analysis?.previewMarkup, previewTab]);

  useEffect(() => {
    setPreviewTimelineSeconds(0);
    setIsPreviewTimelinePlaying(true);

    const previewSvg = previewFrameRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (!previewSvg) {
      return;
    }

    const timelineSvg = previewSvg as SVGSVGElement & {
      setCurrentTime?: (seconds: number) => void;
      unpauseAnimations?: () => void;
    };

    timelineSvg.setCurrentTime?.(0);
    timelineSvg.unpauseAnimations?.();
  }, [analysis?.previewMarkup, previewTab]);

  useEffect(() => {
    if (previewTimelineIntervalRef.current !== null) {
      window.clearInterval(previewTimelineIntervalRef.current);
      previewTimelineIntervalRef.current = null;
    }

    if (!isPreviewTimelinePlaying || previewTab !== 'preview') {
      return;
    }

    previewTimelineIntervalRef.current = window.setInterval(() => {
      const previewSvg = previewFrameRef.current?.querySelector('svg') as SVGSVGElement | null;
      const timelineSvg = previewSvg as (SVGSVGElement & { getCurrentTime?: () => number }) | null;
      if (!timelineSvg?.getCurrentTime) {
        return;
      }

      setPreviewTimelineSeconds(Number(timelineSvg.getCurrentTime().toFixed(2)));
    }, 120);

    return () => {
      if (previewTimelineIntervalRef.current !== null) {
        window.clearInterval(previewTimelineIntervalRef.current);
        previewTimelineIntervalRef.current = null;
      }
    };
  }, [isPreviewTimelinePlaying, previewTab]);

  useEffect(() => {
    if (isRightCollapsed) {
      return;
    }

    const sync = () => syncFitContainers(inspectorPanelRef.current);

    sync();
    window.addEventListener('resize', sync);

    return () => {
      window.removeEventListener('resize', sync);
    };
  }, [activeSection, analysis, inspectorTab, isRightCollapsed, parseError, rightPanelMode, selectedNodeId]);

  useEffect(() => {
    if (!isResourcesOpen) {
      return;
    }

    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsResourcesOpen(false);
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);

    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [isResourcesOpen]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);

    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    const container = previewFrameRef.current;
    if (!container) {
      return;
    }

    const targetPaths = analysis && selectionFacet === 'animate'
      ? Array.from(new Set(selectedPreviewNodeIds
        .filter((nodeId) => nodeId !== analysis.rootNodeId)
        .map((nodeId) => analysis.nodesById[nodeId]?.path)
        .filter((path): path is string => Boolean(path))))
      : [];

    container.querySelectorAll('[data-svg-node-selected="true"]').forEach((node) => {
      node.removeAttribute('data-svg-node-selected');
    });
    container.querySelectorAll('[data-svg-node-hovered="true"]').forEach((node) => {
      node.removeAttribute('data-svg-node-hovered');
    });
    container.querySelectorAll('[data-svg-node-changed="true"]').forEach((node) => {
      node.removeAttribute('data-svg-node-changed');
    });
    container.querySelectorAll('[data-svg-node-targeted="true"]').forEach((node) => {
      node.removeAttribute('data-svg-node-targeted');
    });

    if (selectionAppearanceSettings.hovered.visible) {
      hoveredPreviewNodeIds.forEach((nodeId) => {
        const hoveredNode = container.querySelector(`[data-svg-node-id="${nodeId}"]`);
        if (hoveredNode) {
          hoveredNode.setAttribute('data-svg-node-hovered', 'true');
        }
      });
    }

    const changedNodes = analysis
      ? Object.values(analysis.nodesById).filter((node) => recentChangePaths.includes(node.path)).slice(0, 8)
      : [];

    if (selectionAppearanceSettings.changed.visible) {
      changedNodes.forEach((node) => {
        const changedNode = container.querySelector(`[data-svg-node-id="${node.id}"]`);
        if (changedNode) {
          changedNode.setAttribute('data-svg-node-changed', 'true');
        }
      });
    }

    if (analysis && targetPaths.length > 0 && selectionAppearanceSettings.targeted.visible) {
      const targetNodes = Object.values(analysis.nodesById).filter((node) => targetPaths.includes(node.path));
      targetNodes.forEach((node) => {
        const targetPreviewNode = container.querySelector(`[data-svg-node-id="${node.id}"]`);
        if (targetPreviewNode) {
          targetPreviewNode.setAttribute('data-svg-node-targeted', 'true');
        }
      });
    }

    if (selectionAppearanceSettings.selected.visible) {
      selectedPreviewNodeIds.forEach((nodeId) => {
        const selectedPreviewNode = container.querySelector(`[data-svg-node-id="${nodeId}"]`);
        if (selectedPreviewNode) {
          selectedPreviewNode.setAttribute('data-svg-node-selected', 'true');
        }
      });
    }
  }, [analysis, hoveredPreviewNodeIds, recentChangePaths, selectedPreviewNodeIds, selectionAppearanceSettings, selectionFacet]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void handlePickedFile(file);
    event.target.value = '';
  }

  function handleRasterFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void loadRasterAssetIntoTracePanel(file);
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files[0];
    if (!file) {
      return;
    }

    void handlePickedFile(file);
  }

  const topTags = Object.entries(analysis?.tagCounts ?? {})
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8);
  const availableInspectorTabs = inspectorTabsBySection[activeSection];
  const selectedNode = selectedNodeId && analysis ? analysis.nodesById[selectedNodeId] : null;
  const selectedPreviewNodeCount = selectedPreviewNodeIds.length;
  const activeSelectionAppearance = selectionAppearancePresets.find((preset) => preset.id === selectionAppearancePreset) ?? selectionAppearancePresets[0];
  const selectionAppearanceStyle = buildSelectionAppearanceStyle(activeSelectionAppearance, selectionAppearanceSettings);
  const nodesByPath = analysis
    ? new Map(Object.values(analysis.nodesById).map((node) => [node.path, node]))
    : null;
  const authorableSelectionPaths = analysis
    ? Array.from(new Set(selectedPreviewNodeIds
      .filter((nodeId) => nodeId !== analysis.rootNodeId)
      .map((nodeId) => analysis.nodesById[nodeId]?.path)
      .filter((path): path is string => Boolean(path))))
    : [];
  const animationTargetPaths = selectionFacet === 'animate' ? authorableSelectionPaths : [];
  const selectedAuthorableNodes = authorableSelectionPaths
    .map((path) => nodesByPath?.get(path))
    .filter((node): node is Analysis['nodesById'][string] => Boolean(node));
  const areAllSelectedElementsHidden = selectedAuthorableNodes.length > 0
    && selectedAuthorableNodes.every((node) => isStyleDirectlyHidden(node.attributes));
  const animationTargetNodes = animationTargetPaths
    .map((path) => nodesByPath?.get(path))
    .filter((node): node is Analysis['nodesById'][string] => Boolean(node));
  const animationPreset = getAnimationPresetDefinition(animationDraft.presetId);
  const selectedNodeAnimations = selectedNode ? listAnimationsForPath(source, selectedNode.path) : [];
  const activeAnimationStack = activeAnimationTargetPath ? listAnimationsForPath(source, activeAnimationTargetPath) : [];
  const activeAnimationStackSummary = activeAnimationStackIndex !== null ? activeAnimationStack[activeAnimationStackIndex] ?? null : null;
  const activeAnimationOverride = activeAnimationTargetPath ? targetAnimationOverrides[activeAnimationTargetPath] ?? null : null;
  const selectedNodeInteraction = selectedNode ? inspectInteractionForPath(source, selectedNode.path) : null;
  const previewTimelineMax = Math.max(
    4,
    ...animationTargetPaths.map((path) => {
      const draftTimelineEnd = getAnimationDraftTimelineEnd(getEffectiveAnimationDraft(path));
      const stackTimelineEnd = Math.max(0, ...listAnimationsForPath(source, path).map((animation) => getAnimationSummaryTimelineEnd(animation)));
      return Math.max(draftTimelineEnd, stackTimelineEnd);
    }),
  );
  const recentChangedNodes = analysis
    ? Object.values(analysis.nodesById).filter((node) => recentChangePaths.includes(node.path)).slice(0, 8)
    : [];
  const hasRuntimeDependencies = (analysis?.runtimeFeatures.mediaElementCount ?? 0) > 0 || (analysis?.runtimeFeatures.animationElementCount ?? 0) > 0;
  const authoringCleanupCount = analysis
    ? analysis.authoringMetadata.metadataElementCount + analysis.authoringMetadata.namespacedNodeCount + analysis.authoringMetadata.namespacedAttributeCount
    : 0;
  const strokeOutlineCount = analysis?.opportunities.strokeOutlineCount ?? 0;
  const blockedStrokeOutlineCount = analysis?.opportunities.blockedStrokeOutlineCount ?? 0;
  const pathCleanupCount = analysis?.opportunities.pathCleanupCount ?? 0;
  const referenceCleanupCount = analysis?.opportunities.referenceCleanupCount ?? 0;
  const isPreviewInteractive = previewTab === 'preview' && !parseError && Boolean(analysis?.previewMarkup);
  const sourceMetrics = getSourceMetrics(source, sourceSelection);
  const activeRasterTracePreset = rasterTracePresets.find((preset) => preset.id === rasterTraceSettings.presetId) ?? rasterTracePresets[0];
  const shouldShowPhotoCleanupControls = rasterTraceSettings.mode !== 'monochrome';
  const shouldShowPosterizeControls = rasterTraceSettings.mode !== 'monochrome';
  const rasterTraceAssetLooksLikeJpeg = rasterTraceAsset ? isJpegRasterAsset(rasterTraceAsset) : false;
  const exportPreflight = (() => {
    try {
      const authoringCleanup = cleanupAuthoringMetadata(source);
      const referenceCleanup = cleanupReferences(authoringCleanup.source, {
        preserveExternalDependencies: true,
      });
      return {
        source: referenceCleanup.source,
        details: {
          authoringCleanup: authoringCleanup.changed,
          referenceCleanups: referenceCleanup.changed,
        },
      };
    } catch {
      return null;
    }
  })();
  const runtimeExport = exportPreflight
    ? {
        source: exportPreflight.source,
        changed: exportPreflight.details.authoringCleanup + exportPreflight.details.referenceCleanups,
        details: exportPreflight.details,
      }
    : null;
  const normalizedExport = (() => {
    if (!exportPreflight) {
      return null;
    }

    try {
      const safeRepairResult = applySafeRepairs(exportPreflight.source, textOptions);
      return {
        source: safeRepairResult.source,
        changed:
          exportPreflight.details.authoringCleanup
          + exportPreflight.details.referenceCleanups
          + safeRepairResult.changed,
        details: {
          ...safeRepairResult.details,
          authoringCleanup: exportPreflight.details.authoringCleanup,
          referenceCleanups: exportPreflight.details.referenceCleanups,
        },
      };
    } catch {
      return null;
    }
  })();
  const safeRepairCount = analysis
    ? analysis.opportunities.primitiveShapeCount
      + analysis.opportunities.convertibleTextCount
      + analysis.opportunities.inlineableStyleRuleCount
      + analysis.opportunities.strokeOutlineCount
      + analysis.opportunities.pathCleanupCount
      + analysis.opportunities.directTransformCount
      + analysis.opportunities.bakeableContainerTransformCount
      + analysis.opportunities.expandableUseCount
    : 0;
  const statusSummary = analysis
    ? `${analysis.totalElements} elements • ${analysis.exportReadiness.autoFixCount} auto-fixable • ${analysis.exportReadiness.blockerCount} blocked`
    : parseError
      ? 'Invalid SVG markup'
      : 'Load an SVG to begin';

  useEffect(() => {
    if (authorableSelectionPaths.length === 0) {
      setActiveAnimationTargetPath(null);
      setActiveAnimationStackIndex(null);
      return;
    }

    const selectedPath = selectedNode && selectedNode.id !== analysis?.rootNodeId ? selectedNode.path : null;
    setActiveAnimationTargetPath((current) => {
      if (selectedPath && authorableSelectionPaths.includes(selectedPath)) {
        return selectedPath;
      }

      return current && authorableSelectionPaths.includes(current) ? current : authorableSelectionPaths[0];
    });
  }, [analysis?.rootNodeId, authorableSelectionPaths, selectedNode]);

  useEffect(() => {
    if (!activeAnimationTargetPath) {
      setActiveAnimationStackIndex(null);
      return;
    }

    setActiveAnimationStackIndex((current) => (current !== null && current < activeAnimationStack.length ? current : null));
  }, [activeAnimationStack.length, activeAnimationTargetPath]);

  useEffect(() => {
    setInteractionDraft(
      selectedNode
        ? inferInteractionDraftForPath(source, selectedNode.path) ?? createInteractionDraft(selectedNode.attributes)
        : createInteractionDraft(),
    );
    setInteractionMessage(null);
  }, [fileName, selectedNodeId]);

  useEffect(() => {
    setStyleDraft(
      selectedNode
        ? inferStyleDraftForPath(source, selectedNode.path) ?? createStyleDraft(selectedNode.attributes)
        : createStyleDraft(),
    );
    setStyleMessage(null);
  }, [fileName, selectedNodeId]);

  useEffect(() => {
    if (!availableInspectorTabs.includes(inspectorTab)) {
      setInspectorTab(defaultInspectorTabBySection[activeSection]);
    }
  }, [activeSection, availableInspectorTabs, inspectorTab]);

  function loadSvgSource(nextSource: string, nextFileName: string) {
    setSource(nextSource);
    setFileName(nextFileName);
    setPreviewTab('preview');
    setPreviewViewport(DEFAULT_PREVIEW_VIEWPORT);
    setHoveredPreviewNodeIds([]);
    setRecentChangePaths([]);
    setSourceActionMessage(null);
    setSourceSelection({ start: 0, end: 0 });
    setActiveAnimationTargetPath(null);
    setActiveAnimationStackIndex(null);
    setDraggedAnimationStackIndex(null);
    setAnimationStackDropPosition(null);
    setTargetAnimationOverrides({});
    setAnimationReplaceMode('workbench');
    setAnimationStackMode('replace-target');
    setAnimationMessage(null);
    setInteractionMessage(null);
    setPreviewTimelineSeconds(0);
    setIsPreviewTimelinePlaying(true);
  }

  function updateRasterTraceSetting<Key extends keyof RasterTraceSettings>(field: Key, value: RasterTraceSettings[Key]) {
    setRasterTraceSettings((current) => ({
      ...current,
      [field]: value,
    }));
    setRasterTraceMessage(null);
  }

  function applyRasterTracePreset(presetId: RasterTracePresetId) {
    setRasterTraceSettings(createRasterTraceSettings(presetId));
    setRasterTraceMessage(`Loaded ${rasterTracePresets.find((preset) => preset.id === presetId)?.label.toLowerCase() ?? 'trace'} settings.`);
  }

  function resetRasterTraceSettings() {
    setRasterTraceSettings(createRasterTraceSettings(rasterTraceSettings.presetId));
    setRasterTraceMessage(`Reset ${activeRasterTracePreset.label.toLowerCase()} settings.`);
  }

  function clearRasterTraceAsset() {
    setRasterTraceAsset(null);
    setRasterTraceMessage('Cleared the current raster trace source.');
  }

  function isSvgFile(file: File) {
    return file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
  }

  async function loadRasterAssetIntoTracePanel(file: File) {
    try {
      const asset = await loadRasterTraceAsset(file);
      const recommendedPresetId = isJpegRasterAsset(asset) ? 'posterized-photo' : null;
      setRasterTraceAsset(asset);
      if (recommendedPresetId) {
        setRasterTraceSettings(createRasterTraceSettings(recommendedPresetId));
      }
      setActiveSection('file');
      setPreviewTab('preview');
      setRasterTraceMessage(recommendedPresetId
        ? `Loaded ${file.name} for tracing with the posterized photo preset for cleaner JPG edges.`
        : `Loaded ${file.name} for tracing.`);
      setSourceActionMessage(null);
    } catch (error) {
      setRasterTraceMessage(error instanceof Error ? error.message : 'Unable to load the raster image for tracing.');
    }
  }

  function loadSvgFileIntoEditor(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const nextSource = typeof reader.result === 'string' ? reader.result : '';
      loadSvgSource(nextSource, file.name);
    };
    reader.readAsText(file);
  }

  async function handlePickedFile(file: File) {
    if (isSupportedRasterFile(file)) {
      await loadRasterAssetIntoTracePanel(file);
      return;
    }

    if (isSvgFile(file)) {
      loadSvgFileIntoEditor(file);
      return;
    }

    setSourceActionMessage(`Unsupported file type. Load an SVG, or use ${rasterTraceFormatLabel} for tracing.`);
  }

  async function traceRasterIntoEditor() {
    if (!rasterTraceAsset) {
      setRasterTraceMessage('Choose a raster file before tracing.');
      return;
    }

    setIsTracingRaster(true);
    setRasterTraceMessage(null);

    try {
      const tracedSource = await traceRasterAssetToSvg(rasterTraceAsset, rasterTraceSettings);
      const tracedFileName = buildTracedSvgFileName(rasterTraceAsset.fileName);
      loadSvgSource(tracedSource, tracedFileName);
      setActiveSection('file');
      setSourceActionMessage(`Traced ${rasterTraceAsset.fileName} into ${tracedFileName}.`);
      setRasterTraceMessage(`Applied the ${activeRasterTracePreset.label.toLowerCase()} trace preset to ${rasterTraceAsset.fileName}.`);
    } catch (error) {
      setRasterTraceMessage(error instanceof Error ? error.message : 'Unable to trace the current raster image.');
    } finally {
      setIsTracingRaster(false);
    }
  }

  function resetPreviewViewport() {
    setPreviewViewport(DEFAULT_PREVIEW_VIEWPORT);
  }

  function panPreview(offsetX: number, offsetY: number) {
    setPreviewViewport((current) => ({
      ...current,
      offsetX: current.offsetX + offsetX,
      offsetY: current.offsetY + offsetY,
    }));
  }

  function zoomPreview(delta: number) {
    setPreviewViewport((current) => ({
      ...current,
      scale: clampPreviewScale(current.scale + delta),
    }));
  }

  function stopPreviewPan() {
    previewPointerRef.current = null;
    setIsPanningPreview(false);
  }

  function commitRepairSource(nextSource: string, message: string) {
    setRecentChangePaths(getChangedPreviewNodePaths(source, nextSource));
    setHoveredPreviewNodeIds([]);
    setSource(nextSource);
    setRepairMessage(message);
    setSourceActionMessage(null);
    setPreviewTab('preview');
  }

  function commitSourceAction(nextSource: string, message: string) {
    setSource(nextSource);
    setRecentChangePaths([]);
    setHoveredPreviewNodeIds([]);
    setSourceActionMessage(message);
    setSourceSelection({ start: 0, end: 0 });
  }

  function updateSourceSelection(start: number, end = start) {
    setSourceSelection({ start, end });
  }

  function setPreviewHover(nodeIds: string[]) {
    setHoveredPreviewNodeIds(nodeIds);
  }

  function clearPreviewHover() {
    setHoveredPreviewNodeIds([]);
  }

  function applySourcePrettify() {
    try {
      const nextSource = prettifySvgSource(source);
      commitSourceAction(nextSource, nextSource === source ? 'SVG source is already prettified.' : 'Prettified SVG source.');
    } catch (error) {
      setSourceActionMessage(error instanceof Error ? error.message : 'Unable to prettify SVG source.');
    }
  }

  function applySourceOptimize() {
    try {
      const nextSource = optimizeSvgSource(source);
      commitSourceAction(nextSource, nextSource === source ? 'SVG source is already optimized.' : 'Optimized SVG source.');
    } catch (error) {
      setSourceActionMessage(error instanceof Error ? error.message : 'Unable to optimize SVG source.');
    }
  }

  function applySourceClear() {
    commitSourceAction(clearSvgSource(), 'Cleared the source editor to a blank SVG template.');
  }

  function getNodeListLabel(node: Analysis['nodesById'][string]) {
    const idLabel = node.attributes.id ? `#${node.attributes.id}` : '';
    const classLabel = node.attributes.class
      ? `.${node.attributes.class.trim().split(/\s+/).filter(Boolean).join('.')}`
      : '';
    return `<${node.name}>${idLabel || classLabel ? ` ${idLabel}${classLabel}` : ''}`;
  }

  function updateFontMapping(familyKey: string, fontId: string) {
    setFontMappings((current) => {
      const nextMappings = { ...current };
      if (!fontId) {
        delete nextMappings[familyKey];
      } else {
        nextMappings[familyKey] = fontId;
      }
      return nextMappings;
    });
  }

  async function handleFontUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    const loadedFonts: UploadedFontAsset[] = [];
    const failedFonts: string[] = [];

    for (const file of files) {
      try {
        loadedFonts.push(await parseUploadedFontFile(file));
      } catch {
        failedFonts.push(file.name);
      }
    }

    if (loadedFonts.length > 0) {
      setUploadedFonts((current) => [...current, ...loadedFonts]);
    }

    if (loadedFonts.length > 0 && failedFonts.length > 0) {
      setRepairMessage(`Loaded ${loadedFonts.length} font${loadedFonts.length === 1 ? '' : 's'} and skipped ${failedFonts.length} unsupported file${failedFonts.length === 1 ? '' : 's'}.`);
    } else if (loadedFonts.length > 0) {
      setRepairMessage(`Loaded ${loadedFonts.length} font${loadedFonts.length === 1 ? '' : 's'} for text conversion.`);
    } else {
      setRepairMessage(`Unable to parse ${failedFonts.length} uploaded font file${failedFonts.length === 1 ? '' : 's'}.`);
    }

    event.target.value = '';
  }

  function removeUploadedFont(fontId: string) {
    setUploadedFonts((current) => current.filter((font) => font.id !== fontId));
    setFontMappings((current) => {
      const nextMappings = Object.fromEntries(Object.entries(current).filter(([, value]) => value !== fontId));
      return nextMappings;
    });
  }

  function applySafeRepairPass() {
    try {
      const result = applySafeRepairs(source, textOptions);

      if (result.changed === 0 && result.skipped === 0) {
        commitRepairSource(result.source, 'No safe repairs were available in this pass.');
      } else {
        const appliedParts = [
          result.details.styleRules > 0 ? `${result.details.styleRules} style rules` : null,
          result.details.textPaths > 0 ? `${result.details.textPaths} text elements` : null,
          result.details.shapes > 0 ? `${result.details.shapes} shapes` : null,
          result.details.strokeOutlines > 0 ? `${result.details.strokeOutlines} stroke outlines` : null,
          result.details.pathCleanups > 0 ? `${result.details.pathCleanups} path cleanups` : null,
          result.details.directTransforms > 0 ? `${result.details.directTransforms} direct transforms` : null,
          result.details.containerTransforms > 0 ? `${result.details.containerTransforms} container transforms` : null,
          result.details.useExpansions > 0 ? `${result.details.useExpansions} use references` : null,
        ].filter(Boolean);

        const blockedParts = [
          result.details.blockedStyleRules > 0 ? `${result.details.blockedStyleRules} blocked style rules` : null,
          result.details.blockedTexts > 0 ? `${result.details.blockedTexts} blocked text elements` : null,
          result.details.blockedStrokeOutlines > 0 ? `${result.details.blockedStrokeOutlines} blocked stroke outlines` : null,
          result.details.blockedContainers > 0 ? `${result.details.blockedContainers} blocked containers` : null,
          result.details.blockedUses > 0 ? `${result.details.blockedUses} blocked use references` : null,
        ].filter(Boolean);

        const appliedSummary = appliedParts.length > 0 ? `Applied ${appliedParts.join(', ')}.` : 'Applied no safe repairs.';
        const blockedSummary = blockedParts.length > 0 ? ` Left ${blockedParts.join(' and ')} unchanged.` : '';
        commitRepairSource(result.source, `${appliedSummary}${blockedSummary}`);
      }
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to apply safe repairs.');
    }
  }

  function applyStyleInlining() {
    try {
      const result = inlineSimpleStyles(source);

      if (result.changed > 0 && result.skipped > 0) {
        commitRepairSource(result.source, `Inlined ${result.changed} simple style rule${result.changed === 1 ? '' : 's'} and left ${result.skipped} blocked rule${result.skipped === 1 ? '' : 's'} unchanged.`);
      } else if (result.changed > 0) {
        commitRepairSource(result.source, `Inlined ${result.changed} simple style rule${result.changed === 1 ? '' : 's'} into element styles.`);
      } else if (result.skipped > 0) {
        commitRepairSource(result.source, `No style rules could be inlined safely. ${result.skipped} blocked rule${result.skipped === 1 ? '' : 's'} remain.`);
      } else {
        commitRepairSource(result.source, 'No inlineable style rules were found.');
      }
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to inline style rules.');
    }
  }

  function applyShapeNormalization() {
    try {
      const result = normalizeShapesToPaths(source);
      commitRepairSource(
        result.source,
        result.changed > 0
          ? `Converted ${result.changed} shape primitive${result.changed === 1 ? '' : 's'} into path elements.`
          : 'No primitive shapes needed conversion.',
      );
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to normalize shapes.');
    }
  }

  function applyStrokeOutline() {
    try {
      const result = convertStrokesToOutlines(source);

      if (result.changed > 0 && result.skipped > 0) {
        commitRepairSource(result.source, `Outlined ${result.changed} stroke-driven node${result.changed === 1 ? '' : 's'} and left ${result.skipped} blocked stroke outline${result.skipped === 1 ? '' : 's'} unchanged.`);
      } else if (result.changed > 0) {
        commitRepairSource(result.source, `Outlined ${result.changed} stroke-driven node${result.changed === 1 ? '' : 's'} into filled geometry.`);
      } else if (result.skipped > 0) {
        commitRepairSource(result.source, `No stroke-driven nodes could be outlined safely. ${result.skipped} blocked stroke outline${result.skipped === 1 ? '' : 's'} remain.`);
      } else {
        commitRepairSource(result.source, 'No stroke-driven nodes needed outline conversion.');
      }
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to convert strokes to outlines.');
    }
  }

  function applyTextConversion() {
    try {
      const result = convertTextToPaths(source, textOptions);

      if (result.changed > 0 && result.skipped > 0) {
        commitRepairSource(result.source, `Converted ${result.changed} text element${result.changed === 1 ? '' : 's'} to paths and left ${result.skipped} blocked text element${result.skipped === 1 ? '' : 's'} unchanged.`);
      } else if (result.changed > 0) {
        commitRepairSource(result.source, `Converted ${result.changed} text element${result.changed === 1 ? '' : 's'} to paths.`);
      } else if (result.skipped > 0) {
        commitRepairSource(result.source, `No text elements could be converted. ${result.skipped} blocked text element${result.skipped === 1 ? '' : 's'} remain.`);
      } else {
        commitRepairSource(result.source, 'No text elements needed conversion.');
      }
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to convert text to paths.');
    }
  }

  function applyPathCleanup() {
    try {
      const result = cleanupPaths(source);
      commitRepairSource(
        result.source,
        result.changed > 0
          ? `Cleaned ${result.changed} path${result.changed === 1 ? '' : 's'} by closing near-open paths, joining fragments, repairing polygon winding, stabilizing self-intersections, or removing duplicate and tiny geometry.`
          : 'No path cleanup was needed.',
      );
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to clean paths.');
    }
  }

  function applyReferenceCleanup() {
    try {
      const result = cleanupReferences(source);
      commitRepairSource(
        result.source,
        result.changed > 0
          ? `Cleaned ${result.changed} broken, chained, or external dependency reference${result.changed === 1 ? '' : 's'} from the SVG.`
          : 'No broken, chained, or external dependency references needed cleanup.',
      );
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to clean references.');
    }
  }

  function applyTransformBake() {
    try {
      const result = bakeDirectTransforms(source);
      commitRepairSource(
        result.source,
        result.changed > 0
          ? `Baked ${result.changed} direct transform${result.changed === 1 ? '' : 's'} into geometry.`
          : 'No direct transforms could be baked in this pass.',
      );
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to bake transforms.');
    }
  }

  function applyContainerTransformBake() {
    try {
      const result = bakeContainerTransforms(source);

      if (result.changed > 0 && result.skipped > 0) {
        commitRepairSource(result.source, `Baked ${result.changed} container transform${result.changed === 1 ? '' : 's'} and left ${result.skipped} blocked container${result.skipped === 1 ? '' : 's'} unchanged.`);
      } else if (result.changed > 0) {
        commitRepairSource(result.source, `Baked ${result.changed} container transform${result.changed === 1 ? '' : 's'} into descendant geometry.`);
      } else if (result.skipped > 0) {
        commitRepairSource(result.source, `No container transforms could be baked safely. ${result.skipped} blocked container${result.skipped === 1 ? '' : 's'} remain.`);
      } else {
        commitRepairSource(result.source, 'No transformed containers needed baking.');
      }
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to bake container transforms.');
    }
  }

  function applyUseExpansion() {
    try {
      const result = expandUseElements(source);

      if (result.changed > 0 && result.skipped > 0) {
        commitRepairSource(result.source, `Expanded ${result.changed} <use> reference${result.changed === 1 ? '' : 's'} and left ${result.skipped} blocked reference${result.skipped === 1 ? '' : 's'} unchanged.`);
      } else if (result.changed > 0) {
        commitRepairSource(result.source, `Expanded ${result.changed} <use> reference${result.changed === 1 ? '' : 's'} into concrete geometry.`);
      } else if (result.skipped > 0) {
        commitRepairSource(result.source, `No <use> references could be expanded safely. ${result.skipped} blocked reference${result.skipped === 1 ? '' : 's'} remain.`);
      } else {
        commitRepairSource(result.source, 'No <use> references needed expansion.');
      }
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to expand <use> references.');
    }
  }

  function applyAuthoringCleanup() {
    try {
      const result = cleanupAuthoringMetadata(source);
      commitRepairSource(
        result.source,
        result.changed > 0
          ? `Removed ${result.changed} authoring metadata item${result.changed === 1 ? '' : 's'} from the SVG.`
          : 'No authoring metadata cleanup was needed.',
      );
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to clean authoring metadata.');
    }
  }

  function downloadCurrentSvg() {
    downloadExportVariant('current');
  }

  function canBuildExportVariant(variant: ExportVariant) {
    return variant === 'current' || variant === 'runtime' || Boolean(normalizedExport);
  }

  function getExportVariantSource(variant: ExportVariant) {
    switch (variant) {
      case 'current':
        return source;
      case 'runtime':
        return runtimeExport?.source ?? null;
      case 'safe':
      case 'blender':
        return normalizedExport?.source ?? null;
    }
  }

  function getExportVariantChangeSummary(variant: ExportVariant) {
    switch (variant) {
      case 'runtime':
        return {
          count: runtimeExport?.changed ?? 0,
          label: 'runtime-preserving cleanup changes',
        };
      case 'safe':
      case 'blender':
        return {
          count: normalizedExport?.changed ?? 0,
          label: 'geometry-safe repairs',
        };
      default:
        return null;
    }
  }

  function getExportReportHeading(report: ExportReport) {
    return report.format === 'png' ? getPngSnapshotLabel(report.variant) : getExportVariantLabel(report.variant);
  }

  function buildPresetExportReport(variant: ExportVariant) {
    const nextFileName = buildExportFileName(fileName, variant);
    if (variant === 'runtime') {
      if (!runtimeExport) {
        return null;
      }

      const applied = [
        runtimeExport.details.referenceCleanups > 0 ? `${runtimeExport.details.referenceCleanups} broken or chained references cleaned` : null,
        runtimeExport.details.authoringCleanup > 0 ? `${runtimeExport.details.authoringCleanup} authoring metadata items stripped` : null,
      ].filter((value): value is string => Boolean(value));

      return {
        action: 'download' as const,
        format: 'svg' as const,
        variant,
        fileName: nextFileName,
        applied: applied.length > 0 ? applied : ['No runtime-preserving cleanup was applied.'],
        remaining: analysis?.workflowReadiness.runtimeSvg.blockers ?? [],
      };
    }

    if (!normalizedExport) {
      return null;
    }

    const applied = [
      normalizedExport.details.styleRules > 0 ? `${normalizedExport.details.styleRules} style rules inlined` : null,
      normalizedExport.details.textPaths > 0 ? `${normalizedExport.details.textPaths} text elements converted to paths` : null,
      normalizedExport.details.shapes > 0 ? `${normalizedExport.details.shapes} shapes converted to paths` : null,
      normalizedExport.details.strokeOutlines > 0 ? `${normalizedExport.details.strokeOutlines} stroke-driven nodes outlined` : null,
      normalizedExport.details.pathCleanups > 0 ? `${normalizedExport.details.pathCleanups} paths cleaned` : null,
      normalizedExport.details.directTransforms > 0 ? `${normalizedExport.details.directTransforms} direct transforms baked` : null,
      normalizedExport.details.containerTransforms > 0 ? `${normalizedExport.details.containerTransforms} container transforms baked` : null,
      normalizedExport.details.useExpansions > 0 ? `${normalizedExport.details.useExpansions} use references expanded` : null,
      normalizedExport.details.authoringCleanup > 0 ? `${normalizedExport.details.authoringCleanup} authoring metadata items stripped` : null,
      normalizedExport.details.referenceCleanups > 0 ? `${normalizedExport.details.referenceCleanups} broken or chained references cleaned` : null,
    ].filter((value): value is string => Boolean(value));
    const remaining = [...(analysis?.workflowReadiness.geometrySafe.blockers ?? [])];

    if (variant === 'blender') {
      remaining.unshift('Text, raster images, and effects still need manual or future Blender-specific cleanup if present.');
    }

    return {
      action: 'download' as const,
      format: 'svg' as const,
      variant,
      fileName: nextFileName,
      applied: applied.length > 0 ? applied : ['No geometry-safe repairs were applied.'],
      remaining,
    };
  }

  async function copyCurrentSvg() {
    await copyExportVariant('current');
  }

  function downloadExportVariant(variant: ExportVariant) {
    if (variant === 'current') {
      const nextFileName = buildExportFileName(fileName, 'current');
      downloadSvgSource(source, nextFileName);
      setExportReport({
        action: 'download',
        format: 'svg',
        variant: 'current',
        fileName: nextFileName,
        applied: ['No automatic repairs applied.'],
        remaining: analysis?.exportReadiness.blockers ?? [],
      });
      setRepairMessage(`Downloaded ${nextFileName}.`);
      return;
    }

    const exportDetails = buildPresetExportReport(variant);
    const presetSource = getExportVariantSource(variant);
    const changeSummary = getExportVariantChangeSummary(variant);
    if (!exportDetails || !presetSource) {
      setRepairMessage('Unable to build a preset export from invalid SVG markup.');
      return;
    }

    downloadSvgSource(presetSource, exportDetails.fileName);
    setExportReport(exportDetails);
    const blockedSummary = exportDetails.remaining.length > 0 ? ` ${exportDetails.remaining.join(' and ')} remain.` : '';
    const changeCopy = changeSummary ? ` with ${changeSummary.count} ${changeSummary.label} applied.` : '.';
    setRepairMessage(`Downloaded ${exportDetails.fileName}${changeCopy}${blockedSummary}`);
  }

  async function copyExportVariant(variant: ExportVariant) {
    if (variant === 'current') {
      const nextFileName = buildExportFileName(fileName, 'current');

      try {
        await copySvgSourceToClipboard(source);
        setExportReport({
          action: 'copy',
          format: 'svg',
          variant: 'current',
          fileName: nextFileName,
          applied: ['No automatic repairs applied.'],
          remaining: analysis?.exportReadiness.blockers ?? [],
        });
        setRepairMessage(`Copied ${nextFileName} to the clipboard.`);
      } catch (error) {
        setRepairMessage(error instanceof Error ? error.message : 'Unable to copy SVG content to the clipboard.');
      }
      return;
    }

    const exportDetails = buildPresetExportReport(variant);
    const presetSource = getExportVariantSource(variant);
    const changeSummary = getExportVariantChangeSummary(variant);
    if (!exportDetails || !presetSource) {
      setRepairMessage('Unable to build a preset clipboard export from invalid SVG markup.');
      return;
    }

    try {
      await copySvgSourceToClipboard(presetSource);
      setExportReport({
        ...exportDetails,
        action: 'copy',
        format: 'svg',
      });
      const blockedSummary = exportDetails.remaining.length > 0 ? ` ${exportDetails.remaining.join(' and ')} remain.` : '';
      const changeCopy = changeSummary ? ` with ${changeSummary.count} ${changeSummary.label} applied.` : '.';
      setRepairMessage(`Copied ${exportDetails.fileName} to the clipboard${changeCopy}${blockedSummary}`);
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to copy preset SVG content to the clipboard.');
    }
  }

  async function downloadPngSnapshotVariant(variant: ExportVariant) {
    const exportSource = getExportVariantSource(variant);
    if (!exportSource) {
      setRepairMessage('Unable to build a PNG snapshot from invalid SVG markup.');
      return;
    }

    const nextFileName = buildPngExportFileName(fileName, variant);
    const baseReport = variant === 'current'
      ? {
          applied: ['No automatic repairs applied.'],
          remaining: [] as string[],
        }
      : buildPresetExportReport(variant);
    if (!baseReport) {
      setRepairMessage('Unable to build a PNG snapshot from invalid SVG markup.');
      return;
    }

    try {
      const snapshot = await createPngSnapshot(exportSource);
      downloadBlob(snapshot.blob, nextFileName);
      setExportReport({
        action: 'download',
        format: 'png',
        variant,
        fileName: nextFileName,
        applied: [...baseReport.applied, `Rasterized to a ${snapshot.width} x ${snapshot.height} PNG snapshot.`],
        remaining: [],
      });
      const changeSummary = getExportVariantChangeSummary(variant);
      const changeCopy = changeSummary && changeSummary.count > 0 ? ` with ${changeSummary.count} ${changeSummary.label} applied` : '';
      setRepairMessage(`Downloaded ${nextFileName} as a ${snapshot.width} x ${snapshot.height} PNG snapshot${changeCopy}.`);
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to render a PNG snapshot in this browser context.');
    }
  }

  function downloadSelectedPreset() {
    downloadExportVariant(selectedExportPreset);
  }

  async function copySelectedPreset() {
    await copyExportVariant(selectedExportPreset);
  }

  function closePreviewWorkflowMenu(target: EventTarget | null) {
    const menu = target instanceof HTMLElement ? target.closest('details') : null;
    if (menu instanceof HTMLDetailsElement) {
      menu.open = false;
    }
  }

  function handlePreviewWorkflowAction(event: MouseEvent<HTMLButtonElement>, action: () => void | Promise<void>) {
    void action();
    closePreviewWorkflowMenu(event.currentTarget);
  }

  function closeResourcesModal() {
    setIsResourcesOpen(false);
  }

  function closeSettingsModal() {
    setIsSettingsOpen(false);
  }

  function selectSection(section: WorkspaceSection) {
    setActiveSection(section);
    setInspectorTab(defaultInspectorTabBySection[section]);
  }

  function inspectSelectedNode(nodeId: string, options?: { appendSelection?: boolean; syncPreviewSelection?: boolean }) {
    setSelectedNodeId(nodeId);
    setInspectorTab('selection');

    if (options?.syncPreviewSelection ?? true) {
      setSelectedPreviewNodeIds((current) => {
        if (!options?.appendSelection) {
          return [nodeId];
        }

        return current.includes(nodeId)
          ? current.filter((currentNodeId) => currentNodeId !== nodeId)
          : [...current, nodeId];
      });
    }
  }

  function handlePreviewNodeSelection(nodeId: string, append: boolean) {
    inspectSelectedNode(nodeId, { appendSelection: append, syncPreviewSelection: true });
    if (analysis?.nodesById[nodeId]) {
      setActiveAnimationTargetPath(analysis.nodesById[nodeId].path);
      setActiveAnimationStackIndex(null);
      setDraggedAnimationStackIndex(null);
      setAnimationStackDropPosition(null);
    }
  }

  function updateSelectionAppearanceVisibility(stateId: SelectionAppearanceStateId, visible: boolean) {
    setSelectionAppearanceSettings((current) => ({
      ...current,
      [stateId]: {
        ...current[stateId],
        visible,
      },
    }));
  }

  function updateSelectionAppearanceIntensity(stateId: SelectionAppearanceStateId, intensity: SelectionAppearanceIntensity) {
    setSelectionAppearanceSettings((current) => ({
      ...current,
      [stateId]: {
        ...current[stateId],
        intensity,
      },
    }));
  }

  function exportSelectionAppearancePreset() {
    const snapshot: SelectionAppearanceSnapshot = {
      preset: selectionAppearancePreset,
      settings: selectionAppearanceSettings,
    };

    setSelectionAppearanceTransferText(JSON.stringify(snapshot, null, 2));
    setSelectionAppearanceMessage('Loaded the current selection appearance settings into the preset JSON field.');
  }

  function resetSelectionAppearancePreset() {
    const snapshot = createDefaultSelectionAppearanceSnapshot();
    setSelectionAppearancePreset(snapshot.preset);
    setSelectionAppearanceSettings(snapshot.settings);
    setSelectionAppearanceTransferText(JSON.stringify(snapshot, null, 2));
    setSelectionAppearanceMessage('Reset selection appearance to the default Studio preset.');
  }

  function importSelectionAppearancePreset() {
    try {
      const snapshot = parseSelectionAppearanceSnapshot(JSON.parse(selectionAppearanceTransferText));
      setSelectionAppearancePreset(snapshot.preset);
      setSelectionAppearanceSettings(snapshot.settings);
      setSelectionAppearanceTransferText(JSON.stringify(snapshot, null, 2));
      const importedPreset = selectionAppearancePresets.find((preset) => preset.id === snapshot.preset) ?? selectionAppearancePresets[0];
      setSelectionAppearanceMessage(`Imported the ${importedPreset.label} selection appearance preset.`);
    } catch {
      setSelectionAppearanceMessage('Unable to import selection appearance JSON.');
    }
  }

  function getInspectorTabButtonId(tab: InspectorTab) {
    return `${inspectorTabsId}-${tab}-tab`;
  }

  function getInspectorTabPanelId() {
    return `${inspectorTabsId}-panel`;
  }

  function getSelectionFacetTabButtonId(facet: SelectionFacet) {
    return `${selectionFacetTabsId}-${facet}-tab`;
  }

  function getSelectionFacetTabPanelId() {
    return `${selectionFacetTabsId}-panel`;
  }

  function focusSelectionFacetTab(facet: SelectionFacet) {
    const tabButton = document.getElementById(getSelectionFacetTabButtonId(facet));
    if (tabButton instanceof HTMLButtonElement) {
      tabButton.focus();
    }
  }

  function handleSelectionFacetKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentFacet: SelectionFacet) {
    const facets = Object.keys(selectionFacetLabels) as SelectionFacet[];
    const currentIndex = facets.indexOf(currentFacet);
    if (currentIndex === -1) {
      return;
    }

    let nextFacet: SelectionFacet | null = null;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextFacet = facets[(currentIndex + 1) % facets.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextFacet = facets[(currentIndex - 1 + facets.length) % facets.length];
        break;
      case 'Home':
        nextFacet = facets[0];
        break;
      case 'End':
        nextFacet = facets[facets.length - 1];
        break;
      default:
        return;
    }

    event.preventDefault();
    setSelectionFacet(nextFacet);
    focusSelectionFacetTab(nextFacet);
  }

  function focusInspectorTab(tab: InspectorTab) {
    const tabButton = document.getElementById(getInspectorTabButtonId(tab));
    if (tabButton instanceof HTMLButtonElement) {
      tabButton.focus();
    }
  }

  function handleInspectorTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentTab: InspectorTab) {
    const currentIndex = availableInspectorTabs.indexOf(currentTab);
    if (currentIndex === -1) {
      return;
    }

    let nextTab: InspectorTab | null = null;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextTab = availableInspectorTabs[(currentIndex + 1) % availableInspectorTabs.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextTab = availableInspectorTabs[(currentIndex - 1 + availableInspectorTabs.length) % availableInspectorTabs.length];
        break;
      case 'Home':
        nextTab = availableInspectorTabs[0];
        break;
      case 'End':
        nextTab = availableInspectorTabs[availableInspectorTabs.length - 1];
        break;
      default:
        return;
    }

    event.preventDefault();
    setInspectorTab(nextTab);
    focusInspectorTab(nextTab);
  }

  function getPreviewTabButtonId(tab: PreviewTab) {
    return `${previewTabsId}-${tab}-tab`;
  }

  function getPreviewTabPanelId() {
    return `${previewTabsId}-panel`;
  }

  function focusPreviewTab(tab: PreviewTab) {
    const tabButton = document.getElementById(getPreviewTabButtonId(tab));
    if (tabButton instanceof HTMLButtonElement) {
      tabButton.focus();
    }
  }

  function handlePreviewTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentTab: PreviewTab) {
    const tabs: PreviewTab[] = ['preview', 'source'];
    const currentIndex = tabs.indexOf(currentTab);
    if (currentIndex === -1) {
      return;
    }

    let nextTab: PreviewTab | null = null;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextTab = tabs[(currentIndex + 1) % tabs.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
        break;
      case 'Home':
        nextTab = tabs[0];
        break;
      case 'End':
        nextTab = tabs[tabs.length - 1];
        break;
      default:
        return;
    }

    event.preventDefault();
    setPreviewTab(nextTab);
    focusPreviewTab(nextTab);
  }

  function getExportPresetTabButtonId(variant: ExportVariant) {
    return `${exportPresetTabsId}-${variant}-tab`;
  }

  function getExportPresetPanelId() {
    return `${exportPresetTabsId}-panel`;
  }

  function focusExportPresetTab(variant: ExportVariant) {
    const tabButton = document.getElementById(getExportPresetTabButtonId(variant));
    if (tabButton instanceof HTMLButtonElement) {
      tabButton.focus();
    }
  }

  function handleExportPresetKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentPreset: ExportVariant) {
    const presets = exportPresetCards.map((preset) => preset.id);
    const currentIndex = presets.indexOf(currentPreset);
    if (currentIndex === -1) {
      return;
    }

    let nextPreset: ExportVariant | null = null;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextPreset = presets[(currentIndex + 1) % presets.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextPreset = presets[(currentIndex - 1 + presets.length) % presets.length];
        break;
      case 'Home':
        nextPreset = presets[0];
        break;
      case 'End':
        nextPreset = presets[presets.length - 1];
        break;
      default:
        return;
    }

    event.preventDefault();
    setSelectedExportPreset(nextPreset);
    focusExportPresetTab(nextPreset);
  }

  function resolvePreviewNodeId(target: EventTarget | null, clientX: number, clientY: number, allowCycle: boolean) {
    const previewFrame = previewFrameRef.current;
    const targetElement = target instanceof Element ? target : null;
    const directNodeId = targetElement?.closest('[data-svg-node-id]')?.getAttribute('data-svg-node-id');
    const previewDocument = previewFrame?.ownerDocument;

    const stackedNodeIds = typeof previewDocument?.elementsFromPoint === 'function'
      ? Array.from(new Set(previewDocument.elementsFromPoint(clientX, clientY)
        .map((element) => element.closest('[data-svg-node-id]')?.getAttribute('data-svg-node-id'))
        .filter((nodeId): nodeId is string => Boolean(nodeId))))
      : [];

    if (directNodeId && !stackedNodeIds.includes(directNodeId)) {
      stackedNodeIds.unshift(directNodeId);
    }

    if (stackedNodeIds.length === 0) {
      const fallbackTarget = previewDocument?.elementFromPoint(clientX, clientY);
      const fallbackNodeId = fallbackTarget?.closest('[data-svg-node-id]')?.getAttribute('data-svg-node-id') ?? null;
      return fallbackNodeId;
    }

    const filteredNodeIds = stackedNodeIds.length > 1 && analysis
      ? stackedNodeIds.filter((nodeId) => nodeId !== analysis.rootNodeId)
      : stackedNodeIds;
    const candidateNodeIds = filteredNodeIds.length > 0 ? filteredNodeIds : stackedNodeIds;

    if (candidateNodeIds.length <= 1 || !allowCycle) {
      previewHitCycleRef.current = candidateNodeIds.length === 1
        ? {
            clientX,
            clientY,
            nodeIds: candidateNodeIds,
            nextIndex: 0,
          }
        : null;
      return candidateNodeIds[0] ?? null;
    }

    const previousHitCycle = previewHitCycleRef.current;
    const canAdvanceCycle = previousHitCycle
      && Math.abs(previousHitCycle.clientX - clientX) <= 6
      && Math.abs(previousHitCycle.clientY - clientY) <= 6
      && previousHitCycle.nodeIds.length === candidateNodeIds.length
      && previousHitCycle.nodeIds.every((nodeId, index) => nodeId === candidateNodeIds[index]);
    const currentSelectedIndex = selectedNodeId ? candidateNodeIds.indexOf(selectedNodeId) : -1;
    const nextIndex = canAdvanceCycle
      ? currentSelectedIndex >= 0
        ? (currentSelectedIndex + 1) % candidateNodeIds.length
        : previousHitCycle.nextIndex % candidateNodeIds.length
      : 0;

    previewHitCycleRef.current = {
      clientX,
      clientY,
      nodeIds: candidateNodeIds,
      nextIndex: (nextIndex + 1) % candidateNodeIds.length,
    };

    return candidateNodeIds[nextIndex] ?? null;
  }

  function handlePreviewPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!isPreviewInteractive || event.button !== 0) {
      return;
    }

    previewPointerRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      distance: 0,
    };
    suppressPreviewClickRef.current = false;
    setIsPanningPreview(true);
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function handlePreviewPointerMove(event: PointerEvent<HTMLDivElement>) {
    const currentPointer = previewPointerRef.current;
    if (!currentPointer || currentPointer.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - currentPointer.lastX;
    const deltaY = event.clientY - currentPointer.lastY;
    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    const distance = currentPointer.distance + Math.abs(deltaX) + Math.abs(deltaY);
    previewPointerRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      distance,
    };

    if (distance > 4) {
      suppressPreviewClickRef.current = true;
    }

    panPreview(deltaX, deltaY);
  }

  function handlePreviewPointerUp(event: PointerEvent<HTMLDivElement>) {
    const currentPointer = previewPointerRef.current;
    if (!currentPointer || currentPointer.pointerId !== event.pointerId) {
      return;
    }

    const shouldSuppressClick = suppressPreviewClickRef.current;
    stopPreviewPan();
    if (typeof event.currentTarget.hasPointerCapture === 'function' && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (shouldSuppressClick) {
      suppressPreviewClickRef.current = false;
      return;
    }

    const appendSelection = event.shiftKey || event.ctrlKey || event.metaKey;
    const nodeId = resolvePreviewNodeId(event.target, event.clientX, event.clientY, !appendSelection);
    if (nodeId) {
      handlePreviewNodeSelection(nodeId, appendSelection);
    }
  }

  function handlePreviewWheel(event: WheelEvent<HTMLDivElement>) {
    if (!isPreviewInteractive) {
      return;
    }

    event.preventDefault();
    zoomPreview(event.deltaY < 0 ? PREVIEW_SCALE_STEP : -PREVIEW_SCALE_STEP);
  }

  function setAnimationPreset(presetId: AnimationPresetId) {
    setAnimationDraft((current) => createAnimationDraft(presetId, current));
    setAnimationMessage(null);
  }

  function updateAnimationNumberField(field: keyof Pick<AnimationDraft, 'durationSeconds' | 'delaySeconds' | 'repeatCount' | 'startOpacity' | 'midOpacity' | 'endOpacity' | 'motionDistance' | 'turnDegrees' | 'startScale' | 'midScale' | 'endScale' | 'orbitRadiusX' | 'orbitRadiusY' | 'morphAmount'>, value: number) {
    setAnimationDraft((current) => ({
      ...current,
      [field]: Number.isFinite(value) ? value : 0,
    }));
    setAnimationMessage(null);
  }

  function updateAnimationTextField(field: keyof Pick<AnimationDraft, 'colorFrom' | 'colorMid' | 'colorTo'>, value: string) {
    setAnimationDraft((current) => ({
      ...current,
      [field]: value,
    }));
    setAnimationMessage(null);
  }

  function updateAnimationSelectField(
    field: keyof Pick<AnimationDraft, 'startMode' | 'easing' | 'motionDirection' | 'turnDirection' | 'rotateMode' | 'repeatMode' | 'fillMode' | 'morphTarget'>,
    value: AnimationStartMode | AnimationEasing | AnimationMotionDirection | AnimationTurnDirection | AnimationRotateMode | AnimationMorphTarget | AnimationDraft['repeatMode'] | AnimationDraft['fillMode'],
  ) {
    setAnimationDraft((current) => ({
      ...current,
      [field]: value,
    }));
    setAnimationMessage(null);
  }

  function updateActiveTargetOverride(field: keyof Partial<AnimationDraft>, value: Partial<AnimationDraft>[keyof AnimationDraft]) {
    if (!activeAnimationTargetPath) {
      return;
    }

    setTargetAnimationOverrides((current) => ({
      ...current,
      [activeAnimationTargetPath]: {
        ...(current[activeAnimationTargetPath] ?? {}),
        [field]: value,
      },
    }));
    setAnimationMessage(null);
  }

  function clearActiveTargetOverride() {
    if (!activeAnimationTargetPath) {
      return;
    }

    setTargetAnimationOverrides((current) => {
      const nextOverrides = { ...current };
      delete nextOverrides[activeAnimationTargetPath];
      return nextOverrides;
    });
    setAnimationMessage(null);
  }

  function getEffectiveAnimationDraft(path: string) {
    return createAnimationDraft(animationDraft.presetId, {
      ...animationDraft,
      ...(targetAnimationOverrides[path] ?? {}),
    });
  }

  function loadAnimationIntoEditor(path: string, animationIndex: number, messageOverride?: string) {
    const animationSummary = listAnimationsForPath(source, path)[animationIndex] ?? null;
    if (!animationSummary) {
      setAnimationMessage('The selected animation could not be resolved from the current SVG source.');
      return;
    }

    const inferredDraft = inferAnimationDraftForPath(source, path, animationIndex);
    const node = nodesByPath?.get(path);

    setActiveAnimationTargetPath(path);
    setActiveAnimationStackIndex(animationIndex);
    setDraggedAnimationStackIndex(null);
    setAnimationStackDropPosition(null);
    if (node) {
      inspectSelectedNode(node.id, { syncPreviewSelection: false });
    }

    if (!inferredDraft) {
      setAnimationMessage('The selected animation can be inspected, but it cannot be edited with the current workbench presets.');
      return;
    }

    setAnimationDraft(inferredDraft);
    setAnimationReplaceMode(animationSummary.isWorkbenchAuthored ? 'workbench' : 'all');
    setAnimationStackMode('replace-selected');
    setAnimationMessage(messageOverride ?? `Loaded ${animationSummary.label.toLowerCase()} from stack item ${animationIndex + 1} for editing.`);
  }

  function loadSelectedNodeAnimationIntoEditor() {
    if (!selectedNode) {
      return;
    }

    const selectedAnimationIndex = selectedNode.path === activeAnimationTargetPath && activeAnimationStackIndex !== null
      ? activeAnimationStackIndex
      : 0;
    if (listAnimationsForPath(source, selectedNode.path).length === 0) {
      setAnimationMessage('No editable animation settings were found on the selected element.');
      return;
    }

    loadAnimationIntoEditor(selectedNode.path, selectedAnimationIndex, 'Loaded the selected element animation into the editor for migration or reapply.');
    setAnimationStackMode('replace-target');
  }

  function handleAnimationStackDragStart(event: DragEvent<HTMLElement>, animationIndex: number) {
    const animationSummary = activeAnimationStack[animationIndex] ?? null;
    if (!animationSummary) {
      event.preventDefault();
      return;
    }

    if (!animationSummary.isWorkbenchAuthored && animationReplaceMode !== 'all') {
      event.preventDefault();
      setAnimationMessage('Switch replace mode to all before reordering native animation stack items.');
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${animationIndex}`);
    setDraggedAnimationStackIndex(animationIndex);
    setAnimationStackDropPosition(animationIndex);
    setAnimationMessage(null);
  }

  function handleAnimationStackDragEnd() {
    setDraggedAnimationStackIndex(null);
    setAnimationStackDropPosition(null);
  }

  function handleAnimationStackDragOver(event: DragEvent<HTMLElement>, dropPosition: number) {
    if (draggedAnimationStackIndex === null) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setAnimationStackDropPosition(dropPosition);
  }

  function handleAnimationStackDrop(dropPosition: number) {
    if (draggedAnimationStackIndex === null || !activeAnimationTargetPath) {
      return;
    }

    const fromIndex = draggedAnimationStackIndex;
    const nextActiveIndex = getAnimationStackIndexAfterMove(fromIndex, dropPosition);
    const movedAnimation = activeAnimationStack[fromIndex] ?? null;
    setDraggedAnimationStackIndex(null);
    setAnimationStackDropPosition(null);

    try {
      const result = reorderAnimationInSource(source, activeAnimationTargetPath, fromIndex, dropPosition, animationReplaceMode);
      if (result.skippedPaths.length > 0) {
        setAnimationMessage('The selected animation stack item could not be reordered with the current replace mode.');
        return;
      }

      if (result.appliedCount === 0) {
        setAnimationMessage('The animation stack already matches that order.');
        return;
      }

      commitRepairSource(result.source, 'Reordered the animation stack for the active target.');
      setActiveAnimationStackIndex(nextActiveIndex);
      setAnimationStackMode('replace-selected');
      setAnimationMessage(`Moved ${movedAnimation?.label.toLowerCase() ?? 'the animation'} to stack position ${nextActiveIndex + 1}.`);
    } catch (error) {
      setAnimationMessage(error instanceof Error ? error.message : 'Unable to reorder the animation stack.');
    }
  }

  function deleteAnimationStackItem(animationIndex: number) {
    if (!activeAnimationTargetPath) {
      return;
    }

    const animationSummary = activeAnimationStack[animationIndex] ?? null;
    if (!animationSummary) {
      setAnimationMessage('The selected animation stack item could not be resolved from the current SVG source.');
      return;
    }

    try {
      const result = removeAnimationAtIndexFromSource(source, activeAnimationTargetPath, animationIndex, animationReplaceMode);
      if (result.skippedPaths.length > 0) {
        setAnimationMessage('The selected animation stack item could not be removed with the current replace mode.');
        return;
      }

      const remainingStack = listAnimationsForPath(result.source, activeAnimationTargetPath);
      const nextActiveIndex = remainingStack.length > 0 ? Math.min(animationIndex, remainingStack.length - 1) : null;
      const nextSummary = nextActiveIndex !== null ? remainingStack[nextActiveIndex] ?? null : null;

      commitRepairSource(result.source, `Removed ${animationSummary.label.toLowerCase()} from the active animation stack.`);
      setActiveAnimationStackIndex(nextActiveIndex);
      setDraggedAnimationStackIndex(null);
      setAnimationStackDropPosition(null);

      if (nextSummary) {
        const inferredDraft = nextActiveIndex !== null
          ? inferAnimationDraftForPath(result.source, activeAnimationTargetPath, nextActiveIndex)
          : null;
        if (inferredDraft) {
          setAnimationDraft(inferredDraft);
        }
        setAnimationReplaceMode(nextSummary.isWorkbenchAuthored ? 'workbench' : 'all');
        setAnimationStackMode('replace-selected');
      } else {
        setAnimationStackMode('replace-target');
      }

      setAnimationMessage(`Deleted stack item ${animationIndex + 1}: ${animationSummary.label.toLowerCase()}.`);
    } catch (error) {
      setAnimationMessage(error instanceof Error ? error.message : 'Unable to delete the selected animation stack item.');
    }
  }

  function getPreviewSvgElement() {
    const previewSvg = previewFrameRef.current?.querySelector('svg');
    return previewSvg instanceof SVGSVGElement ? previewSvg : null;
  }

  function pausePreviewTimeline() {
    const previewSvg = getPreviewSvgElement() as (SVGSVGElement & { pauseAnimations?: () => void; getCurrentTime?: () => number }) | null;
    previewSvg?.pauseAnimations?.();
    if (previewSvg?.getCurrentTime) {
      setPreviewTimelineSeconds(Number(previewSvg.getCurrentTime().toFixed(2)));
    }
    setIsPreviewTimelinePlaying(false);
  }

  function playPreviewTimeline() {
    const previewSvg = getPreviewSvgElement() as (SVGSVGElement & { unpauseAnimations?: () => void }) | null;
    previewSvg?.unpauseAnimations?.();
    setIsPreviewTimelinePlaying(true);
  }

  function restartPreviewTimeline() {
    const previewSvg = getPreviewSvgElement() as (SVGSVGElement & { setCurrentTime?: (seconds: number) => void; unpauseAnimations?: () => void }) | null;
    previewSvg?.setCurrentTime?.(0);
    previewSvg?.unpauseAnimations?.();
    setPreviewTimelineSeconds(0);
    setIsPreviewTimelinePlaying(true);
  }

  function scrubPreviewTimeline(nextSeconds: number) {
    const previewSvg = getPreviewSvgElement() as (SVGSVGElement & { setCurrentTime?: (seconds: number) => void; pauseAnimations?: () => void }) | null;
    previewSvg?.pauseAnimations?.();
    previewSvg?.setCurrentTime?.(nextSeconds);
    setPreviewTimelineSeconds(nextSeconds);
    setIsPreviewTimelinePlaying(false);
  }

  function applyAnimationToTargets() {
    if (animationTargetPaths.length === 0) {
      setAnimationMessage('Select at least one preview element to animate.');
      return;
    }

    if (animationStackMode === 'replace-selected' && activeAnimationStackIndex === null) {
      setAnimationMessage('Select an animation stack item before editing it in place.');
      return;
    }

    try {
      const result = applyAnimationDraftsToSource(
        source,
        animationTargetPaths.map((path) => ({ path, draft: getEffectiveAnimationDraft(path) })),
        {
          replaceMode: animationReplaceMode,
          stackMode: animationStackMode,
          targetAnimationIndex: animationStackMode === 'replace-selected' ? activeAnimationStackIndex : null,
        },
      );
      const skippedCount = result.skippedPaths.length;
      const actionLabel = animationStackMode === 'append'
        ? 'Appended'
        : animationStackMode === 'prepend'
          ? 'Prepended'
          : animationStackMode === 'replace-selected'
            ? 'Updated'
            : 'Applied';
      commitRepairSource(result.source, `${actionLabel} ${animationPreset.label.toLowerCase()} across ${result.appliedCount} animation target${result.appliedCount === 1 ? '' : 's'}.`);
      setAnimationMessage(
        skippedCount > 0
          ? `${actionLabel} ${animationPreset.label.toLowerCase()} to ${result.appliedCount} target${result.appliedCount === 1 ? '' : 's'} and skipped ${skippedCount} unsupported selection${skippedCount === 1 ? '' : 's'}.`
          : `${actionLabel} ${animationPreset.label.toLowerCase()} to ${result.appliedCount} target${result.appliedCount === 1 ? '' : 's'} and refreshed the live preview.`,
      );
    } catch (error) {
      setAnimationMessage(error instanceof Error ? error.message : 'Unable to apply the selected animation.');
    }
  }

  function clearWorkbenchAnimations() {
    if (animationTargetPaths.length === 0) {
      setAnimationMessage('Select at least one target before removing authored animations.');
      return;
    }

    try {
      const result = removeWorkbenchAnimationsFromSource(source, animationTargetPaths, animationReplaceMode);
      commitRepairSource(result.source, result.removedCount > 0 ? `Removed ${result.removedCount} workbench animation node${result.removedCount === 1 ? '' : 's'}.` : 'No workbench-authored animations were found on the selected targets.');
      setActiveAnimationStackIndex(null);
      setDraggedAnimationStackIndex(null);
      setAnimationStackDropPosition(null);
      setAnimationStackMode('replace-target');
      setAnimationMessage(
        result.removedCount > 0
          ? `Removed ${result.removedCount} workbench animation node${result.removedCount === 1 ? '' : 's'} from the current targets.`
          : 'No workbench-authored animations were found on the current targets.',
      );
    } catch (error) {
      setAnimationMessage(error instanceof Error ? error.message : 'Unable to remove authored animations.');
    }
  }

  function updateInteractionDraftField(field: keyof ReturnType<typeof createInteractionDraft>, value: string) {
    setInteractionDraft((current) => ({
      ...current,
      [field]: value,
    }));
    setInteractionMessage(null);
  }

  function applyInteractionPreset(presetId: InteractionBehaviorPresetId) {
    setInteractionDraft((current) => applyInteractionBehaviorPreset(current, presetId));
    setInteractionMessage(`Loaded the ${interactionBehaviorPresets.find((preset) => preset.id === presetId)?.label.toLowerCase() ?? 'interaction'} preset into the editor.`);
  }

  function reloadInteractionDraftFromSelection() {
    setInteractionDraft(
      selectedNode
        ? inferInteractionDraftForPath(source, selectedNode.path) ?? createInteractionDraft(selectedNode.attributes)
        : createInteractionDraft(),
    );
    setInteractionMessage(selectedNode ? 'Reloaded interaction fields from the inspected element.' : 'Select an element to inspect its interaction fields.');
  }

  function applyInteractionToSelection() {
    if (authorableSelectionPaths.length === 0) {
      setInteractionMessage('Select at least one preview element to update interaction attributes.');
      return;
    }

    try {
      const result = applyInteractionDraftToSource(source, authorableSelectionPaths, interactionDraft);
      commitRepairSource(
        result.source,
        result.updatedCount > 0
          ? `Updated interaction attributes on ${result.updatedCount} selected element${result.updatedCount === 1 ? '' : 's'}.`
          : 'The selected interaction attributes already match the current selection.',
      );
      setInteractionMessage(
        result.skippedPaths.length > 0
          ? `Updated ${result.updatedCount} selected element${result.updatedCount === 1 ? '' : 's'} and skipped ${result.skippedPaths.length} unresolved selection${result.skippedPaths.length === 1 ? '' : 's'}.`
          : `Applied interaction fields to ${result.updatedCount} selected element${result.updatedCount === 1 ? '' : 's'}.`,
      );
    } catch (error) {
      setInteractionMessage(error instanceof Error ? error.message : 'Unable to update interaction attributes.');
    }
  }

  function updateStyleDraftField(field: keyof StyleDraft, value: string) {
    setStyleDraft((current) => ({ ...current, [field]: value }));
    setStyleMessage(null);
  }

  function reloadStyleDraftFromSelection() {
    setStyleDraft(
      selectedNode
        ? inferStyleDraftForPath(source, selectedNode.path) ?? createStyleDraft(selectedNode.attributes)
        : createStyleDraft(),
    );
    setStyleMessage(selectedNode ? 'Reloaded style fields from the inspected element.' : 'Select an element to inspect its style properties.');
  }

  function applyStyleToSelection() {
    if (authorableSelectionPaths.length === 0) {
      setStyleMessage('Select at least one preview element to update style attributes.');
      return;
    }

    try {
      const result = applyStyleDraftToSource(source, authorableSelectionPaths, styleDraft);
      commitRepairSource(
        result.source,
        result.updatedCount > 0
          ? `Updated style attributes on ${result.updatedCount} selected element${result.updatedCount === 1 ? '' : 's'}.`
          : 'The selected style attributes already match the current selection.',
      );
      setStyleMessage(
        result.skippedPaths.length > 0
          ? `Updated ${result.updatedCount} selected element${result.updatedCount === 1 ? '' : 's'} and skipped ${result.skippedPaths.length} unresolved selection${result.skippedPaths.length === 1 ? '' : 's'}.`
          : `Applied style properties to ${result.updatedCount} selected element${result.updatedCount === 1 ? '' : 's'}.`,
      );
    } catch (error) {
      setStyleMessage(error instanceof Error ? error.message : 'Unable to update style attributes.');
    }
  }

  function toggleSelectedElementVisibility() {
    if (authorableSelectionPaths.length === 0) {
      setStyleMessage('Select at least one preview element to hide or unhide it.');
      return;
    }

    const shouldHide = !areAllSelectedElementsHidden;

    try {
      const result = setHiddenStateForPaths(source, authorableSelectionPaths, shouldHide);
      commitRepairSource(
        result.source,
        result.updatedCount > 0
          ? `${shouldHide ? 'Hid' : 'Unhid'} ${result.updatedCount} selected element${result.updatedCount === 1 ? '' : 's'}.`
          : `The selected elements were already ${shouldHide ? 'hidden' : 'visible'}.`,
      );
      setStyleMessage(
        result.skippedPaths.length > 0
          ? `${shouldHide ? 'Hid' : 'Unhid'} ${result.updatedCount} selected element${result.updatedCount === 1 ? '' : 's'} and skipped ${result.skippedPaths.length} unresolved selection${result.skippedPaths.length === 1 ? '' : 's'}.`
          : `${shouldHide ? 'Hidden' : 'Unhidden'} ${result.updatedCount} selected element${result.updatedCount === 1 ? '' : 's'}.`,
      );
    } catch (error) {
      setStyleMessage(error instanceof Error ? error.message : 'Unable to update selected element visibility.');
    }
  }

  function renderSelectionStyleSection() {
    return (
      <section className="focus-card section-card">
        <div className="section-header-inline" data-fit-container>
          <h3>Selection appearance</h3>
          <span className="status-label">{activeSelectionAppearance.label}</span>
        </div>
        <p className="section-copy">Adjust how selected, hovered, changed, and animation-targeted nodes read in the live preview.</p>
        <div className="selection-appearance-grid" role="list" aria-label="Selection highlight presets">
          {selectionAppearancePresets.map((preset) => (
            <button
              key={preset.id}
              className={`selection-appearance-card${selectionAppearancePreset === preset.id ? ' active' : ''}`}
              type="button"
              onClick={() => setSelectionAppearancePreset(preset.id)}
              aria-pressed={selectionAppearancePreset === preset.id}
            >
              <strong>{preset.label}</strong>
              <span>{preset.description}</span>
              <span className="selection-appearance-swatches" aria-hidden="true">
                <span className="selection-appearance-swatch" style={{ backgroundColor: preset.palette.selected }} />
                <span className="selection-appearance-swatch" style={{ backgroundColor: preset.palette.hovered }} />
                <span className="selection-appearance-swatch" style={{ backgroundColor: preset.palette.changed }} />
                <span className="selection-appearance-swatch" style={{ backgroundColor: preset.palette.targeted }} />
              </span>
            </button>
          ))}
        </div>
        <div className="selection-appearance-panel" data-selection-style={selectionAppearancePreset} style={selectionAppearanceStyle}>
          <p className="selection-subtitle">Highlight controls</p>
          <p className="selection-copy selection-appearance-copy">Saved in this browser and applied the next time you open the workbench.</p>
          <div className="selection-appearance-actions" role="toolbar" aria-label="Selection appearance preset actions">
            <button className="ghost-button" type="button" onClick={exportSelectionAppearancePreset}>
              Export preset JSON
            </button>
            <button className="ghost-button" type="button" onClick={importSelectionAppearancePreset} disabled={selectionAppearanceTransferText.trim().length === 0}>
              Import preset JSON
            </button>
            <button className="ghost-button" type="button" onClick={resetSelectionAppearancePreset}>
              Reset defaults
            </button>
          </div>
          <label className="selection-appearance-json-field">
            <span>Preset JSON</span>
            <textarea
              aria-label="Selection appearance preset JSON"
              value={selectionAppearanceTransferText}
              onChange={(event) => {
                setSelectionAppearanceTransferText(event.target.value);
                setSelectionAppearanceMessage(null);
              }}
              rows={8}
              spellCheck={false}
            />
          </label>
          {selectionAppearanceMessage ? <p className="selection-copy selection-appearance-copy">{selectionAppearanceMessage}</p> : null}
          <ul className="selection-appearance-legend">
            {selectionAppearanceLegend.map((item) => {
              const settings = selectionAppearanceSettings[item.id];

              return (
                <li key={item.id}>
                  <div className="selection-appearance-state-card">
                    <div className="selection-appearance-state-header">
                      <span className="selection-appearance-legend-swatch" data-selection-legend={item.id} aria-hidden="true" />
                      <strong>{item.label}</strong>
                    </div>
                    <p className="selection-appearance-state-copy">{item.description}</p>
                    <label className="selection-appearance-toggle">
                      <input
                        type="checkbox"
                        aria-label={`${item.label} highlight visible`}
                        checked={settings.visible}
                        onChange={(event) => updateSelectionAppearanceVisibility(item.id, event.target.checked)}
                      />
                      Show highlight
                    </label>
                    <label className="selection-appearance-field">
                      <span>Intensity</span>
                      <select
                        aria-label={`${item.label} highlight intensity`}
                        value={settings.intensity}
                        onChange={(event) => updateSelectionAppearanceIntensity(item.id, event.target.value as SelectionAppearanceIntensity)}
                        disabled={!settings.visible}
                      >
                        {selectionAppearanceIntensityOptions.map((option) => (
                          <option key={option} value={option}>
                            {option.charAt(0).toUpperCase() + option.slice(1)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    );
  }

  function renderAnimationSection() {
    return (
      <>
        <section className="status-card compact-card">
          <p className="status-label">Animation authoring</p>
          <strong>{animationTargetNodes.length} selected target{animationTargetNodes.length === 1 ? '' : 's'}</strong>
          <p>{analysis?.runtimeFeatures.animationElementCount ?? 0} animation nodes are currently present in the SVG.</p>
        </section>

        <section className="focus-card section-card animation-section-card">
          <div className="section-header-inline" data-fit-container>
            <h3>Selection targets</h3>
            <span className="status-label">Selection-driven</span>
          </div>
          <p className="section-copy">Select preview elements first, then tune the animation preset here. Hold Shift, Ctrl, or Cmd while clicking to build a multi-target selection.</p>
          <div className="animation-target-actions" role="toolbar" aria-label="Animation target actions">
            <button className="ghost-button" type="button" onClick={loadSelectedNodeAnimationIntoEditor} disabled={!selectedNode || selectedNodeAnimations.length === 0}>
              Load selected animation
            </button>
            <button className="ghost-button" type="button" onClick={() => setSelectedPreviewNodeIds(selectedNodeId ? [selectedNodeId] : [])} disabled={selectedPreviewNodeCount <= 1}>
              Keep only inspected element
            </button>
            <button className="ghost-button" type="button" onClick={() => setSelectedPreviewNodeIds([])} disabled={authorableSelectionPaths.length === 0}>
              Clear selection
            </button>
          </div>
          {animationTargetNodes.length > 0 ? (
            <ul className="animation-target-list interactive-list">
              {animationTargetNodes.map((node) => (
                <li key={node.path} data-fit-container>
                  <button className={`inline-list-button${activeAnimationTargetPath === node.path ? ' active-target' : ''}`} type="button" onClick={() => {
                    inspectSelectedNode(node.id);
                    setActiveAnimationTargetPath(node.path);
                    setActiveAnimationStackIndex(null);
                  }}>
                    <span className="selection-tag">{node.name}</span>
                    <strong>{getNodeListLabel(node)}</strong>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="selection-copy">No preview elements are selected for animation yet.</p>
          )}
        </section>

        <section className="focus-card section-card animation-section-card">
          <div className="section-header-inline" data-fit-container>
            <h3>Animation stack</h3>
            <span className="status-label">{activeAnimationTargetPath ? `${activeAnimationStack.length} item${activeAnimationStack.length === 1 ? '' : 's'}` : 'Select target'}</span>
          </div>
          <p className="section-copy">Select a stack item to edit it in place, or change the stack action before applying a new preset to prepend or append a new step.</p>
          <label className="animation-field animation-field-split">
            <span>Stack action</span>
            <select value={animationStackMode} onChange={(event) => setAnimationStackMode(event.target.value as AnimationStackMode)}>
              <option value="replace-target">Replace target animation stack</option>
              <option value="replace-selected">Edit selected stack item</option>
              <option value="append">Append new animation</option>
              <option value="prepend">Prepend new animation</option>
            </select>
          </label>
          {activeAnimationStackSummary ? (
            <p className="selection-copy">Editing stack item {activeAnimationStackSummary.index + 1}: {activeAnimationStackSummary.label}.</p>
          ) : (
            <p className="selection-copy">No stack item is selected yet. Append or prepend adds a new animation without replacing the current stack.</p>
          )}
          {activeAnimationTargetPath ? (
            activeAnimationStack.length > 0 ? (
              <ol className="animation-stack-list">
                {activeAnimationStack.map((animation) => (
                  <li key={`${activeAnimationTargetPath}-${animation.index}`} className="animation-stack-item">
                    <div
                      aria-label={`Drop animation before item ${animation.index + 1}`}
                      className={`animation-stack-dropzone${draggedAnimationStackIndex !== null && animationStackDropPosition === animation.index ? ' active-dropzone' : ''}`}
                      onDragOver={(event) => handleAnimationStackDragOver(event, animation.index)}
                      onDrop={() => handleAnimationStackDrop(animation.index)}
                    />
                    <div
                      aria-label={`Drag stack item ${animation.index + 1}: ${animation.label}`}
                      className={`animation-stack-row${draggedAnimationStackIndex === animation.index ? ' is-dragging-stack-item' : ''}`}
                      draggable={animation.isWorkbenchAuthored || animationReplaceMode === 'all'}
                      onDragStart={(event) => handleAnimationStackDragStart(event, animation.index)}
                      onDragEnd={handleAnimationStackDragEnd}
                    >
                      <button
                        className={`animation-stack-button${activeAnimationStackIndex === animation.index ? ' active-stack-item' : ''}`}
                        type="button"
                        onClick={() => loadAnimationIntoEditor(activeAnimationTargetPath, animation.index)}
                      >
                        <span className={`risk-badge ${animation.isWorkbenchAuthored ? 'info' : 'warning'}`}>
                          {animation.isWorkbenchAuthored ? 'workbench' : 'native'}
                        </span>
                        <span className="animation-stack-copy">
                          <strong>{animation.index + 1}. {animation.label}</strong>
                          <span>{animation.detail}</span>
                          <small>
                            {[
                              animation.duration ? animation.duration : null,
                              animation.begin ? `begins ${animation.begin}` : null,
                              animation.repeatCount ? `repeats ${animation.repeatCount}` : null,
                              animation.isEditable ? 'editable' : 'summary only',
                            ].filter(Boolean).join(' • ')}
                          </small>
                        </span>
                      </button>
                      <div className="animation-stack-item-actions">
                        <span className="animation-stack-drag-copy" aria-hidden="true">Drag</span>
                        <button
                          className="ghost-button inline-button animation-stack-delete-button"
                          type="button"
                          onClick={() => deleteAnimationStackItem(animation.index)}
                          disabled={!animation.isWorkbenchAuthored && animationReplaceMode !== 'all'}
                          aria-label={`Delete stack item ${animation.index + 1}`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
                <li className="animation-stack-item">
                  <div
                    aria-label="Drop animation at end of stack"
                    className={`animation-stack-dropzone end-dropzone${draggedAnimationStackIndex !== null && animationStackDropPosition === activeAnimationStack.length ? ' active-dropzone' : ''}`}
                    onDragOver={(event) => handleAnimationStackDragOver(event, activeAnimationStack.length)}
                    onDrop={() => handleAnimationStackDrop(activeAnimationStack.length)}
                  />
                </li>
              </ol>
            ) : (
              <p className="selection-copy">No direct animation children are attached to the active target yet.</p>
            )
          ) : (
            <p className="selection-copy">Select a target above to inspect and edit its animation stack.</p>
          )}
        </section>

        <section className="focus-card section-card animation-section-card">
          <div className="section-header-inline" data-fit-container>
            <h3>Animation preset</h3>
            <span className="status-label">{animationPreset.label}</span>
          </div>
          <label className="animation-field animation-field-split">
            <span>Preset</span>
            <select value={animationDraft.presetId} onChange={(event) => setAnimationPreset(event.target.value as AnimationPresetId)}>
              {animationPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <p className="selection-copy">{animationPreset.description}</p>
        </section>

        <section className="focus-card section-card animation-section-card">
          <div className="section-header-inline" data-fit-container>
            <h3>Animation details</h3>
            <span className="status-label">Timeline + motion</span>
          </div>
          <div className="animation-form-grid animation-form-grid-rows">
            <label className="animation-field animation-field-split">
              <span>Start when</span>
              <select value={animationDraft.startMode} onChange={(event) => updateAnimationSelectField('startMode', event.target.value as AnimationStartMode)}>
                <option value="load">On load</option>
                <option value="click">On click</option>
              </select>
            </label>
            <label className="animation-field animation-field-split">
              <span>Duration (s)</span>
              <input type="number" min="0.1" step="0.1" value={animationDraft.durationSeconds} onChange={(event) => updateAnimationNumberField('durationSeconds', Number(event.target.value))} />
            </label>
            <label className="animation-field animation-field-split">
              <span>Delay (s)</span>
              <input type="number" min="0" step="0.1" value={animationDraft.delaySeconds} onChange={(event) => updateAnimationNumberField('delaySeconds', Number(event.target.value))} />
            </label>
            <label className="animation-field animation-field-split">
              <span>Easing</span>
              <select value={animationDraft.easing} onChange={(event) => updateAnimationSelectField('easing', event.target.value as AnimationEasing)}>
                <option value="linear">Linear</option>
                <option value="ease-in">Ease in</option>
                <option value="ease-out">Ease out</option>
                <option value="ease-in-out">Ease in out</option>
              </select>
            </label>
            <label className="animation-field animation-field-split">
              <span>Repeat</span>
              <select value={animationDraft.repeatMode} onChange={(event) => updateAnimationSelectField('repeatMode', event.target.value === 'count' ? 'count' : 'indefinite')}>
                <option value="indefinite">Indefinite</option>
                <option value="count">Fixed count</option>
              </select>
            </label>
            <label className="animation-field animation-field-split">
              <span>Repeat count</span>
              <input type="number" min="1" step="1" value={animationDraft.repeatCount} onChange={(event) => updateAnimationNumberField('repeatCount', Number(event.target.value))} disabled={animationDraft.repeatMode === 'indefinite'} />
            </label>
            <label className="animation-field animation-field-split">
              <span>Fill mode</span>
              <select value={animationDraft.fillMode} onChange={(event) => updateAnimationSelectField('fillMode', event.target.value === 'freeze' ? 'freeze' : 'remove')}>
                <option value="remove">Remove</option>
                <option value="freeze">Freeze</option>
              </select>
            </label>
            {animationDraft.presetId === 'drift' ? (
              <>
                <label className="animation-field animation-field-split">
                  <span>Direction</span>
                  <select value={animationDraft.motionDirection} onChange={(event) => updateAnimationSelectField('motionDirection', event.target.value as AnimationMotionDirection)}>
                    <option value="up">Up</option>
                    <option value="down">Down</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                    <option value="up-left">Up left</option>
                    <option value="up-right">Up right</option>
                    <option value="down-left">Down left</option>
                    <option value="down-right">Down right</option>
                  </select>
                </label>
                <label className="animation-field animation-field-split">
                  <span>Distance</span>
                  <input type="number" min="0" step="1" value={animationDraft.motionDistance} onChange={(event) => updateAnimationNumberField('motionDistance', Number(event.target.value))} />
                </label>
              </>
            ) : animationDraft.presetId === 'rotate' ? (
              <>
                <label className="animation-field animation-field-split">
                  <span>Direction</span>
                  <select value={animationDraft.turnDirection} onChange={(event) => updateAnimationSelectField('turnDirection', event.target.value as AnimationTurnDirection)}>
                    <option value="clockwise">Clockwise</option>
                    <option value="counterclockwise">Counterclockwise</option>
                  </select>
                </label>
                <label className="animation-field animation-field-split">
                  <span>Degrees</span>
                  <input type="number" min="0" step="1" value={animationDraft.turnDegrees} onChange={(event) => updateAnimationNumberField('turnDegrees', Number(event.target.value))} />
                </label>
              </>
            ) : animationDraft.presetId === 'scale' ? (
              <>
                <label className="animation-field animation-field-split">
                  <span>Start scale</span>
                  <input type="number" min="0" step="0.05" value={animationDraft.startScale} onChange={(event) => updateAnimationNumberField('startScale', Number(event.target.value))} />
                </label>
                <label className="animation-field animation-field-split">
                  <span>Peak scale</span>
                  <input type="number" min="0" step="0.05" value={animationDraft.midScale} onChange={(event) => updateAnimationNumberField('midScale', Number(event.target.value))} />
                </label>
                <label className="animation-field animation-field-split">
                  <span>End scale</span>
                  <input type="number" min="0" step="0.05" value={animationDraft.endScale} onChange={(event) => updateAnimationNumberField('endScale', Number(event.target.value))} />
                </label>
              </>
            ) : animationDraft.presetId === 'orbit' ? (
              <>
                <label className="animation-field animation-field-split">
                  <span>Orbit radius X</span>
                  <input type="number" min="1" step="1" value={animationDraft.orbitRadiusX} onChange={(event) => updateAnimationNumberField('orbitRadiusX', Number(event.target.value))} />
                </label>
                <label className="animation-field animation-field-split">
                  <span>Orbit radius Y</span>
                  <input type="number" min="1" step="1" value={animationDraft.orbitRadiusY} onChange={(event) => updateAnimationNumberField('orbitRadiusY', Number(event.target.value))} />
                </label>
                <label className="animation-field animation-field-split">
                  <span>Rotate with path</span>
                  <select value={animationDraft.rotateMode} onChange={(event) => updateAnimationSelectField('rotateMode', event.target.value as AnimationRotateMode)}>
                    <option value="auto">Auto</option>
                    <option value="none">None</option>
                  </select>
                </label>
              </>
            ) : animationDraft.presetId === 'color-shift' ? (
              <>
                <label className="animation-field animation-field-split">
                  <span>From color</span>
                  <input type="text" value={animationDraft.colorFrom} onChange={(event) => updateAnimationTextField('colorFrom', event.target.value)} />
                </label>
                <label className="animation-field animation-field-split">
                  <span>Middle color</span>
                  <input type="text" value={animationDraft.colorMid} onChange={(event) => updateAnimationTextField('colorMid', event.target.value)} />
                </label>
                <label className="animation-field animation-field-split">
                  <span>To color</span>
                  <input type="text" value={animationDraft.colorTo} onChange={(event) => updateAnimationTextField('colorTo', event.target.value)} />
                </label>
              </>
            ) : animationDraft.presetId === 'path-morph' ? (
              <>
                <label className="animation-field animation-field-split">
                  <span>Morph target</span>
                  <select value={animationDraft.morphTarget} onChange={(event) => updateAnimationSelectField('morphTarget', event.target.value as AnimationMorphTarget)}>
                    <option value="circle">Toward circle</option>
                    <option value="jitter">Random jitter</option>
                  </select>
                </label>
                <label className="animation-field animation-field-split">
                  <span>{animationDraft.morphTarget === 'jitter' ? 'Jitter amount (units)' : 'Morph strength (%)'}</span>
                  <input
                    type="number"
                    min="0"
                    max={animationDraft.morphTarget === 'jitter' ? undefined : 100}
                    step={animationDraft.morphTarget === 'jitter' ? 1 : 5}
                    value={animationDraft.morphAmount}
                    onChange={(event) => updateAnimationNumberField('morphAmount', Number(event.target.value))}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="animation-field animation-field-split">
                  <span>Start opacity</span>
                  <input type="number" min="0" max="1" step="0.05" value={animationDraft.startOpacity} onChange={(event) => updateAnimationNumberField('startOpacity', Number(event.target.value))} />
                </label>
                <label className="animation-field animation-field-split">
                  <span>{animationDraft.presetId === 'fade-in' ? 'End opacity' : 'Mid opacity'}</span>
                  <input type="number" min="0" max="1" step="0.05" value={animationDraft.presetId === 'fade-in' ? animationDraft.endOpacity : animationDraft.midOpacity} onChange={(event) => updateAnimationNumberField(animationDraft.presetId === 'fade-in' ? 'endOpacity' : 'midOpacity', Number(event.target.value))} />
                </label>
                {animationDraft.presetId !== 'fade-in' ? (
                  <label className="animation-field animation-field-split">
                    <span>End opacity</span>
                    <input type="number" min="0" max="1" step="0.05" value={animationDraft.endOpacity} onChange={(event) => updateAnimationNumberField('endOpacity', Number(event.target.value))} />
                  </label>
                ) : null}
              </>
            )}
          </div>
          <div className="animation-preview-card">
            <div className="animation-preview-copy">
              <strong>Preset preview</strong>
              <p>{describeAnimationDraft(animationDraft)}</p>
            </div>
            <div className="animation-preview-stage">
              {(() => {
                const previewMotion = getPreviewMotionVector(animationDraft.motionDirection, animationDraft.motionDistance);
                const previewTurnDegrees = animationDraft.turnDirection === 'counterclockwise'
                  ? animationDraft.turnDegrees * -1
                  : animationDraft.turnDegrees;
                const previewFlickerStops = getPreviewFlickerStops(animationDraft.startOpacity, animationDraft.midOpacity, animationDraft.endOpacity);
                const previewStyle: CSSProperties & Record<string, string> = {
                  animationDuration: `${Math.max(0.1, animationDraft.durationSeconds)}s`,
                  animationDelay: `${Math.max(0, animationDraft.delaySeconds)}s`,
                  animationIterationCount: animationDraft.repeatMode === 'indefinite' ? 'infinite' : `${Math.max(1, Math.round(animationDraft.repeatCount))}`,
                  animationTimingFunction: animationDraft.easing === 'linear' ? 'linear' : animationDraft.easing === 'ease-in' ? 'ease-in' : animationDraft.easing === 'ease-out' ? 'ease-out' : 'ease-in-out',
                  '--animation-preview-start': `${animationDraft.startOpacity}`,
                  '--animation-preview-mid': `${animationDraft.midOpacity}`,
                  '--animation-preview-end': `${animationDraft.endOpacity}`,
                  '--animation-preview-flicker-1': `${previewFlickerStops[0] ?? animationDraft.midOpacity}`,
                  '--animation-preview-flicker-2': `${previewFlickerStops[1] ?? animationDraft.midOpacity}`,
                  '--animation-preview-flicker-3': `${previewFlickerStops[2] ?? animationDraft.midOpacity}`,
                  '--animation-preview-flicker-4': `${previewFlickerStops[3] ?? animationDraft.midOpacity}`,
                  '--animation-preview-flicker-5': `${previewFlickerStops[4] ?? animationDraft.midOpacity}`,
                  '--animation-preview-flicker-6': `${previewFlickerStops[5] ?? animationDraft.midOpacity}`,
                  '--animation-preview-flicker-7': `${previewFlickerStops[6] ?? animationDraft.midOpacity}`,
                  '--animation-preview-x': `${previewMotion.x}px`,
                  '--animation-preview-y': `${previewMotion.y}px`,
                  '--animation-preview-distance': `${animationDraft.motionDistance}px`,
                  '--animation-preview-rotate': `${previewTurnDegrees}deg`,
                  '--animation-preview-scale-start': `${animationDraft.startScale}`,
                  '--animation-preview-scale-mid': `${animationDraft.midScale}`,
                  '--animation-preview-scale-end': `${animationDraft.endScale}`,
                  '--animation-preview-orbit-x': `${animationDraft.orbitRadiusX}px`,
                  '--animation-preview-orbit-y': `${animationDraft.orbitRadiusY}px`,
                  '--animation-preview-color-from': animationDraft.colorFrom,
                  '--animation-preview-color-mid': animationDraft.colorMid,
                  '--animation-preview-color-to': animationDraft.colorTo,
                };
                return (
                  <div
                    className={`animation-preview-swatch preset-${animationDraft.presetId}`}
                    style={previewStyle}
                  />
                );
              })()}
            </div>
          </div>
        </section>

        <section className="focus-card section-card animation-section-card">
          <div className="section-header-inline" data-fit-container>
            <h3>Target override</h3>
            <span className="status-label">{activeAnimationTargetPath ? 'Active target' : 'Optional'}</span>
          </div>
          {activeAnimationTargetPath ? (
            <>
              <p className="section-copy">Override timing or preset-specific values for the active target without changing the shared preset for the rest of the current selection.</p>
              <div className="animation-form-grid override-grid">
                <label className="animation-field">
                  <span>Duration override (s)</span>
                  <input type="number" min="0.1" step="0.1" value={activeAnimationOverride?.durationSeconds ?? animationDraft.durationSeconds} onChange={(event) => updateActiveTargetOverride('durationSeconds', Number(event.target.value))} />
                </label>
                <label className="animation-field">
                  <span>Delay override (s)</span>
                  <input type="number" min="0" step="0.1" value={activeAnimationOverride?.delaySeconds ?? animationDraft.delaySeconds} onChange={(event) => updateActiveTargetOverride('delaySeconds', Number(event.target.value))} />
                </label>
                {animationDraft.presetId === 'drift' ? (
                  <label className="animation-field">
                    <span>Distance override</span>
                    <input type="number" min="0" step="1" value={activeAnimationOverride?.motionDistance ?? animationDraft.motionDistance} onChange={(event) => updateActiveTargetOverride('motionDistance', Number(event.target.value))} />
                  </label>
                ) : null}
                {animationDraft.presetId === 'rotate' ? (
                  <>
                    <label className="animation-field">
                      <span>Direction override</span>
                      <select value={activeAnimationOverride?.turnDirection ?? animationDraft.turnDirection} onChange={(event) => updateActiveTargetOverride('turnDirection', event.target.value as AnimationTurnDirection)}>
                        <option value="clockwise">Clockwise</option>
                        <option value="counterclockwise">Counterclockwise</option>
                      </select>
                    </label>
                    <label className="animation-field">
                      <span>Degrees override</span>
                      <input type="number" min="0" step="1" value={activeAnimationOverride?.turnDegrees ?? animationDraft.turnDegrees} onChange={(event) => updateActiveTargetOverride('turnDegrees', Number(event.target.value))} />
                    </label>
                  </>
                ) : null}
                {animationDraft.presetId === 'scale' ? (
                  <>
                    <label className="animation-field">
                      <span>Start scale override</span>
                      <input type="number" min="0" step="0.05" value={activeAnimationOverride?.startScale ?? animationDraft.startScale} onChange={(event) => updateActiveTargetOverride('startScale', Number(event.target.value))} />
                    </label>
                    <label className="animation-field">
                      <span>Peak scale override</span>
                      <input type="number" min="0" step="0.05" value={activeAnimationOverride?.midScale ?? animationDraft.midScale} onChange={(event) => updateActiveTargetOverride('midScale', Number(event.target.value))} />
                    </label>
                    <label className="animation-field">
                      <span>End scale override</span>
                      <input type="number" min="0" step="0.05" value={activeAnimationOverride?.endScale ?? animationDraft.endScale} onChange={(event) => updateActiveTargetOverride('endScale', Number(event.target.value))} />
                    </label>
                  </>
                ) : null}
                {animationDraft.presetId === 'orbit' ? (
                  <>
                    <label className="animation-field">
                      <span>Orbit X override</span>
                      <input type="number" min="1" step="1" value={activeAnimationOverride?.orbitRadiusX ?? animationDraft.orbitRadiusX} onChange={(event) => updateActiveTargetOverride('orbitRadiusX', Number(event.target.value))} />
                    </label>
                    <label className="animation-field">
                      <span>Orbit Y override</span>
                      <input type="number" min="1" step="1" value={activeAnimationOverride?.orbitRadiusY ?? animationDraft.orbitRadiusY} onChange={(event) => updateActiveTargetOverride('orbitRadiusY', Number(event.target.value))} />
                    </label>
                  </>
                ) : null}
                {animationDraft.presetId === 'color-shift' ? (
                  <>
                    <label className="animation-field">
                      <span>From color override</span>
                      <input type="text" value={activeAnimationOverride?.colorFrom ?? animationDraft.colorFrom} onChange={(event) => updateActiveTargetOverride('colorFrom', event.target.value)} />
                    </label>
                    <label className="animation-field">
                      <span>Middle color override</span>
                      <input type="text" value={activeAnimationOverride?.colorMid ?? animationDraft.colorMid} onChange={(event) => updateActiveTargetOverride('colorMid', event.target.value)} />
                    </label>
                    <label className="animation-field">
                      <span>To color override</span>
                      <input type="text" value={activeAnimationOverride?.colorTo ?? animationDraft.colorTo} onChange={(event) => updateActiveTargetOverride('colorTo', event.target.value)} />
                    </label>
                  </>
                ) : null}
                {animationDraft.presetId === 'path-morph' ? (
                  <label className="animation-field">
                    <span>{animationDraft.morphTarget === 'jitter' ? 'Jitter amount override' : 'Morph strength override (%)'}</span>
                    <input
                      type="number"
                      min="0"
                      max={animationDraft.morphTarget === 'jitter' ? undefined : 100}
                      step={animationDraft.morphTarget === 'jitter' ? 1 : 5}
                      value={activeAnimationOverride?.morphAmount ?? animationDraft.morphAmount}
                      onChange={(event) => updateActiveTargetOverride('morphAmount', Number(event.target.value))}
                    />
                  </label>
                ) : null}
              </div>
              <div className="animation-target-actions" role="toolbar" aria-label="Target override actions">
                <button className="ghost-button" type="button" onClick={clearActiveTargetOverride}>
                  Clear override
                </button>
              </div>
            </>
          ) : (
            <p className="selection-copy">Select a target from the list above to add an override for just that element.</p>
          )}
        </section>

        <section className="focus-card section-card animation-section-card">
          <div className="section-header-inline" data-fit-container>
            <h3>Preview and apply</h3>
            <span className="status-label">Source-backed</span>
          </div>
          <p className="section-copy">Applying an animation updates the SVG source and refreshes the main preview immediately. The selected stack action controls whether the preset replaces, prepends, appends, or edits a specific animation step.</p>
          <label className="animation-field checkbox-field">
            <span>Replace mode</span>
            <select value={animationReplaceMode} onChange={(event) => setAnimationReplaceMode(event.target.value === 'all' ? 'all' : 'workbench')}>
              <option value="workbench">Replace workbench-authored animation only</option>
              <option value="all">Replace all direct animation children on targets</option>
            </select>
          </label>
          <div className="animation-target-actions" role="toolbar" aria-label="Animation apply actions">
            <button className="primary-button" type="button" onClick={applyAnimationToTargets} disabled={animationTargetPaths.length === 0}>
              Preview and apply to {animationTargetPaths.length || 0} target{animationTargetPaths.length === 1 ? '' : 's'}
            </button>
            <button className="ghost-button" type="button" onClick={clearWorkbenchAnimations} disabled={animationTargetPaths.length === 0}>
              Clear animation stack
            </button>
          </div>
          {animationMessage ? <p className="repair-note">{animationMessage}</p> : null}
        </section>
      </>
    );
  }

  function renderStyleFacetSection() {
    const hasFillKeyword = isPaintKeyword(styleDraft.fill);
    const hasStrokeKeyword = isPaintKeyword(styleDraft.stroke);

    return (
      <>
        <section className="status-card compact-card">
          <p className="status-label">Style authoring</p>
          <strong>{authorableSelectionPaths.length} selected element{authorableSelectionPaths.length === 1 ? '' : 's'}</strong>
          <p>Edit fill, stroke, and visibility attributes on the current preview selection.</p>
        </section>

        <section className="focus-card section-card">
          <div className="section-header-inline" data-fit-container>
            <h3>Style properties</h3>
            <span className="status-label">Selection-driven</span>
          </div>
          <p className="section-copy">
            These fields write SVG presentation attributes directly on selected elements. Empty fields leave the attribute unchanged (or remove it if it was previously set by this panel). Reload to sync from the inspected element.
          </p>

          <div className="style-form-grid">
            <div className="style-paint-field">
              <label className="animation-field" htmlFor="style-fill-text">
                <span>Fill</span>
                <div className="style-paint-row">
                  <input
                    type="color"
                    className="style-color-swatch"
                    aria-label="Fill color picker"
                    value={paintValueToColorInput(styleDraft.fill)}
                    disabled={hasFillKeyword}
                    onChange={(event) => updateStyleDraftField('fill', event.target.value)}
                  />
                  <input
                    id="style-fill-text"
                    type="text"
                    value={styleDraft.fill}
                    placeholder="inherit"
                    onChange={(event) => updateStyleDraftField('fill', event.target.value)}
                  />
                </div>
              </label>
            </div>

            <div className="style-paint-field">
              <label className="animation-field" htmlFor="style-stroke-text">
                <span>Stroke</span>
                <div className="style-paint-row">
                  <input
                    type="color"
                    className="style-color-swatch"
                    aria-label="Stroke color picker"
                    value={paintValueToColorInput(styleDraft.stroke)}
                    disabled={hasStrokeKeyword}
                    onChange={(event) => updateStyleDraftField('stroke', event.target.value)}
                  />
                  <input
                    id="style-stroke-text"
                    type="text"
                    value={styleDraft.stroke}
                    placeholder="none"
                    onChange={(event) => updateStyleDraftField('stroke', event.target.value)}
                  />
                </div>
              </label>
            </div>

            <label className="animation-field">
              <span>Stroke width</span>
              <input
                type="text"
                value={styleDraft.strokeWidth}
                placeholder="1"
                onChange={(event) => updateStyleDraftField('strokeWidth', event.target.value)}
              />
            </label>

            <label className="animation-field">
              <span>Opacity</span>
              <div className="style-range-row">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={styleDraft.opacity !== '' ? String(Math.max(0, Math.min(1, Number(styleDraft.opacity)))) : '1'}
                  onChange={(event) => updateStyleDraftField('opacity', event.target.value)}
                />
                <input
                  type="text"
                  className="style-range-number"
                  value={styleDraft.opacity}
                  placeholder="1"
                  onChange={(event) => updateStyleDraftField('opacity', event.target.value)}
                />
              </div>
            </label>

            <label className="animation-field">
              <span>Fill opacity</span>
              <div className="style-range-row">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={styleDraft.fillOpacity !== '' ? String(Math.max(0, Math.min(1, Number(styleDraft.fillOpacity)))) : '1'}
                  onChange={(event) => updateStyleDraftField('fillOpacity', event.target.value)}
                />
                <input
                  type="text"
                  className="style-range-number"
                  value={styleDraft.fillOpacity}
                  placeholder="1"
                  onChange={(event) => updateStyleDraftField('fillOpacity', event.target.value)}
                />
              </div>
            </label>

            <label className="animation-field">
              <span>Stroke opacity</span>
              <div className="style-range-row">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={styleDraft.strokeOpacity !== '' ? String(Math.max(0, Math.min(1, Number(styleDraft.strokeOpacity)))) : '1'}
                  onChange={(event) => updateStyleDraftField('strokeOpacity', event.target.value)}
                />
                <input
                  type="text"
                  className="style-range-number"
                  value={styleDraft.strokeOpacity}
                  placeholder="1"
                  onChange={(event) => updateStyleDraftField('strokeOpacity', event.target.value)}
                />
              </div>
            </label>

            <label className="animation-field">
              <span>Display</span>
              <select
                value={styleDraft.display}
                onChange={(event) => updateStyleDraftField('display', event.target.value)}
              >
                <option value="">Inherit / unset</option>
                <option value="inline">inline</option>
                <option value="none">none</option>
                <option value="block">block</option>
              </select>
            </label>

            <label className="animation-field">
              <span>Visibility</span>
              <select
                value={styleDraft.visibility}
                onChange={(event) => updateStyleDraftField('visibility', event.target.value)}
              >
                <option value="">Inherit / unset</option>
                <option value="visible">visible</option>
                <option value="hidden">hidden</option>
                <option value="collapse">collapse</option>
              </select>
            </label>

            <label className="animation-field">
              <span>Fill rule</span>
              <select
                value={styleDraft.fillRule}
                onChange={(event) => updateStyleDraftField('fillRule', event.target.value)}
              >
                <option value="">Inherit / unset</option>
                <option value="nonzero">nonzero</option>
                <option value="evenodd">evenodd</option>
              </select>
            </label>
          </div>

          <div className="animation-target-actions" role="toolbar" aria-label="Style actions">
            <button
              className="ghost-button"
              type="button"
              onClick={toggleSelectedElementVisibility}
              disabled={authorableSelectionPaths.length === 0}
            >
              {areAllSelectedElementsHidden ? 'Unhide selected' : 'Hide selected'}
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={applyStyleToSelection}
              disabled={authorableSelectionPaths.length === 0}
            >
              Apply to {authorableSelectionPaths.length || 0} selected element{authorableSelectionPaths.length === 1 ? '' : 's'}
            </button>
            <button className="ghost-button" type="button" onClick={reloadStyleDraftFromSelection}>
              Reload from inspected element
            </button>
          </div>
          {styleMessage ? <p className="repair-note">{styleMessage}</p> : null}
        </section>
      </>
    );
  }

  function renderInteractionSection() {
    const canEditLinkFields = selectedNode ? isAnchorLikeNode(selectedNode.name) : false;

    return (
      <>
        <section className="status-card compact-card">
          <p className="status-label">Interaction authoring</p>
          <strong>{authorableSelectionPaths.length} selected element{authorableSelectionPaths.length === 1 ? '' : 's'}</strong>
          <p>Apply pointer, focus, tooltip, and state-driven hover/focus patterns across the current preview selection.</p>
        </section>

        <section className="focus-card section-card interaction-section-card">
          <div className="section-header-inline" data-fit-container>
            <h3>Interaction fields</h3>
            <span className="status-label">Selection-driven</span>
          </div>
          <p className="section-copy">These controls can write direct SVG attributes, attach a managed tooltip title node, and assign reusable hover/focus behavior classes. Link fields are enabled when the inspected element is an anchor.</p>
          <div className="interaction-preset-grid" role="list" aria-label="Interaction behavior presets">
            {interactionBehaviorPresets.map((preset) => (
              <button
                key={preset.id}
                className="interaction-preset-card"
                type="button"
                aria-label={preset.label}
                onClick={() => applyInteractionPreset(preset.id)}
              >
                <strong>{preset.label}</strong>
                <span>{preset.description}</span>
                <small>{preset.tags.join(' • ')}</small>
              </button>
            ))}
          </div>
          <div className="interaction-form-grid">
            <label className="animation-field">
              <span>Accessible label</span>
              <input type="text" value={interactionDraft.ariaLabel} onChange={(event) => updateInteractionDraftField('ariaLabel', event.target.value)} />
            </label>
            <label className="animation-field">
              <span>Tooltip text</span>
              <input type="text" value={interactionDraft.tooltipText} onChange={(event) => updateInteractionDraftField('tooltipText', event.target.value)} placeholder="Shows in native SVG tooltip UIs" />
            </label>
            <label className="animation-field">
              <span>Tab index</span>
              <input type="text" value={interactionDraft.tabIndex} onChange={(event) => updateInteractionDraftField('tabIndex', event.target.value)} />
            </label>
            <label className="animation-field">
              <span>Focusable</span>
              <select value={interactionDraft.focusable} onChange={(event) => updateInteractionDraftField('focusable', event.target.value)}>
                <option value="">Inherit / unset</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
            <label className="animation-field">
              <span>Hover behavior</span>
              <select value={interactionDraft.hoverPreset} onChange={(event) => updateInteractionDraftField('hoverPreset', event.target.value)}>
                {interactionHoverPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label}</option>
                ))}
              </select>
            </label>
            <label className="animation-field">
              <span>Focus behavior</span>
              <select value={interactionDraft.focusPreset} onChange={(event) => updateInteractionDraftField('focusPreset', event.target.value)}>
                {interactionFocusPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label}</option>
                ))}
              </select>
            </label>
            <label className="animation-field">
              <span>Pointer events</span>
              <input type="text" value={interactionDraft.pointerEvents} onChange={(event) => updateInteractionDraftField('pointerEvents', event.target.value)} placeholder="visiblePainted" />
            </label>
            <label className="animation-field">
              <span>Cursor</span>
              <input type="text" value={interactionDraft.cursor} onChange={(event) => updateInteractionDraftField('cursor', event.target.value)} placeholder="pointer" />
            </label>
            <label className="animation-field">
              <span>Link href</span>
              <input type="text" value={interactionDraft.href} onChange={(event) => updateInteractionDraftField('href', event.target.value)} disabled={!canEditLinkFields} placeholder={canEditLinkFields ? 'https://example.com' : 'Select an <a> element'} />
            </label>
            <label className="animation-field">
              <span>Link target</span>
              <input type="text" value={interactionDraft.target} onChange={(event) => updateInteractionDraftField('target', event.target.value)} disabled={!canEditLinkFields} placeholder="_blank" />
            </label>
            <label className="animation-field">
              <span>Link rel</span>
              <input type="text" value={interactionDraft.rel} onChange={(event) => updateInteractionDraftField('rel', event.target.value)} disabled={!canEditLinkFields} placeholder="noopener noreferrer" />
            </label>
          </div>
          <div className="animation-target-actions" role="toolbar" aria-label="Interaction actions">
            <button className="primary-button" type="button" onClick={applyInteractionToSelection} disabled={authorableSelectionPaths.length === 0}>
              Apply to {authorableSelectionPaths.length || 0} selected element{authorableSelectionPaths.length === 1 ? '' : 's'}
            </button>
            <button className="ghost-button" type="button" onClick={reloadInteractionDraftFromSelection}>
              Reload from inspected element
            </button>
          </div>
          {interactionMessage ? <p className="repair-note">{interactionMessage}</p> : null}
        </section>

        <section className="focus-card section-card interaction-section-card">
          <div className="section-header-inline" data-fit-container>
            <h3>Current interaction signals</h3>
            <span className="status-label">Inspected element</span>
          </div>
          {selectedNode && selectedNodeInteraction ? (
            <ul className="warning-list compact-note-list interaction-signal-list">
              <li data-fit-container>
                <span className="risk-badge info">href</span>
                <span>{selectedNodeInteraction.href ? `${selectedNodeInteraction.href} (${selectedNodeInteraction.hrefKind})` : 'No direct link destination'}</span>
              </li>
              <li data-fit-container>
                <span className="risk-badge info">pointer</span>
                <span>{selectedNodeInteraction.pointerEvents ? `pointer-events=${selectedNodeInteraction.pointerEvents}` : 'No explicit pointer-events attribute'}</span>
              </li>
              <li data-fit-container>
                <span className="risk-badge info">cursor</span>
                <span>{selectedNodeInteraction.cursor ? `cursor=${selectedNodeInteraction.cursor}` : 'No explicit cursor attribute'}</span>
              </li>
              <li data-fit-container>
                <span className="risk-badge info">focus</span>
                <span>{selectedNodeInteraction.tabIndex || selectedNodeInteraction.focusable ? `tabindex=${selectedNodeInteraction.tabIndex ?? 'unset'} • focusable=${selectedNodeInteraction.focusable ?? 'unset'}` : 'No explicit keyboard focus attributes'}</span>
              </li>
              <li data-fit-container>
                <span className="risk-badge info">hover</span>
                <span>{selectedNodeInteraction.hoverPreset === 'none' ? 'No managed hover behavior preset' : `${selectedNodeInteraction.hoverPreset} behavior preset active`}</span>
              </li>
              <li data-fit-container>
                <span className="risk-badge info">focus fx</span>
                <span>{selectedNodeInteraction.focusPreset === 'none' ? 'No managed focus behavior preset' : `${selectedNodeInteraction.focusPreset} behavior preset active`}</span>
              </li>
              <li data-fit-container>
                <span className="risk-badge info">tooltip</span>
                <span>{selectedNodeInteraction.tooltipText ?? 'No direct title tooltip on this element'}</span>
              </li>
              <li data-fit-container>
                <span className="risk-badge info">label</span>
                <span>{selectedNodeInteraction.ariaLabel ?? 'No aria-label attribute set'}</span>
              </li>
              <li data-fit-container>
                <span className={`risk-badge ${selectedNodeInteraction.inlineEventAttributes.length > 0 ? 'warning' : 'info'}`}>events</span>
                <span>{selectedNodeInteraction.inlineEventAttributes.length > 0 ? `${selectedNodeInteraction.inlineEventAttributes.join(', ')} present in source. Preview sanitization strips executable handlers.` : 'No inline event attributes detected.'}</span>
              </li>
              <li data-fit-container>
                <span className="risk-badge info">styles</span>
                <span>{selectedNodeInteraction.hasManagedStyles ? 'Managed interaction stylesheet is present in the SVG root.' : 'No managed interaction stylesheet is currently needed.'}</span>
              </li>
            </ul>
          ) : (
            <p className="selection-copy">Select an element in the preview to inspect its interaction signals.</p>
          )}
        </section>
      </>
    );
  }

  function renderFileSection() {
    return (
      <>
        <section className="status-card compact-card">
          <p className="status-label">Current file</p>
          <strong>{fileName}</strong>
          <p>{statusSummary}</p>
        </section>

        <section className="status-card trace-card section-card">
          <p className="status-label">Raster trace</p>
          <strong>{rasterTraceAsset ? rasterTraceAsset.fileName : `Load ${rasterTraceFormatLabel}`}</strong>
          <p>Trace raster art entirely in the browser, then load the generated SVG into the editor and preview.</p>
          <div className="font-actions">
            <button className="ghost-button repair-button" type="button" onClick={() => rasterInputRef.current?.click()}>
              Choose raster
            </button>
            <button className="ghost-button repair-button" type="button" onClick={clearRasterTraceAsset} disabled={!rasterTraceAsset}>
              Clear raster
            </button>
          </div>
          <div className="trace-meta-grid">
            <div className="source-feedback-card compact-source-metrics">
              <span className="status-label">Output</span>
              <strong>{rasterTraceAsset ? buildTracedSvgFileName(rasterTraceAsset.fileName) : 'No trace queued'}</strong>
              <p className="source-feedback-copy">The trace result replaces the current SVG source in the editor.</p>
            </div>
            <div className="source-feedback-card compact-source-metrics">
              <span className="status-label">Formats</span>
              <strong>{rasterTraceFormatLabel}</strong>
              <p className="source-feedback-copy">Drag onto the preview or open a raster file directly.</p>
            </div>
            <div className="source-feedback-card compact-source-metrics">
              <span className="status-label">Image</span>
              <strong>{rasterTraceAsset ? `${rasterTraceAsset.width} × ${rasterTraceAsset.height}` : 'No raster loaded'}</strong>
              <p className="source-feedback-copy">{rasterTraceAsset ? `${formatByteCount(rasterTraceAsset.bytes)} • ${rasterTraceAsset.mimeType || 'unknown type'}` : 'Load a raster file to inspect its size before tracing.'}</p>
            </div>
          </div>
          <div className="trace-preview-shell">
            {rasterTraceAsset ? (
              <img className="trace-preview-image" src={rasterTraceAsset.dataUrl} alt={`Raster preview of ${rasterTraceAsset.fileName}`} />
            ) : (
              <div className="empty-state trace-empty-state">
                <strong>Raster input</strong>
                <p>Queue a PNG, JPG, WebP, GIF, BMP, AVIF, or TIFF image to tune the trace before loading the SVG result into the editor.</p>
              </div>
            )}
          </div>
          <div className="trace-field-grid">
            <label className="animation-field animation-field-split">
              <span>Trace preset</span>
              <select aria-label="Trace preset" value={rasterTraceSettings.presetId} onChange={(event) => applyRasterTracePreset(event.target.value as RasterTracePresetId)}>
                {rasterTracePresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="animation-field animation-field-split">
              <span>Mode</span>
              <select aria-label="Raster trace mode" value={rasterTraceSettings.mode} onChange={(event) => updateRasterTraceSetting('mode', event.target.value as RasterTraceMode)}>
                <option value="color">Color</option>
                <option value="grayscale">Grayscale</option>
                <option value="monochrome">Monochrome</option>
              </select>
            </label>
            <label className="animation-field">
              <span>Colors</span>
              <div className="trace-range-row">
                <input
                  aria-label="Raster trace color count"
                  type="range"
                  min="2"
                  max="48"
                  step="1"
                  value={rasterTraceSettings.mode === 'monochrome' ? 2 : rasterTraceSettings.numberOfColors}
                  onChange={(event) => updateRasterTraceSetting('numberOfColors', Number(event.target.value))}
                  disabled={rasterTraceSettings.mode === 'monochrome'}
                />
                <output>{rasterTraceSettings.mode === 'monochrome' ? 2 : rasterTraceSettings.numberOfColors}</output>
              </div>
            </label>
            <label className="animation-field">
              <span>Threshold</span>
              <div className="trace-range-row">
                <input
                  aria-label="Raster trace threshold"
                  type="range"
                  min="0"
                  max="255"
                  step="1"
                  value={rasterTraceSettings.threshold}
                  onChange={(event) => updateRasterTraceSetting('threshold', Number(event.target.value))}
                  disabled={rasterTraceSettings.mode !== 'monochrome'}
                />
                <output>{rasterTraceSettings.threshold}</output>
              </div>
            </label>
            {shouldShowPhotoCleanupControls ? (
              <label className="selection-appearance-toggle trace-toggle">
                <input
                  type="checkbox"
                  aria-label="Edge-preserving photo cleanup"
                  checked={rasterTraceSettings.photoCleanup}
                  onChange={(event) => updateRasterTraceSetting('photoCleanup', event.target.checked)}
                />
                Edge-preserving photo cleanup
              </label>
            ) : null}
            {shouldShowPhotoCleanupControls ? (
              <label className="animation-field">
                <span>Cleanup strength</span>
                <div className="trace-range-row">
                  <input
                    aria-label="Raster trace cleanup strength"
                    type="range"
                    min="1"
                    max="3"
                    step="1"
                    value={rasterTraceSettings.photoCleanupStrength}
                    onChange={(event) => updateRasterTraceSetting('photoCleanupStrength', Number(event.target.value))}
                    disabled={!rasterTraceSettings.photoCleanup}
                  />
                  <output>{rasterTraceSettings.photoCleanupStrength}</output>
                </div>
              </label>
            ) : null}
            {shouldShowPosterizeControls ? (
              <label className="selection-appearance-toggle trace-toggle">
                <input
                  type="checkbox"
                  aria-label="Posterize raster trace colors"
                  checked={rasterTraceSettings.posterize}
                  onChange={(event) => updateRasterTraceSetting('posterize', event.target.checked)}
                />
                Posterize before tracing
              </label>
            ) : null}
            {shouldShowPosterizeControls ? (
              <label className="animation-field">
                <span>Posterize levels</span>
                <div className="trace-range-row">
                  <input
                    aria-label="Raster trace posterize levels"
                    type="range"
                    min="2"
                    max="12"
                    step="1"
                    value={rasterTraceSettings.posterizeLevels}
                    onChange={(event) => updateRasterTraceSetting('posterizeLevels', Number(event.target.value))}
                    disabled={!rasterTraceSettings.posterize}
                  />
                  <output>{rasterTraceSettings.posterizeLevels}</output>
                </div>
              </label>
            ) : null}
            <label className="selection-appearance-toggle trace-toggle">
              <input
                type="checkbox"
                aria-label="Remove traced white background"
                checked={rasterTraceSettings.removeBackground}
                onChange={(event) => updateRasterTraceSetting('removeBackground', event.target.checked)}
              />
              Remove traced white background
            </label>
            <label className="animation-field">
              <span>Detail</span>
              <div className="trace-range-row">
                <input
                  aria-label="Raster trace detail"
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={rasterTraceSettings.detail}
                  onChange={(event) => updateRasterTraceSetting('detail', Number(event.target.value))}
                />
                <output>{rasterTraceSettings.detail}</output>
              </div>
            </label>
            <label className="animation-field">
              <span>Blur</span>
              <div className="trace-range-row">
                <input
                  aria-label="Raster trace blur"
                  type="range"
                  min="0"
                  max="5"
                  step="1"
                  value={rasterTraceSettings.blurRadius}
                  onChange={(event) => updateRasterTraceSetting('blurRadius', Number(event.target.value))}
                />
                <output>{rasterTraceSettings.blurRadius}</output>
              </div>
            </label>
            <label className="animation-field">
              <span>Noise filter</span>
              <div className="trace-range-row">
                <input
                  aria-label="Raster trace noise filter"
                  type="range"
                  min="0"
                  max="24"
                  step="1"
                  value={rasterTraceSettings.noiseFilter}
                  onChange={(event) => updateRasterTraceSetting('noiseFilter', Number(event.target.value))}
                />
                <output>{rasterTraceSettings.noiseFilter}</output>
              </div>
            </label>
            <label className="selection-appearance-toggle trace-toggle">
              <input
                type="checkbox"
                aria-label="Enhance raster trace corners"
                checked={rasterTraceSettings.enhanceCorners}
                onChange={(event) => updateRasterTraceSetting('enhanceCorners', event.target.checked)}
              />
              Enhance corners
            </label>
          </div>
          <p className="repair-note trace-preset-copy">{activeRasterTracePreset.description}</p>
          {rasterTraceAssetLooksLikeJpeg ? (
            <p className="repair-note trace-preset-copy">JPEG sources usually trace cleaner with posterization enabled and fewer colors, because compression noise gets flattened before vectorization.</p>
          ) : null}
          {rasterTraceSettings.removeBackground ? (
            <p className="repair-note trace-preset-copy">Background removal only strips large near-white traced shapes that cover nearly the full canvas, so light foreground fills stay intact.</p>
          ) : null}
          <div className="animation-target-actions" role="toolbar" aria-label="Raster trace actions">
            <button className="primary-button" type="button" onClick={() => void traceRasterIntoEditor()} disabled={!rasterTraceAsset || isTracingRaster}>
              {isTracingRaster ? 'Tracing…' : 'Trace into editor'}
            </button>
            <button className="ghost-button" type="button" onClick={resetRasterTraceSettings}>
              Reset settings
            </button>
          </div>
          {rasterTraceMessage ? <p className="source-action-feedback">{rasterTraceMessage}</p> : null}
        </section>

        <section className="editor-card section-card">
          <label className="editor-label" htmlFor={sourceId}>SVG source</label>
          <div className="source-action-bar" role="toolbar" aria-label="Source actions">
            <button className="ghost-button source-action-button" type="button" onClick={applySourceOptimize} disabled={Boolean(parseError) || !source.trim()}>
              Optimize
            </button>
            <button className="ghost-button source-action-button" type="button" onClick={applySourcePrettify} disabled={Boolean(parseError) || !source.trim()}>
              Prettify
            </button>
            <button className="ghost-button source-action-button" type="button" onClick={applySourceClear}>
              Clear
            </button>
          </div>
          <div className="source-feedback-grid" aria-label="Editor feedback">
            <div className="source-feedback-card">
              <span className={`readiness-badge ${parseError ? 'blocked' : 'ready'}`}>
                {parseError ? 'Parse error' : 'Parsed'}
              </span>
              <p className="source-feedback-copy">
                {parseError
                  ? parseError
                  : 'SVG parses successfully. Preview and inspector stay in sync with the current editor source.'}
              </p>
            </div>
            <div className="source-feedback-card compact-source-metrics">
              <span className="status-label">Cursor</span>
              <strong>{`Line ${sourceMetrics.line}, Col ${sourceMetrics.column}`}</strong>
              <p className="source-feedback-copy">{sourceMetrics.selectionLength > 0 ? `${sourceMetrics.selectionLength} selected` : 'No selection'}</p>
            </div>
            <div className="source-feedback-card compact-source-metrics">
              <span className="status-label">Document</span>
              <strong>{`${sourceMetrics.lines} lines`}</strong>
              <p className="source-feedback-copy">{`${sourceMetrics.characters} characters`}</p>
            </div>
          </div>
          <textarea
            id={sourceId}
            className="source-editor"
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setRecentChangePaths([]);
              setHoveredPreviewNodeIds([]);
              setSourceActionMessage(null);
              updateSourceSelection(event.target.selectionStart, event.target.selectionEnd);
            }}
            onClick={(event) => updateSourceSelection(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
            onKeyUp={(event) => updateSourceSelection(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
            onSelect={(event) => updateSourceSelection(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
            spellCheck={false}
          />
          {sourceActionMessage ? <p className="source-action-feedback">{sourceActionMessage}</p> : null}
        </section>
      </>
    );
  }

  function renderRepairSection() {
    return (
      <>
        <section className="status-card font-card section-card">
          <p className="status-label">Font mapping</p>
          <strong>Upload replacement fonts</strong>
          <p>Use local TTF, OTF, or WOFF files to convert text that references non-embedded fonts.</p>
          <div className="font-actions">
            <button className="ghost-button repair-button" type="button" onClick={() => fontInputRef.current?.click()}>
              Upload fonts
            </button>
          </div>
          <div className="font-stack">
            {uploadedFonts.length > 0 ? (
              <div className="font-section">
                <p className="font-section-title">Uploaded fonts</p>
                <ul className="font-list" aria-label="Uploaded fonts">
                  {uploadedFonts.map((font) => (
                    <li key={font.id} className="font-list-item">
                      <div>
                        <strong>{font.familyName}</strong>
                        <span>{font.fileName}</span>
                      </div>
                      <button className="ghost-button inline-button" type="button" onClick={() => removeUploadedFont(font.id)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="repair-note">No uploaded fonts yet.</p>
            )}

            {analysis && analysis.opportunities.referencedTextFamilies.length > 0 ? (
              <div className="font-section">
                <p className="font-section-title">Referenced text families</p>
                <ul className="font-list" aria-label="Referenced text families">
                  {analysis.opportunities.referencedTextFamilies.map((fontReference) => (
                    <li key={fontReference.key} className="font-mapping-item">
                      <div className="font-mapping-copy">
                        <strong>{fontReference.label}</strong>
                        <span>
                          {fontReference.usageCount} text node{fontReference.usageCount === 1 ? '' : 's'} • {fontReference.status}
                          {fontReference.matchedFontFamily ? ` • ${fontReference.matchedFontFamily}` : ''}
                        </span>
                      </div>
                      <label className="font-mapping-control">
                        <span>Map {fontReference.label}</span>
                        <select
                          value={fontMappings[fontReference.key] ?? ''}
                          onChange={(event) => updateFontMapping(fontReference.key, event.target.value)}
                          disabled={uploadedFonts.length === 0}
                          aria-label={`Map ${fontReference.label} font family`}
                        >
                          <option value="">Use matching family if available</option>
                          {uploadedFonts.map((font) => (
                            <option key={font.id} value={font.id}>
                              {font.familyName} ({font.fileName})
                            </option>
                          ))}
                        </select>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="repair-note">No named text font families detected in this SVG.</p>
            )}
          </div>
        </section>

        <section className="status-card repair-card section-card">
          <p className="status-label">Repair actions</p>
          <strong>Safe normalization</strong>
          <div className="repair-actions">
            <button
              className="primary-button repair-button"
              type="button"
              onClick={applySafeRepairPass}
              disabled={!analysis || safeRepairCount === 0}
            >
              Normalize all safe repairs ({safeRepairCount})
            </button>
            <button
              className="ghost-button repair-button"
              type="button"
              onClick={applyAuthoringCleanup}
              disabled={!analysis || authoringCleanupCount === 0}
            >
              Strip {authoringCleanupCount} authoring metadata items
            </button>
            <button
              className="ghost-button repair-button"
              type="button"
              onClick={applyStyleInlining}
              disabled={!analysis || analysis.opportunities.inlineableStyleRuleCount === 0}
            >
              Inline {analysis?.opportunities.inlineableStyleRuleCount ?? 0} simple style rules
            </button>
            <button
              className="ghost-button repair-button"
              type="button"
              onClick={applyShapeNormalization}
              disabled={!analysis || analysis.opportunities.primitiveShapeCount === 0}
            >
              Convert {analysis?.opportunities.primitiveShapeCount ?? 0} shape primitives to paths
            </button>
            <button
              className="ghost-button repair-button"
              type="button"
              onClick={applyStrokeOutline}
              disabled={!analysis || strokeOutlineCount === 0}
            >
              Outline {strokeOutlineCount} stroke-driven nodes
            </button>
            <button
              className="ghost-button repair-button"
              type="button"
              onClick={applyPathCleanup}
              disabled={!analysis || pathCleanupCount === 0}
            >
              Clean {pathCleanupCount} paths
            </button>
            <button
              className="ghost-button repair-button"
              type="button"
              onClick={applyReferenceCleanup}
              disabled={!analysis || referenceCleanupCount === 0}
            >
              Clean {referenceCleanupCount} broken/external refs
            </button>
            <button
              className="ghost-button repair-button"
              type="button"
              onClick={applyTextConversion}
              disabled={!analysis || analysis.opportunities.convertibleTextCount === 0}
            >
              Convert {analysis?.opportunities.convertibleTextCount ?? 0} text elements to paths
            </button>
            <button
              className="ghost-button repair-button"
              type="button"
              onClick={applyTransformBake}
              disabled={!analysis || analysis.opportunities.directTransformCount === 0}
            >
              Bake {analysis?.opportunities.directTransformCount ?? 0} direct transforms
            </button>
            <button
              className="ghost-button repair-button"
              type="button"
              onClick={applyContainerTransformBake}
              disabled={!analysis || analysis.opportunities.bakeableContainerTransformCount === 0}
            >
              Bake {analysis?.opportunities.bakeableContainerTransformCount ?? 0} container transforms
            </button>
            <button
              className="ghost-button repair-button"
              type="button"
              onClick={applyUseExpansion}
              disabled={!analysis || analysis.opportunities.expandableUseCount === 0}
            >
              Expand {analysis?.opportunities.expandableUseCount ?? 0} use references
            </button>
          </div>
          <div className="repair-notes-stack">
            <p className="repair-note">
              {analysis
                ? getTextConversionMessage(
                    analysis.opportunities.convertibleTextCount,
                    analysis.opportunities.blockedTextCount,
                  )
                : 'Load a valid SVG to see repair actions.'}
            </p>
            <p className="repair-note">
              {analysis
                ? getStyleInliningMessage(
                    analysis.opportunities.inlineableStyleRuleCount,
                    analysis.opportunities.blockedStyleRuleCount,
                  )
                : 'Load a valid SVG to see repair actions.'}
            </p>
            <p className="repair-note">
              {analysis
                ? getUseExpansionMessage(
                    analysis.opportunities.expandableUseCount,
                    analysis.opportunities.blockedUseCount,
                  )
                : 'Load a valid SVG to see repair actions.'}
            </p>
            <p className="repair-note">
              {analysis
                ? getContainerTransformMessage(
                    analysis.opportunities.bakeableContainerTransformCount,
                    analysis.opportunities.blockedContainerTransformCount,
                  )
                : 'Load a valid SVG to see repair actions.'}
            </p>
            <p className="repair-note">
              {analysis
                ? getPathCleanupMessage(pathCleanupCount)
                : 'Load a valid SVG to see repair actions.'}
            </p>
            <p className="repair-note">
              {analysis
                ? getReferenceCleanupMessage(referenceCleanupCount)
                : 'Load a valid SVG to see repair actions.'}
            </p>
            <p className="repair-note">
              {analysis
                ? getStrokeOutlineMessage(strokeOutlineCount, blockedStrokeOutlineCount)
                : 'Load a valid SVG to see repair actions.'}
            </p>
            <p className="repair-note">
              {analysis
                ? authoringCleanupCount > 0
                  ? `${authoringCleanupCount} authoring metadata item${authoringCleanupCount === 1 ? '' : 's'} can be stripped without changing visible geometry.`
                  : 'No editor-specific metadata cleanup is currently needed.'
                : 'Load a valid SVG to see repair actions.'}
            </p>
          </div>
          {repairMessage ? <p className="repair-feedback">{repairMessage}</p> : null}
          {recentChangedNodes.length > 0 ? (
            <div className="repair-change-card">
              <p className="font-section-title">Recently changed preview nodes</p>
              <ul className="warning-list interactive-list" aria-label="Recently changed preview nodes">
                {recentChangedNodes.map((node) => (
                  <li
                    key={`changed-${node.id}`}
                    onMouseEnter={() => setPreviewHover([node.id])}
                    onMouseLeave={clearPreviewHover}
                    onFocus={() => setPreviewHover([node.id])}
                    onBlur={clearPreviewHover}
                  >
                    <button className="inline-list-button" type="button" onClick={() => inspectSelectedNode(node.id)}>
                      <span className="risk-badge info">changed</span>
                      <span>{getNodeListLabel(node)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </>
    );
  }

  function renderExportSection() {
    return (
      <section className="focus-card export-card section-card">
        <h3>Export</h3>
        <p className="export-copy">Choose an export preset and download or copy the resulting SVG directly from the browser, or render the selected preset into a PNG snapshot.</p>
        <div className="export-presets" role="tablist" aria-label="Export presets">
          {exportPresetCards.map((preset) => (
            <button
              key={preset.id}
              id={getExportPresetTabButtonId(preset.id)}
              className={`export-preset ${selectedExportPreset === preset.id ? 'active' : ''}`}
              type="button"
              role="tab"
              tabIndex={selectedExportPreset === preset.id ? 0 : -1}
              aria-selected={selectedExportPreset === preset.id}
              aria-controls={getExportPresetPanelId()}
              onClick={() => setSelectedExportPreset(preset.id)}
              onKeyDown={(event) => handleExportPresetKeyDown(event, preset.id)}
            >
              <strong>{preset.title}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>
        <div
          id={getExportPresetPanelId()}
          className="export-preset-panel"
          role="tabpanel"
          aria-labelledby={getExportPresetTabButtonId(selectedExportPreset)}
          tabIndex={0}
        >
        <div className="export-actions two-column-actions">
          <button className="ghost-button export-button" type="button" onClick={downloadCurrentSvg}>
            Download current SVG
          </button>
          <button className="ghost-button export-button" type="button" onClick={() => void copyCurrentSvg()}>
            Copy current SVG
          </button>
          <button
            className="primary-button export-button"
            type="button"
            onClick={downloadSelectedPreset}
            disabled={!canBuildExportVariant(selectedExportPreset)}
          >
            Download {getExportVariantLabel(selectedExportPreset)}
          </button>
          <button
            className="primary-button export-button"
            type="button"
            onClick={() => void copySelectedPreset()}
            disabled={!canBuildExportVariant(selectedExportPreset)}
          >
            Copy {getExportVariantLabel(selectedExportPreset)}
          </button>
          <button
            className="ghost-button export-button"
            type="button"
            onClick={() => void downloadPngSnapshotVariant(selectedExportPreset)}
            disabled={!canBuildExportVariant(selectedExportPreset)}
          >
            Download PNG snapshot
          </button>
        </div>
        <ul className="tag-list compact export-list">
          <li>
            <span>Current file</span>
            <strong>{buildExportFileName(fileName, 'current')}</strong>
          </li>
          <li>
            <span>Browser/runtime preset</span>
            <strong>{buildExportFileName(fileName, 'runtime')}</strong>
          </li>
          <li>
            <span>Geometry-safe preset</span>
            <strong>{buildExportFileName(fileName, 'safe')}</strong>
          </li>
          <li>
            <span>Blender preset</span>
            <strong>{buildExportFileName(fileName, 'blender')}</strong>
          </li>
        </ul>
        {exportReport ? (
          <div className="export-report">
            <div className="export-report-heading">
              <span className="status-label">{exportReport.action === 'copy' ? 'Last copy' : 'Last export'}</span>
              <strong>{getExportReportHeading(exportReport)}</strong>
            </div>
            <p className="export-report-file">{exportReport.fileName}</p>
            <p className="export-report-label">Applied</p>
            <ul className="warning-list export-report-list">
              {exportReport.applied.map((item) => (
                <li key={`applied-${item}`}>
                  <span className="risk-badge info">applied</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="export-report-label">Remaining blockers</p>
            <ul className="warning-list export-report-list">
              {exportReport.remaining.length > 0 ? (
                exportReport.remaining.map((item) => (
                  <li key={`remaining-${item}`}>
                    <span className="risk-badge warning">remaining</span>
                    <span>{item}</span>
                  </li>
                ))
              ) : (
                <li>
                  <span className="risk-badge info">clear</span>
                  <span>No tracked blockers remain in this export.</span>
                </li>
              )}
            </ul>
          </div>
        ) : null}
        </div>
      </section>
    );
  }

  function renderActiveSection() {
    switch (activeSection) {
      case 'repair':
        return renderRepairSection();
      case 'export':
        return renderExportSection();
      case 'file':
      default:
        return renderFileSection();
    }
  }

  function renderReadinessOverview() {
    return (
      <>
        <section className="focus-card section-card">
          <div className="readiness-header" data-fit-container>
            <h3>Workflow scorecards</h3>
            <span className="status-label">Profiles</span>
          </div>
          <div className="readiness-scorecards" data-fit-container data-fit-mode="children">
            <article className="readiness-scorecard">
              <div className="readiness-header" data-fit-container>
                <div>
                  <p className="scorecard-kicker">Geometry-safe</p>
                  <strong>Geometry-safe export</strong>
                </div>
                <span className={`readiness-badge ${analysis?.workflowReadiness.geometrySafe.status ?? 'blocked'}`}>
                  {analysis ? getReadinessLabel(analysis.workflowReadiness.geometrySafe.status) : 'Blocked'}
                </span>
              </div>
              <p className="readiness-score">{analysis?.workflowReadiness.geometrySafe.score ?? 0}</p>
              <p className="readiness-copy">{analysis?.workflowReadiness.geometrySafe.summary ?? 'Load a valid SVG to inspect workflow readiness.'}</p>
              <ul className="warning-list compact-readiness-list">
                {(analysis?.workflowReadiness.geometrySafe.strengths ?? []).map((item) => (
                  <li key={`geometry-strength-${item}`} data-fit-container>
                    <span className="risk-badge info">signal</span>
                    <span>{item}</span>
                  </li>
                ))}
                {(analysis?.workflowReadiness.geometrySafe.blockers ?? []).slice(0, 2).map((item) => (
                  <li key={`geometry-blocker-${item}`} data-fit-container>
                    <span className="risk-badge warning">blocked</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="readiness-scorecard">
              <div className="readiness-header" data-fit-container>
                <div>
                  <p className="scorecard-kicker">Runtime-preserving</p>
                  <strong>Browser/runtime SVG</strong>
                </div>
                <span className={`readiness-badge ${analysis?.workflowReadiness.runtimeSvg.status ?? 'blocked'}`}>
                  {analysis ? getReadinessLabel(analysis.workflowReadiness.runtimeSvg.status) : 'Blocked'}
                </span>
              </div>
              <p className="readiness-score">{analysis?.workflowReadiness.runtimeSvg.score ?? 0}</p>
              <p className="readiness-copy">{analysis?.workflowReadiness.runtimeSvg.summary ?? 'Load a valid SVG to inspect workflow readiness.'}</p>
              <ul className="warning-list compact-readiness-list">
                {(analysis?.workflowReadiness.runtimeSvg.strengths ?? []).map((item) => (
                  <li key={`runtime-strength-${item}`} data-fit-container>
                    <span className="risk-badge info">signal</span>
                    <span>{item}</span>
                  </li>
                ))}
                {(analysis?.workflowReadiness.runtimeSvg.autoFixes ?? []).slice(0, 2).map((item) => (
                  <li key={`runtime-fix-${item}`} data-fit-container>
                    <span className="risk-badge info">auto-fix</span>
                    <span>{item}</span>
                  </li>
                ))}
                {(analysis?.workflowReadiness.runtimeSvg.blockers ?? []).slice(0, 2).map((item) => (
                  <li key={`runtime-blocker-${item}`} data-fit-container>
                    <span className="risk-badge warning">blocked</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section className="focus-card readiness-card section-card">
          <div className="readiness-header" data-fit-container>
            <h3>Export readiness</h3>
            <span className={`readiness-badge ${analysis?.exportReadiness.status ?? 'blocked'}`}>
              {analysis ? getReadinessLabel(analysis.exportReadiness.status) : 'Blocked'}
            </span>
          </div>
          <dl className="metrics-grid readiness-metrics compact-metrics" data-fit-container data-fit-mode="children">
            <div>
              <dt>Auto-fixable</dt>
              <dd>{analysis?.exportReadiness.autoFixCount ?? 0}</dd>
            </div>
            <div>
              <dt>Blocked</dt>
              <dd>{analysis?.exportReadiness.blockerCount ?? 0}</dd>
            </div>
          </dl>
          <p className="readiness-copy">
            {analysis?.exportReadiness.status === 'ready'
              ? 'This SVG currently has no tracked blockers for the safe export pipeline.'
              : analysis?.exportReadiness.status === 'repairable'
                ? 'Run the safe repair pass to clear the remaining auto-fixable items.'
                : hasRuntimeDependencies
                  ? 'This SVG still depends on runtime-only features such as media or timed animation. Keep a browser/runtime SVG export if you need that behavior, or simplify it before geometry-safe export.'
                  : 'This SVG still has unresolved blockers that need manual editing or future repair support.'}
          </p>
          <ul className="warning-list readiness-list">
            {analysis?.exportReadiness.autoFixes.map((item) => (
              <li key={`fix-${item}`} data-fit-container>
                <span className="risk-badge info">auto-fix</span>
                <span>{item}</span>
              </li>
            ))}
            {analysis?.exportReadiness.blockers.map((item) => (
              <li key={`block-${item}`} data-fit-container>
                <span className="risk-badge warning">blocked</span>
                <span>{item}</span>
              </li>
            ))}
            {analysis && analysis.exportReadiness.autoFixes.length === 0 && analysis.exportReadiness.blockers.length === 0 ? (
              <li data-fit-container>
                <span className="risk-badge info">clear</span>
                <span>No tracked export blockers remain.</span>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="focus-card section-card">
          <h3>Export guidance</h3>
          <ul className="warning-list">
            {(analysis?.runtimeFeatures.mediaElementCount ?? 0) > 0 ? (
              <li>
                <span className="risk-badge warning">runtime</span>
                <span>Keep a browser/runtime SVG profile if you need embedded media playback. Geometry-safe exports should remove or replace media elements first.</span>
              </li>
            ) : null}
            {(analysis?.runtimeFeatures.animationElementCount ?? 0) > 0 ? (
              <li>
                <span className="risk-badge info">motion</span>
                <span>Native SVG animation is preserved best in self-contained browser SVG output, not in flattened geometry exports.</span>
              </li>
            ) : null}
            {analysis && analysis.runtimeFeatures.mediaElementCount === 0 && analysis.runtimeFeatures.animationElementCount === 0 ? (
              <li>
                <span className="risk-badge info">profile</span>
                <span>This file does not currently depend on runtime media or animation features for export behavior.</span>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="focus-card section-card">
          <h3>Normalization opportunities</h3>
          <ul className="tag-list compact">
            <li>
              <span>Shape primitives</span>
              <strong>{analysis?.opportunities.primitiveShapeCount ?? 0}</strong>
            </li>
            <li>
              <span>Text elements</span>
              <strong>{analysis?.opportunities.convertibleTextCount ?? 0}</strong>
            </li>
            <li>
              <span>Blocked text</span>
              <strong>{analysis?.opportunities.blockedTextCount ?? 0}</strong>
            </li>
            <li>
              <span>Direct transforms</span>
              <strong>{analysis?.opportunities.directTransformCount ?? 0}</strong>
            </li>
            <li>
              <span>Container transforms</span>
              <strong>{analysis?.opportunities.containerTransformCount ?? 0}</strong>
            </li>
          </ul>
        </section>
      </>
    );
  }

  function renderInspectorContent() {
    switch (inspectorTab) {
      case 'selection':
        return (
          <div className="inspector-stack tabbed-stack">
            <section className="focus-card section-card inspector-card-fill">
              <div className="section-header-inline selected-element-header" data-fit-container>
                <h3>Selected element</h3>
                <button
                  className="ghost-button selected-element-toggle"
                  type="button"
                  aria-expanded={!isSelectedElementPanelCollapsed}
                  onClick={() => setIsSelectedElementPanelCollapsed((current) => !current)}
                >
                  {isSelectedElementPanelCollapsed ? 'Expand details' : 'Collapse details'}
                </button>
              </div>
              {selectedNode ? (
                <div className="selection-card">
                  <p className="selection-tag">{selectedNode.name}</p>
                  <p className="selection-copy">{selectedNode.textPreview || 'No direct text content.'}</p>
                  {selectedPreviewNodeCount > 1 ? (
                    <p className="selection-copy selection-group-note">{selectedPreviewNodeCount} preview elements are selected. The inspector is showing the most recently inspected element.</p>
                  ) : null}
                  {animationTargetPaths.includes(selectedNode.path) ? (
                    <p className="selection-copy selection-note">Included in the current animation target set.</p>
                  ) : null}
                  {!isSelectedElementPanelCollapsed ? (
                    <>
                      <div className="selection-animations-block">
                        <p className="selection-subtitle">Animations on this element</p>
                        <ul className="warning-list compact-note-list animation-summary-list">
                          {selectedNodeAnimations.length > 0 ? (
                            selectedNodeAnimations.map((animation, index) => (
                              <li key={`${animation.nodeName}-${animation.label}-${index}`} data-fit-container>
                                <button
                                  className="inline-list-button animation-summary-button"
                                  type="button"
                                  onClick={() => {
                                    setSelectionFacet('animate');
                                    loadAnimationIntoEditor(selectedNode.path, animation.index);
                                  }}
                                >
                                  <span className={`risk-badge ${animation.isWorkbenchAuthored ? 'info' : 'warning'}`}>
                                    {animation.isWorkbenchAuthored ? 'workbench' : 'native'}
                                  </span>
                                  <span>
                                    <strong>{animation.label}</strong>
                                    <br />
                                    {animation.detail}
                                    {animation.duration ? ` • ${animation.duration}` : ''}
                                    {animation.begin ? ` • begins ${animation.begin}` : ''}
                                    {animation.repeatCount ? ` • repeats ${animation.repeatCount}` : ''}
                                  </span>
                                </button>
                              </li>
                            ))
                          ) : (
                            <li data-fit-container>
                              <span className="risk-badge info">clear</span>
                              <span>No direct animation children are attached to this element.</span>
                            </li>
                          )}
                        </ul>
                      </div>
                      <ul className="attribute-list">
                        {Object.entries(selectedNode.attributes).length > 0 ? (
                          Object.entries(selectedNode.attributes).slice(0, 10).map(([name, value]) => (
                            <li key={name} data-fit-container>
                              <span>{name}</span>
                              <strong>{value}</strong>
                            </li>
                          ))
                        ) : (
                          <li data-fit-container>
                            <span>No element attributes found.</span>
                            <strong>0</strong>
                          </li>
                        )}
                      </ul>
                    </>
                  ) : (
                    <p className="selection-copy selection-collapsed-note">Details are collapsed. Expand this card to inspect attributes and attached animations.</p>
                  )}
                </div>
              ) : (
                <p className="selection-copy">Select an element in the preview to inspect it here.</p>
              )}
            </section>

            <section className="focus-card section-card inspector-card-fill">
              <div className="selection-facet-tabs" role="tablist" aria-label="Selected element tools">
                {(Object.keys(selectionFacetLabels) as SelectionFacet[]).map((facet) => (
                  <button
                    key={facet}
                    id={getSelectionFacetTabButtonId(facet)}
                    className={`selection-facet-tab${selectionFacet === facet ? ' active' : ''}`}
                    type="button"
                    role="tab"
                    tabIndex={selectionFacet === facet ? 0 : -1}
                    aria-selected={selectionFacet === facet}
                    aria-controls={getSelectionFacetTabPanelId()}
                    onClick={() => setSelectionFacet(facet)}
                    onKeyDown={(event) => handleSelectionFacetKeyDown(event, facet)}
                  >
                    {selectionFacetLabels[facet]}
                  </button>
                ))}
              </div>

              <div
                id={getSelectionFacetTabPanelId()}
                className="selection-facet-panel"
                role="tabpanel"
                aria-labelledby={getSelectionFacetTabButtonId(selectionFacet)}
                tabIndex={0}
              >
                {selectionFacet === 'style'
                  ? renderStyleFacetSection()
                  : selectionFacet === 'animate'
                    ? renderAnimationSection()
                    : renderInteractionSection()}
              </div>
            </section>
          </div>
        );
      case 'warnings':
        return (
          <div className="inspector-stack tabbed-stack">
            <section className="focus-card section-card">
              <h3>Risk scan</h3>
              {analysis?.risks.some((risk) => risk.nodeIds.length > 0) ? (
                <p className="repair-note">Hover a risk entry to spotlight affected nodes in the preview.</p>
              ) : null}
              <ul className="warning-list risk-list">
                {analysis && analysis.risks.length > 0 ? (
                  analysis.risks.map((risk) => (
                    <li
                      key={risk.message}
                      className={risk.nodeIds.length > 0 ? 'interactive-risk-item' : undefined}
                      onMouseEnter={() => setPreviewHover(risk.nodeIds)}
                      onMouseLeave={clearPreviewHover}
                      onFocus={() => setPreviewHover(risk.nodeIds)}
                      onBlur={clearPreviewHover}
                    >
                      <span className={`risk-badge ${risk.severity}`}>{risk.severity}</span>
                      <span>{risk.message}</span>
                    </li>
                  ))
                ) : (
                  <li>
                    <span className="risk-badge info">clear</span>
                    <span>No structural risks detected yet.</span>
                  </li>
                )}
              </ul>
            </section>

            <section className="focus-card section-card">
              <h3>Preview warnings</h3>
              <ul className="warning-list">
                {parseError ? (
                  <li>
                    <span className="risk-badge warning">error</span>
                    <span>{parseError}</span>
                  </li>
                ) : analysis && analysis.warnings.length > 0 ? (
                  analysis.warnings.map((warning) => (
                    <li key={warning}>
                      <span className="risk-badge info">preview</span>
                      <span>{warning}</span>
                    </li>
                  ))
                ) : (
                  <li>
                    <span className="risk-badge info">clear</span>
                    <span>No preview sanitization warnings for this file.</span>
                  </li>
                )}
              </ul>
            </section>
          </div>
        );
      case 'overview':
      default:
        return (
          <div className="inspector-stack tabbed-stack">
            {activeSection === 'repair' || activeSection === 'export' ? renderReadinessOverview() : null}
            <section className="focus-card metrics-card section-card">
              <h3>Document stats</h3>
              <dl className="metrics-grid compact-metrics" data-fit-container data-fit-mode="children">
                <div>
                  <dt>Root</dt>
                  <dd>{analysis?.rootName ?? 'n/a'}</dd>
                </div>
                <div>
                  <dt>Elements</dt>
                  <dd>{analysis?.totalElements ?? 0}</dd>
                </div>
                <div>
                  <dt>ViewBox</dt>
                  <dd>{analysis?.viewBox ?? 'n/a'}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{analysis ? `${analysis.width} × ${analysis.height}` : 'n/a'}</dd>
                </div>
                <div>
                  <dt>Chars</dt>
                  <dd>{analysis?.sourceLength ?? source.length}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{parseError ? 'Needs repair' : 'Parsed'}</dd>
                </div>
              </dl>
            </section>

            <section className="focus-card section-card">
              <h3>Top elements</h3>
              <ul className="tag-list compact">
                {topTags.length > 0 ? topTags.map(([tag, count]) => (
                  <li key={tag}>
                    <span>{tag}</span>
                    <strong>{count}</strong>
                  </li>
                )) : (
                  <li>
                    <span>No parsed elements yet</span>
                    <strong>0</strong>
                  </li>
                )}
              </ul>
            </section>

            <section className="focus-card section-card">
              <h3>Featured tags</h3>
              <ul className="tag-list compact">
                {featuredTags.map((tag) => (
                  <li key={tag}>
                    <span>{tag}</span>
                    <strong>{analysis?.tagCounts[tag] ?? 0}</strong>
                  </li>
                ))}
              </ul>
            </section>

            <section className="focus-card section-card">
              <h3>Runtime features</h3>
              <ul className="tag-list compact">
                <li>
                  <span>Animations</span>
                  <strong>{analysis?.runtimeFeatures.animationElementCount ?? 0}</strong>
                </li>
                <li>
                  <span>Media</span>
                  <strong>{analysis?.runtimeFeatures.mediaElementCount ?? 0}</strong>
                </li>
                <li>
                  <span>Links</span>
                  <strong>{analysis?.runtimeFeatures.linkElementCount ?? 0}</strong>
                </li>
                <li>
                  <span>Local refs</span>
                  <strong>{analysis?.runtimeFeatures.localReferenceCount ?? 0}</strong>
                </li>
                <li>
                  <span>External refs</span>
                  <strong>{analysis?.runtimeFeatures.externalReferenceCount ?? 0}</strong>
                </li>
                <li>
                  <span>Profile</span>
                  <strong>{analysis?.runtimeFeatures.baseProfile ?? 'full'}</strong>
                </li>
              </ul>
            </section>

            <section className="focus-card section-card">
              <h3>Defs and references</h3>
              <ul className="tag-list compact">
                <li>
                  <span>Defs</span>
                  <strong>{analysis?.inventory.defsCount ?? 0}</strong>
                </li>
                <li>
                  <span>Gradients</span>
                  <strong>{((analysis?.inventory.linearGradientCount ?? 0) + (analysis?.inventory.radialGradientCount ?? 0))}</strong>
                </li>
                <li>
                  <span>Gradient stops</span>
                  <strong>{analysis?.inventory.stopCount ?? 0}</strong>
                </li>
                <li>
                  <span>Style blocks</span>
                  <strong>{analysis?.inventory.styleBlockCount ?? 0}</strong>
                </li>
                <li>
                  <span>Use refs</span>
                  <strong>{analysis?.inventory.useCount ?? 0}</strong>
                </li>
                <li>
                  <span>External refs</span>
                  <strong>{analysis?.inventory.externalReferenceCount ?? 0}</strong>
                </li>
              </ul>
            </section>

            <section className="focus-card section-card">
              <h3>Authoring metadata</h3>
              <ul className="tag-list compact">
                <li>
                  <span>Metadata nodes</span>
                  <strong>{analysis?.authoringMetadata.metadataElementCount ?? 0}</strong>
                </li>
                <li>
                  <span>Namespaced nodes</span>
                  <strong>{analysis?.authoringMetadata.namespacedNodeCount ?? 0}</strong>
                </li>
                <li>
                  <span>Namespaced attrs</span>
                  <strong>{analysis?.authoringMetadata.namespacedAttributeCount ?? 0}</strong>
                </li>
              </ul>
              <ul className="warning-list compact-note-list">
                {analysis && analysis.authoringMetadata.namespaceCounts.length > 0 ? (
                  analysis.authoringMetadata.namespaceCounts.map((entry) => (
                    <li key={entry.prefix}>
                      <span>{entry.prefix}</span>
                      <strong>{entry.count}</strong>
                    </li>
                  ))
                ) : (
                  <li>
                    <span>No authoring-specific namespace usage detected.</span>
                    <strong>0</strong>
                  </li>
                )}
              </ul>
            </section>
          </div>
        );
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>SVG Workbench</h1>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" type="button" onClick={() => setIsSettingsOpen(true)}>
            Settings
          </button>
          <button className="ghost-button resources-trigger" type="button" onClick={() => setIsResourcesOpen(true)}>
            Resources
          </button>
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept=".svg,image/svg+xml"
            onChange={handleFileChange}
            hidden
          />
          <input
            ref={rasterInputRef}
            id={rasterInputId}
            type="file"
            accept={rasterTraceAccept}
            onChange={handleRasterFileChange}
            hidden
          />
          <input
            ref={fontInputRef}
            id={fontInputId}
            type="file"
            accept=".ttf,.otf,.woff,font/ttf,font/otf,font/woff"
            multiple
            onChange={handleFontUpload}
            hidden
          />
          <button className="ghost-button" type="button" onClick={() => fileInputRef.current?.click()}>
            Open SVG
          </button>
          <button className="ghost-button" type="button" onClick={() => rasterInputRef.current?.click()}>
            Trace raster
          </button>
          <button className="primary-button" type="button" onClick={() => {
            loadSvgSource(sampleSvg, 'sample.svg');
          }}>
            Load Sample
          </button>
          <div className="preview-workflow-bar topbar-workflow-bar" role="toolbar" aria-label="Page actions">
            <details className="preview-workflow-menu">
              <summary className="preview-workflow-trigger">
                <span className="preview-workflow-label">Download</span>
                <span className="preview-workflow-caret" aria-hidden="true">+</span>
              </summary>
              <div className="preview-workflow-menu-list" role="group" aria-label="Download actions">
                <button className="ghost-button preview-workflow-button" type="button" onClick={(event) => handlePreviewWorkflowAction(event, () => downloadExportVariant('current'))}>
                  Current
                </button>
                <button className="ghost-button preview-workflow-button" type="button" onClick={(event) => handlePreviewWorkflowAction(event, () => downloadExportVariant('safe'))} disabled={!normalizedExport}>
                  Geometry-safe
                </button>
              </div>
            </details>
            <details className="preview-workflow-menu">
              <summary className="preview-workflow-trigger">
                <span className="preview-workflow-label">Share</span>
                <span className="preview-workflow-caret" aria-hidden="true">+</span>
              </summary>
              <div className="preview-workflow-menu-list" role="group" aria-label="Share actions">
                <button className="ghost-button preview-workflow-button" type="button" onClick={(event) => handlePreviewWorkflowAction(event, () => copyExportVariant('current'))}>
                  Current
                </button>
                <button className="ghost-button preview-workflow-button" type="button" onClick={(event) => handlePreviewWorkflowAction(event, () => copyExportVariant('safe'))} disabled={!normalizedExport}>
                  Geometry-safe
                </button>
              </div>
            </details>
          </div>
        </div>
      </header>

      {isResourcesOpen ? (
        <div
          className="resources-modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeResourcesModal();
            }
          }}
        >
          <section className="resources-modal panel" role="dialog" aria-modal="true" aria-labelledby={resourcesDialogTitleId}>
            <div className="resources-modal-header">
              <div>
                <p className="eyebrow resources-modal-eyebrow">Workshop resources</p>
                <h2 id={resourcesDialogTitleId}>Workshop Resources</h2>
              </div>
              <button className="ghost-button resources-close-button" type="button" onClick={closeResourcesModal}>
                Close
              </button>
            </div>
            <p className="resources-modal-copy">
              Quick access to example assets, Blender-side tooling, and the project community channel.
            </p>
            <div className="resources-grid">
              {resourceCards.map((resource) => (
                <a
                  key={resource.id}
                  className="resource-card"
                  href={resource.href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={closeResourcesModal}
                >
                  <span className="resource-card-kicker">Resource</span>
                  <strong>{resource.title}</strong>
                  <span>{resource.description}</span>
                  {resource.note ? <small>{resource.note}</small> : null}
                </a>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {isSettingsOpen ? (
        <div
          className="resources-modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeSettingsModal();
            }
          }}
        >
          <section className="resources-modal panel" role="dialog" aria-modal="true" aria-labelledby={settingsDialogTitleId}>
            <div className="resources-modal-header">
              <div>
                <p className="eyebrow resources-modal-eyebrow">Workbench settings</p>
                <h2 id={settingsDialogTitleId}>Workbench Settings</h2>
              </div>
              <button className="ghost-button resources-close-button" type="button" onClick={closeSettingsModal}>
                Close
              </button>
            </div>
            {renderSelectionStyleSection()}
          </section>
        </div>
      ) : null}

      <main className={`workspace-grid${isLeftCollapsed ? ' left-collapsed' : ''}`}>
        <aside className={`panel tool-panel side-panel${isLeftCollapsed ? ' collapsed' : ''}`}>
          <div className="side-panel-header">
            {!isLeftCollapsed ? (
              <div>
                <p className="eyebrow">Workspace</p>
                <h2>{primaryNavItems.find((item) => item.id === activeSection)?.label}</h2>
              </div>
            ) : null}
            <button
              className="collapse-button"
              type="button"
              onClick={() => setIsLeftCollapsed((current) => !current)}
              aria-label={isLeftCollapsed ? 'Expand main navigation' : 'Collapse main navigation'}
            >
              {isLeftCollapsed ? '>' : '<'}
            </button>
          </div>

          <nav className="tool-list" aria-label="Primary tool groups">
            {primaryNavItems.map((item) => {
              const isActive = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  className={`tool-item${isActive ? ' active' : ''}${isLeftCollapsed ? ' compact' : ''}`}
                  type="button"
                  onClick={() => selectSection(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.label}
                  title={item.label}
                >
                  <span className="tool-item-short">{item.shortLabel}</span>
                  {!isLeftCollapsed ? <span className="tool-item-label">{item.label}</span> : null}
                </button>
              );
            })}
          </nav>

          {!isLeftCollapsed ? <div className="side-panel-body">{renderActiveSection()}</div> : null}
        </aside>

        <div className={`workspace-stage inspector-${rightPanelMode}`}>
          <section className="panel preview-panel">
            <div className="panel-heading preview-heading">
              <div>
                <p className="eyebrow">Live preview</p>
                <h2>Preview workspace</h2>
              </div>
              <div className="preview-tabs" role="tablist" aria-label="Preview modes">
                <button
                  id={getPreviewTabButtonId('preview')}
                  className={`preview-tab ${previewTab === 'preview' ? 'active' : ''}`}
                  type="button"
                  role="tab"
                  tabIndex={previewTab === 'preview' ? 0 : -1}
                  aria-selected={previewTab === 'preview'}
                  aria-controls={getPreviewTabPanelId()}
                  onClick={() => setPreviewTab('preview')}
                  onKeyDown={(event) => handlePreviewTabKeyDown(event, 'preview')}
                >
                  Preview
                </button>
                <button
                  id={getPreviewTabButtonId('source')}
                  className={`preview-tab ${previewTab === 'source' ? 'active' : ''}`}
                  type="button"
                  role="tab"
                  tabIndex={previewTab === 'source' ? 0 : -1}
                  aria-selected={previewTab === 'source'}
                  aria-controls={getPreviewTabPanelId()}
                  onClick={() => setPreviewTab('source')}
                  onKeyDown={(event) => handlePreviewTabKeyDown(event, 'source')}
                >
                  Markup
                </button>
              </div>
            </div>

            <div className="preview-toolbar" role="toolbar" aria-label="Preview navigation controls">
              <div className="preview-control-group">
                <button className="ghost-button preview-control" type="button" onClick={() => zoomPreview(-PREVIEW_SCALE_STEP)} disabled={!isPreviewInteractive}>
                  Zoom out
                </button>
                <p className="preview-zoom-readout" aria-live="polite">{Math.round(previewViewport.scale * 100)}%</p>
                <button className="ghost-button preview-control" type="button" onClick={() => zoomPreview(PREVIEW_SCALE_STEP)} disabled={!isPreviewInteractive}>
                  Zoom in
                </button>
                <button className="ghost-button preview-control" type="button" onClick={resetPreviewViewport} disabled={!isPreviewInteractive}>
                  Reset view
                </button>
              </div>
              <div className="preview-control-group">
                <button className="ghost-button preview-control" type="button" onClick={() => panPreview(0, -PREVIEW_PAN_STEP)} disabled={!isPreviewInteractive}>
                  Pan up
                </button>
                <button className="ghost-button preview-control" type="button" onClick={() => panPreview(-PREVIEW_PAN_STEP, 0)} disabled={!isPreviewInteractive}>
                  Pan left
                </button>
                <button className="ghost-button preview-control" type="button" onClick={() => panPreview(PREVIEW_PAN_STEP, 0)} disabled={!isPreviewInteractive}>
                  Pan right
                </button>
                <button className="ghost-button preview-control" type="button" onClick={() => panPreview(0, PREVIEW_PAN_STEP)} disabled={!isPreviewInteractive}>
                  Pan down
                </button>
              </div>
              <div className="preview-control-group timeline-control-group">
                <button className="ghost-button preview-control" type="button" onClick={playPreviewTimeline} disabled={!isPreviewInteractive || isPreviewTimelinePlaying}>
                  Play
                </button>
                <button className="ghost-button preview-control" type="button" onClick={pausePreviewTimeline} disabled={!isPreviewInteractive || !isPreviewTimelinePlaying}>
                  Pause
                </button>
                <button className="ghost-button preview-control" type="button" onClick={restartPreviewTimeline} disabled={!isPreviewInteractive}>
                  Restart
                </button>
                <label className="timeline-scrubber">
                  <span>{previewTimelineSeconds.toFixed(1)}s</span>
                  <input
                    aria-label="Preview timeline"
                    type="range"
                    min="0"
                    max={previewTimelineMax.toFixed(1)}
                    step="0.1"
                    value={Math.min(previewTimelineSeconds, previewTimelineMax)}
                    onChange={(event) => scrubPreviewTimeline(Number(event.target.value))}
                    onInput={(event) => scrubPreviewTimeline(Number((event.target as HTMLInputElement).value))}
                    disabled={!isPreviewInteractive}
                  />
                </label>
              </div>
            </div>

            <div
              id={getPreviewTabPanelId()}
              className={`preview-surface ${isDragging ? 'is-dragging' : ''}`}
              role="tabpanel"
              aria-labelledby={getPreviewTabButtonId(previewTab)}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDragging(false);
              }}
              onDrop={handleDrop}
              onPointerDown={handlePreviewPointerDown}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerUp}
              onPointerCancel={stopPreviewPan}
              onLostPointerCapture={stopPreviewPan}
              onWheel={handlePreviewWheel}
              aria-label="SVG preview area"
            >
              <div className="preview-artboard">
                <div className="artboard-grid" />
                {previewTab === 'preview' ? (
                  parseError ? (
                    <div className="empty-state error-state">
                      <strong>Parse error</strong>
                      <p>{parseError}</p>
                    </div>
                  ) : (
                    <div
                      className={`preview-viewport${isPanningPreview ? ' is-panning' : ''}`}
                      aria-label="Preview viewport"
                      style={{ transform: `translate(${previewViewport.offsetX}px, ${previewViewport.offsetY}px) scale(${previewViewport.scale})` }}
                    >
                      <div
                        ref={previewFrameRef}
                        className="svg-preview-frame"
                        data-selection-style={selectionAppearancePreset}
                        style={selectionAppearanceStyle}
                        dangerouslySetInnerHTML={{ __html: analysis?.previewMarkup ?? '' }}
                      />
                    </div>
                  )
                ) : (
                  <pre className="markup-preview">{deferredSource}</pre>
                )}
              </div>
            </div>

            <div className="preview-overlay compact-overlay">
              <div>
                <span className="preview-kicker">{primaryNavItems.find((item) => item.id === activeSection)?.label}</span>
                <strong>{statusSummary}</strong>
              </div>
              <p>
                {activeSection === 'file'
                  ? 'Edit the source directly, drop in a new SVG, or queue raster art for browser-side tracing. Preview sanitization strips executable nodes before rendering.'
                  : activeSection === 'repair'
                    ? 'Run targeted repairs from the left rail, then review export readiness and blockers on the right while panning or zooming detailed artwork.'
                    : 'Choose an export preset on the left and use the selection inspector for style, animation, and interaction authoring.'}
              </p>
            </div>
          </section>

          <aside className={`panel inspector-panel side-panel${isRightCollapsed ? ' collapsed' : ''}`} ref={inspectorPanelRef}>
            <div className="side-panel-header">
              {!isRightCollapsed ? (
                <div>
                  <p className="eyebrow">Inspection</p>
                  <h2>{inspectorTabLabels[inspectorTab]}</h2>
                </div>
              ) : null}
              <button
                className="collapse-button"
                type="button"
                onClick={() => setRightPanelMode((current) => getNextRightPanelMode(current))}
                aria-label={getRightPanelToggleLabel(rightPanelMode)}
                aria-expanded={!isRightCollapsed}
              >
                {getRightPanelToggleIcon(rightPanelMode)}
              </button>
            </div>

            {!isRightCollapsed ? (
              <>
                <div className="inspector-tabs" role="tablist" aria-label="Inspection sections" data-fit-container>
                  {availableInspectorTabs.map((tab) => (
                    <button
                      key={tab}
                      id={getInspectorTabButtonId(tab)}
                      className={`inspector-tab${inspectorTab === tab ? ' active' : ''}`}
                      type="button"
                      role="tab"
                      tabIndex={inspectorTab === tab ? 0 : -1}
                      aria-selected={inspectorTab === tab}
                      aria-controls={getInspectorTabPanelId()}
                      onClick={() => setInspectorTab(tab)}
                      onKeyDown={(event) => handleInspectorTabKeyDown(event, tab)}
                    >
                      {inspectorTabLabels[tab]}
                    </button>
                  ))}
                </div>

                <div
                  id={getInspectorTabPanelId()}
                  className="side-panel-body inspector-panel-body"
                  role="tabpanel"
                  aria-labelledby={getInspectorTabButtonId(inspectorTab)}
                  tabIndex={0}
                >
                  {renderInspectorContent()}
                </div>
              </>
            ) : null}
          </aside>
        </div>
      </main>
    </div>
  );
}

export default App;
