import { useDeferredValue, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, KeyboardEvent, MouseEvent, PointerEvent, WheelEvent } from 'react';
import { sampleSvg } from './lib/sample-svg';
import { buildAnalysis, getChangedPreviewNodePaths } from './lib/svg-analysis';
import type { Analysis } from './lib/svg-analysis';
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

type PreviewTab = 'preview' | 'source';
type WorkspaceSection = 'file' | 'repair' | 'export';
type InspectorTab = 'overview' | 'selection' | 'warnings';

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

type PrimaryNavId = WorkspaceSection | 'style' | 'animate' | 'interact';

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

const primaryNavItems: Array<{
  id: PrimaryNavId;
  label: string;
  shortLabel: string;
  enabled: boolean;
}> = [
  {
    id: 'file',
    label: 'File',
    shortLabel: 'Fi',
    enabled: true,
  },
  {
    id: 'repair',
    label: 'Repair',
    shortLabel: 'Re',
    enabled: true,
  },
  {
    id: 'style',
    label: 'Style',
    shortLabel: 'St',
    enabled: false,
  },
  {
    id: 'animate',
    label: 'Animate',
    shortLabel: 'An',
    enabled: false,
  },
  {
    id: 'interact',
    label: 'Interact',
    shortLabel: 'Ix',
    enabled: false,
  },
  {
    id: 'export',
    label: 'Export',
    shortLabel: 'Ex',
    enabled: true,
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

const inspectorTabLabels: Record<InspectorTab, string> = {
  overview: 'Overview',
  selection: 'Selection',
  warnings: 'Warnings',
};

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
  const fontInputId = useId();
  const sourceId = useId();
  const inspectorTabsId = useId();
  const previewTabsId = useId();
  const exportPresetTabsId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const inspectorPanelRef = useRef<HTMLElement | null>(null);
  const previewPointerRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
    distance: number;
  } | null>(null);
  const suppressPreviewClickRef = useRef(false);

  const [source, setSource] = useState(sampleSvg);
  const [fileName, setFileName] = useState('sample.svg');
  const [previewTab, setPreviewTab] = useState<PreviewTab>('preview');
  const [previewViewport, setPreviewViewport] = useState<PreviewViewport>(DEFAULT_PREVIEW_VIEWPORT);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredPreviewNodeIds, setHoveredPreviewNodeIds] = useState<string[]>([]);
  const [recentChangePaths, setRecentChangePaths] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanningPreview, setIsPanningPreview] = useState(false);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const [sourceActionMessage, setSourceActionMessage] = useState<string | null>(null);
  const [sourceSelection, setSourceSelection] = useState<SourceSelection>({ start: 0, end: 0 });
  const [exportReport, setExportReport] = useState<ExportReport | null>(null);
  const [selectedExportPreset, setSelectedExportPreset] = useState<ExportVariant>('safe');
  const [uploadedFonts, setUploadedFonts] = useState<UploadedFontAsset[]>([]);
  const [fontMappings, setFontMappings] = useState<FontMapping>({});
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('file');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview');
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const deferredSource = useDeferredValue(source);
  const textOptions: TextConversionOptions = {
    uploadedFonts,
    fontMappings,
  };

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
    if (isRightCollapsed) {
      return;
    }

    const sync = () => syncFitContainers(inspectorPanelRef.current);

    sync();
    window.addEventListener('resize', sync);

    return () => {
      window.removeEventListener('resize', sync);
    };
  }, [activeSection, analysis, inspectorTab, isRightCollapsed, parseError, selectedNodeId]);

  useEffect(() => {
    const container = previewFrameRef.current;
    if (!container) {
      return;
    }

    container.querySelectorAll('[data-svg-node-selected="true"]').forEach((node) => {
      node.removeAttribute('data-svg-node-selected');
    });
    container.querySelectorAll('[data-svg-node-hovered="true"]').forEach((node) => {
      node.removeAttribute('data-svg-node-hovered');
    });
    container.querySelectorAll('[data-svg-node-changed="true"]').forEach((node) => {
      node.removeAttribute('data-svg-node-changed');
    });

    hoveredPreviewNodeIds.forEach((nodeId) => {
      const hoveredNode = container.querySelector(`[data-svg-node-id="${nodeId}"]`);
      if (hoveredNode) {
        hoveredNode.setAttribute('data-svg-node-hovered', 'true');
      }
    });

    const changedNodes = analysis
      ? Object.values(analysis.nodesById).filter((node) => recentChangePaths.includes(node.path)).slice(0, 8)
      : [];

    changedNodes.forEach((node) => {
      const changedNode = container.querySelector(`[data-svg-node-id="${node.id}"]`);
      if (changedNode) {
        changedNode.setAttribute('data-svg-node-changed', 'true');
      }
    });

    if (selectedNodeId) {
      const selectedPreviewNode = container.querySelector(`[data-svg-node-id="${selectedNodeId}"]`);
      if (selectedPreviewNode) {
        selectedPreviewNode.setAttribute('data-svg-node-selected', 'true');
      }
    }
  }, [analysis, hoveredPreviewNodeIds, recentChangePaths, selectedNodeId]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const nextSource = typeof reader.result === 'string' ? reader.result : '';
      loadSvgSource(nextSource, file.name);
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const nextSource = typeof reader.result === 'string' ? reader.result : '';
      loadSvgSource(nextSource, file.name);
    };
    reader.readAsText(file);
  }

  const topTags = Object.entries(analysis?.tagCounts ?? {})
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8);
  const availableInspectorTabs = inspectorTabsBySection[activeSection];
  const selectedNode = selectedNodeId && analysis ? analysis.nodesById[selectedNodeId] : null;
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

  function selectSection(section: WorkspaceSection) {
    setActiveSection(section);
    setInspectorTab(defaultInspectorTabBySection[section]);
  }

  function inspectSelectedNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setInspectorTab('selection');
  }

  function getInspectorTabButtonId(tab: InspectorTab) {
    return `${inspectorTabsId}-${tab}-tab`;
  }

  function getInspectorTabPanelId() {
    return `${inspectorTabsId}-panel`;
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

  function resolvePreviewNodeId(target: EventTarget | null, clientX: number, clientY: number) {
    const targetElement = target instanceof Element ? target : null;
    const directNodeId = targetElement?.closest('[data-svg-node-id]')?.getAttribute('data-svg-node-id');
    if (directNodeId) {
      return directNodeId;
    }

    const previewDocument = previewFrameRef.current?.ownerDocument;
    const fallbackTarget = previewDocument?.elementFromPoint(clientX, clientY);
    return fallbackTarget?.closest('[data-svg-node-id]')?.getAttribute('data-svg-node-id') ?? null;
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

    const nodeId = resolvePreviewNodeId(event.target, event.clientX, event.clientY);
    if (nodeId) {
      inspectSelectedNode(nodeId);
    }
  }

  function handlePreviewWheel(event: WheelEvent<HTMLDivElement>) {
    if (!isPreviewInteractive) {
      return;
    }

    event.preventDefault();
    zoomPreview(event.deltaY < 0 ? PREVIEW_SCALE_STEP : -PREVIEW_SCALE_STEP);
  }

  function renderFileSection() {
    return (
      <>
        <section className="status-card compact-card">
          <p className="status-label">Current file</p>
          <strong>{fileName}</strong>
          <p>{statusSummary}</p>
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
          <section className="focus-card section-card inspector-card-fill">
            <h3>Selected element</h3>
            {selectedNode ? (
              <div className="selection-card">
                <p className="selection-tag">{selectedNode.name}</p>
                <p className="selection-copy">{selectedNode.textPreview || 'No direct text content.'}</p>
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
              </div>
            ) : (
              <p className="selection-copy">Select an element in the preview to inspect it here.</p>
            )}
          </section>
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
          <p className="eyebrow">Client-only SVG toolchain</p>
          <h1>SVG Workbench</h1>
        </div>
        <div className="topbar-actions">
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept=".svg,image/svg+xml"
            onChange={handleFileChange}
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

      <main className={`workspace-grid${isLeftCollapsed ? ' left-collapsed' : ''}${isRightCollapsed ? ' right-collapsed' : ''}`}>
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
                  className={`tool-item${isActive ? ' active' : ''}${!item.enabled ? ' disabled' : ''}${isLeftCollapsed ? ' compact' : ''}`}
                  type="button"
                  onClick={() => {
                    if (item.enabled) {
                      selectSection(item.id as WorkspaceSection);
                    }
                  }}
                  disabled={!item.enabled}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.enabled ? item.label : `${item.label} not available yet`}
                  title={!item.enabled ? 'Not connected yet' : item.label}
                >
                  <span className="tool-item-short">{item.shortLabel}</span>
                  {!isLeftCollapsed ? <span className="tool-item-label">{item.label}</span> : null}
                  {!isLeftCollapsed && !item.enabled ? <span className="tool-item-state">Soon</span> : null}
                </button>
              );
            })}
          </nav>

          {!isLeftCollapsed ? <div className="side-panel-body">{renderActiveSection()}</div> : null}
        </aside>

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
                ? 'Edit the source directly or drop in a new SVG. Preview sanitization strips executable nodes before rendering.'
                : activeSection === 'repair'
                    ? 'Run targeted repairs from the left rail, then review export readiness and blockers on the right while panning or zooming detailed artwork.'
                    : 'Choose an export preset on the left and verify the remaining blockers in the overview tab.'}
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
              onClick={() => setIsRightCollapsed((current) => !current)}
              aria-label={isRightCollapsed ? 'Expand inspection panel' : 'Collapse inspection panel'}
            >
              {isRightCollapsed ? '<' : '>'}
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
          ) : (
            <div className="collapsed-panel-label">Inspect</div>
          )}
        </aside>
      </main>
    </div>
  );
}

export default App;
