import { useDeferredValue, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { sampleSvg } from './lib/sample-svg';
import { buildAnalysis } from './lib/svg-analysis';
import type { Analysis } from './lib/svg-analysis';
import { buildExportFileName, copySvgSourceToClipboard, downloadSvgSource, getExportVariantLabel } from './lib/svg-export';
import type { ExportVariant } from './lib/svg-export';
import { parseUploadedFontFile } from './lib/svg-fonts';
import type { FontMapping, TextConversionOptions, UploadedFontAsset } from './lib/svg-fonts';
import {
  applySafeRepairs,
  bakeContainerTransforms,
  bakeDirectTransforms,
  convertTextToPaths,
  expandUseElements,
  getContainerTransformMessage,
  getStyleInliningMessage,
  getTextConversionMessage,
  getUseExpansionMessage,
  inlineSimpleStyles,
  normalizeShapesToPaths,
} from './lib/svg-normalization';

type PreviewTab = 'preview' | 'source';

type ExportReport = {
  action: 'download' | 'copy';
  variant: ExportVariant;
  fileName: string;
  applied: string[];
  remaining: string[];
};

const exportPresetCards: Array<{ id: ExportVariant; title: string; description: string }> = [
  {
    id: 'current',
    title: 'Current',
    description: 'Download the source exactly as it appears in the editor.',
  },
  {
    id: 'safe',
    title: 'Normalized',
    description: 'Apply the safe repair pipeline before export.',
  },
  {
    id: 'blender',
    title: 'Blender-friendly',
    description: 'Use the normalized geometry-focused export with a Blender-specific preset label.',
  },
];

const modeCards = [
  {
    title: 'Clean And Edit',
    description: 'Normalize structure, inspect SVG content, and prepare portable exports.',
    status: 'Live now',
  },
  {
    title: 'Repair For Blender',
    description: 'Convert risky SVG features into geometry-friendly output for Blender import.',
    status: 'Next pass',
  },
  {
    title: 'Enhance SVG',
    description: 'Author self-contained color systems, animation, and interaction inside the SVG.',
    status: 'Planned',
  },
];

const featuredTags = ['path', 'text', 'image', 'use', 'defs', 'style', 'animate', 'animateTransform', 'set'];

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

function App() {
  const inputId = useId();
  const fontInputId = useId();
  const sourceId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);

  const [source, setSource] = useState(sampleSvg);
  const [fileName, setFileName] = useState('sample.svg');
  const [previewTab, setPreviewTab] = useState<PreviewTab>('preview');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const [exportReport, setExportReport] = useState<ExportReport | null>(null);
  const [selectedExportPreset, setSelectedExportPreset] = useState<ExportVariant>('safe');
  const [uploadedFonts, setUploadedFonts] = useState<UploadedFontAsset[]>([]);
  const [fontMappings, setFontMappings] = useState<FontMapping>({});
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
    const container = previewFrameRef.current;
    if (!container) {
      return;
    }

    container.querySelectorAll('[data-svg-node-selected="true"]').forEach((node) => {
      node.removeAttribute('data-svg-node-selected');
    });

    if (!selectedNodeId) {
      return;
    }

    const selectedNode = container.querySelector(`[data-svg-node-id="${selectedNodeId}"]`);
    if (selectedNode) {
      selectedNode.setAttribute('data-svg-node-selected', 'true');
    }
  }, [analysis?.previewMarkup, selectedNodeId]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const nextSource = typeof reader.result === 'string' ? reader.result : '';
      setSource(nextSource);
      setFileName(file.name);
      setPreviewTab('preview');
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
      setSource(nextSource);
      setFileName(file.name);
      setPreviewTab('preview');
    };
    reader.readAsText(file);
  }

  const topTags = Object.entries(analysis?.tagCounts ?? {})
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8);
  const selectedNode = selectedNodeId && analysis ? analysis.nodesById[selectedNodeId] : null;
  const normalizedExport = (() => {
    try {
      return applySafeRepairs(source, textOptions);
    } catch {
      return null;
    }
  })();
  const safeRepairCount = analysis
    ? analysis.opportunities.primitiveShapeCount
      + analysis.opportunities.convertibleTextCount
      + analysis.opportunities.inlineableStyleRuleCount
      + analysis.opportunities.directTransformCount
      + analysis.opportunities.bakeableContainerTransformCount
      + analysis.opportunities.expandableUseCount
    : 0;

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
      setSource(result.source);

      if (result.changed === 0 && result.skipped === 0) {
        setRepairMessage('No safe repairs were available in this pass.');
      } else {
        const appliedParts = [
          result.details.styleRules > 0 ? `${result.details.styleRules} style rules` : null,
          result.details.textPaths > 0 ? `${result.details.textPaths} text elements` : null,
          result.details.shapes > 0 ? `${result.details.shapes} shapes` : null,
          result.details.directTransforms > 0 ? `${result.details.directTransforms} direct transforms` : null,
          result.details.containerTransforms > 0 ? `${result.details.containerTransforms} container transforms` : null,
          result.details.useExpansions > 0 ? `${result.details.useExpansions} use references` : null,
        ].filter(Boolean);

        const blockedParts = [
          result.details.blockedStyleRules > 0 ? `${result.details.blockedStyleRules} blocked style rules` : null,
          result.details.blockedTexts > 0 ? `${result.details.blockedTexts} blocked text elements` : null,
          result.details.blockedContainers > 0 ? `${result.details.blockedContainers} blocked containers` : null,
          result.details.blockedUses > 0 ? `${result.details.blockedUses} blocked use references` : null,
        ].filter(Boolean);

        const appliedSummary = appliedParts.length > 0 ? `Applied ${appliedParts.join(', ')}.` : 'Applied no safe repairs.';
        const blockedSummary = blockedParts.length > 0 ? ` Left ${blockedParts.join(' and ')} unchanged.` : '';
        setRepairMessage(`${appliedSummary}${blockedSummary}`);
      }

      setPreviewTab('preview');
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to apply safe repairs.');
    }
  }

  function applyStyleInlining() {
    try {
      const result = inlineSimpleStyles(source);
      setSource(result.source);

      if (result.changed > 0 && result.skipped > 0) {
        setRepairMessage(`Inlined ${result.changed} simple style rule${result.changed === 1 ? '' : 's'} and left ${result.skipped} blocked rule${result.skipped === 1 ? '' : 's'} unchanged.`);
      } else if (result.changed > 0) {
        setRepairMessage(`Inlined ${result.changed} simple style rule${result.changed === 1 ? '' : 's'} into element styles.`);
      } else if (result.skipped > 0) {
        setRepairMessage(`No style rules could be inlined safely. ${result.skipped} blocked rule${result.skipped === 1 ? '' : 's'} remain.`);
      } else {
        setRepairMessage('No inlineable style rules were found.');
      }

      setPreviewTab('preview');
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to inline style rules.');
    }
  }

  function applyShapeNormalization() {
    try {
      const result = normalizeShapesToPaths(source);
      setSource(result.source);
      setRepairMessage(
        result.changed > 0
          ? `Converted ${result.changed} shape primitive${result.changed === 1 ? '' : 's'} into path elements.`
          : 'No primitive shapes needed conversion.',
      );
      setPreviewTab('preview');
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to normalize shapes.');
    }
  }

  function applyTextConversion() {
    try {
      const result = convertTextToPaths(source, textOptions);
      setSource(result.source);

      if (result.changed > 0 && result.skipped > 0) {
        setRepairMessage(`Converted ${result.changed} text element${result.changed === 1 ? '' : 's'} to paths and left ${result.skipped} blocked text element${result.skipped === 1 ? '' : 's'} unchanged.`);
      } else if (result.changed > 0) {
        setRepairMessage(`Converted ${result.changed} text element${result.changed === 1 ? '' : 's'} to paths.`);
      } else if (result.skipped > 0) {
        setRepairMessage(`No text elements could be converted. ${result.skipped} blocked text element${result.skipped === 1 ? '' : 's'} remain.`);
      } else {
        setRepairMessage('No text elements needed conversion.');
      }

      setPreviewTab('preview');
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to convert text to paths.');
    }
  }

  function applyTransformBake() {
    try {
      const result = bakeDirectTransforms(source);
      setSource(result.source);
      setRepairMessage(
        result.changed > 0
          ? `Baked ${result.changed} direct transform${result.changed === 1 ? '' : 's'} into geometry.`
          : 'No direct transforms could be baked in this pass.',
      );
      setPreviewTab('preview');
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to bake transforms.');
    }
  }

  function applyContainerTransformBake() {
    try {
      const result = bakeContainerTransforms(source);
      setSource(result.source);

      if (result.changed > 0 && result.skipped > 0) {
        setRepairMessage(`Baked ${result.changed} container transform${result.changed === 1 ? '' : 's'} and left ${result.skipped} blocked container${result.skipped === 1 ? '' : 's'} unchanged.`);
      } else if (result.changed > 0) {
        setRepairMessage(`Baked ${result.changed} container transform${result.changed === 1 ? '' : 's'} into descendant geometry.`);
      } else if (result.skipped > 0) {
        setRepairMessage(`No container transforms could be baked safely. ${result.skipped} blocked container${result.skipped === 1 ? '' : 's'} remain.`);
      } else {
        setRepairMessage('No transformed containers needed baking.');
      }

      setPreviewTab('preview');
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to bake container transforms.');
    }
  }

  function applyUseExpansion() {
    try {
      const result = expandUseElements(source);
      setSource(result.source);

      if (result.changed > 0 && result.skipped > 0) {
        setRepairMessage(`Expanded ${result.changed} <use> reference${result.changed === 1 ? '' : 's'} and left ${result.skipped} blocked reference${result.skipped === 1 ? '' : 's'} unchanged.`);
      } else if (result.changed > 0) {
        setRepairMessage(`Expanded ${result.changed} <use> reference${result.changed === 1 ? '' : 's'} into concrete geometry.`);
      } else if (result.skipped > 0) {
        setRepairMessage(`No <use> references could be expanded safely. ${result.skipped} blocked reference${result.skipped === 1 ? '' : 's'} remain.`);
      } else {
        setRepairMessage('No <use> references needed expansion.');
      }

      setPreviewTab('preview');
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to expand <use> references.');
    }
  }

  function downloadCurrentSvg() {
    const nextFileName = buildExportFileName(fileName, 'current');
    downloadSvgSource(source, nextFileName);
    setExportReport({
      action: 'download',
      variant: 'current',
      fileName: nextFileName,
      applied: ['No automatic repairs applied.'],
      remaining: analysis?.exportReadiness.blockers ?? [],
    });
    setRepairMessage(`Downloaded ${nextFileName}.`);
  }

  function buildPresetExportReport(variant: ExportVariant) {
    if (!normalizedExport) {
      return null;
    }

    const nextFileName = buildExportFileName(fileName, variant);
    const applied = [
      normalizedExport.details.styleRules > 0 ? `${normalizedExport.details.styleRules} style rules inlined` : null,
      normalizedExport.details.textPaths > 0 ? `${normalizedExport.details.textPaths} text elements converted to paths` : null,
      normalizedExport.details.shapes > 0 ? `${normalizedExport.details.shapes} shapes converted to paths` : null,
      normalizedExport.details.directTransforms > 0 ? `${normalizedExport.details.directTransforms} direct transforms baked` : null,
      normalizedExport.details.containerTransforms > 0 ? `${normalizedExport.details.containerTransforms} container transforms baked` : null,
      normalizedExport.details.useExpansions > 0 ? `${normalizedExport.details.useExpansions} use references expanded` : null,
    ].filter((value): value is string => Boolean(value));
    const blockedParts = [
      normalizedExport.details.blockedStyleRules > 0 ? `${normalizedExport.details.blockedStyleRules} blocked style rules` : null,
      normalizedExport.details.blockedTexts > 0 ? `${normalizedExport.details.blockedTexts} blocked text elements` : null,
      normalizedExport.details.blockedContainers > 0 ? `${normalizedExport.details.blockedContainers} blocked containers` : null,
      normalizedExport.details.blockedUses > 0 ? `${normalizedExport.details.blockedUses} blocked use references` : null,
    ].filter((value): value is string => Boolean(value));

    if (variant === 'blender') {
      blockedParts.unshift('Text, raster images, and effects still need manual or future Blender-specific cleanup if present.');
    }

    return {
      action: 'download' as const,
      variant,
      fileName: nextFileName,
      applied: applied.length > 0 ? applied : ['No safe repairs were applied.'],
      remaining: blockedParts,
    };
  }

  async function copyCurrentSvg() {
    const nextFileName = buildExportFileName(fileName, 'current');

    try {
      await copySvgSourceToClipboard(source);
      setExportReport({
        action: 'copy',
        variant: 'current',
        fileName: nextFileName,
        applied: ['No automatic repairs applied.'],
        remaining: analysis?.exportReadiness.blockers ?? [],
      });
      setRepairMessage(`Copied ${nextFileName} to the clipboard.`);
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to copy SVG content to the clipboard.');
    }
  }

  function downloadSelectedPreset() {
    if (selectedExportPreset === 'current') {
      downloadCurrentSvg();
      return;
    }

    const exportDetails = buildPresetExportReport(selectedExportPreset);
    if (!exportDetails || !normalizedExport) {
      setRepairMessage('Unable to build a preset export from invalid SVG markup.');
      return;
    }

    downloadSvgSource(normalizedExport.source, exportDetails.fileName);
    setExportReport(exportDetails);
    const blockedSummary = exportDetails.remaining.length > 0 ? ` ${exportDetails.remaining.join(' and ')} remain.` : '';
    setRepairMessage(`Downloaded ${exportDetails.fileName} with ${normalizedExport.changed} safe repairs applied.${blockedSummary}`);
  }

  async function copySelectedPreset() {
    if (selectedExportPreset === 'current') {
      await copyCurrentSvg();
      return;
    }

    const exportDetails = buildPresetExportReport(selectedExportPreset);
    if (!exportDetails || !normalizedExport) {
      setRepairMessage('Unable to build a preset clipboard export from invalid SVG markup.');
      return;
    }

    try {
      await copySvgSourceToClipboard(normalizedExport.source);
      setExportReport({
        ...exportDetails,
        action: 'copy',
      });
      const blockedSummary = exportDetails.remaining.length > 0 ? ` ${exportDetails.remaining.join(' and ')} remain.` : '';
      setRepairMessage(`Copied ${exportDetails.fileName} to the clipboard with ${normalizedExport.changed} safe repairs applied.${blockedSummary}`);
    } catch (error) {
      setRepairMessage(error instanceof Error ? error.message : 'Unable to copy preset SVG content to the clipboard.');
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
            setSource(sampleSvg);
            setFileName('sample.svg');
            setPreviewTab('preview');
          }}>
            Load Sample
          </button>
        </div>
      </header>

      <main className="workspace-grid">
        <aside className="panel tool-panel">
          <div className="panel-heading">
            <p className="eyebrow">File intake</p>
            <h2>Input</h2>
          </div>

          <nav className="tool-list" aria-label="Primary tool groups">
            <button className="tool-item active" type="button">File</button>
            <button className="tool-item" type="button">Inspect</button>
            <button className="tool-item" type="button">Repair</button>
            <button className="tool-item" type="button">Style</button>
            <button className="tool-item" type="button">Animate</button>
            <button className="tool-item" type="button">Interact</button>
            <button className="tool-item" type="button">Export</button>
          </nav>

          <section className="status-card">
            <p className="status-label">Current file</p>
            <strong>{fileName}</strong>
            <p>
              Parsing runs entirely in the browser with DOMParser for preview prep and svgson for structural inspection.
            </p>
          </section>

          <section className="status-card font-card">
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

          <section className="status-card repair-card">
            <p className="status-label">Repair actions</p>
            <strong>Initial normalization</strong>
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
            {repairMessage ? <p className="repair-feedback">{repairMessage}</p> : null}
          </section>

          <section className="editor-card">
            <label className="editor-label" htmlFor={sourceId}>SVG source</label>
            <textarea
              id={sourceId}
              className="source-editor"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              spellCheck={false}
            />
          </section>
        </aside>

        <section className="panel preview-panel">
          <div className="panel-heading preview-heading">
            <div>
              <p className="eyebrow">Live preview</p>
              <h2>Preview workspace</h2>
            </div>
            <div className="preview-tabs" role="tablist" aria-label="Preview modes">
              <button
                className={`preview-tab ${previewTab === 'preview' ? 'active' : ''}`}
                type="button"
                onClick={() => setPreviewTab('preview')}
              >
                Preview
              </button>
              <button
                className={`preview-tab ${previewTab === 'source' ? 'active' : ''}`}
                type="button"
                onClick={() => setPreviewTab('source')}
              >
                Markup
              </button>
            </div>
          </div>

          <div
            className={`preview-surface ${isDragging ? 'is-dragging' : ''}`}
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
                    ref={previewFrameRef}
                    className="svg-preview-frame"
                    onClick={(event) => {
                      const target = event.target as Element | null;
                      const node = target?.closest('[data-svg-node-id]');
                      const nodeId = node?.getAttribute('data-svg-node-id');
                      if (nodeId) {
                        setSelectedNodeId(nodeId);
                      }
                    }}
                    dangerouslySetInnerHTML={{ __html: analysis?.previewMarkup ?? '' }}
                  />
                )
              ) : (
                <pre className="markup-preview">{deferredSource}</pre>
              )}
            </div>

            <div className="preview-overlay">
              <div>
                <span className="preview-kicker">Pipeline</span>
                <strong>File input → DOMParser sanitize → inline preview → svgson analysis</strong>
              </div>
              <p>
                Drag and drop an SVG here, open a file, or edit the markup directly. Preview rendering strips executable nodes and inline event handlers before insertion.
              </p>
            </div>
          </div>

          <section className="mode-grid" aria-label="Product modes">
            {modeCards.map((mode) => (
              <article className="mode-card" key={mode.title}>
                <span className="mode-badge">{mode.status}</span>
                <h3>{mode.title}</h3>
                <p>{mode.description}</p>
              </article>
            ))}
          </section>
        </section>

        <aside className="panel inspector-panel">
          <div className="panel-heading">
            <p className="eyebrow">Inspection</p>
            <h2>Structure analysis</h2>
          </div>

          <div className="inspector-stack">
            <section className="focus-card metrics-card">
              <h3>Document stats</h3>
              <dl className="metrics-grid">
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

            <section className="focus-card readiness-card">
              <div className="readiness-header">
                <h3>Export readiness</h3>
                <span className={`readiness-badge ${analysis?.exportReadiness.status ?? 'blocked'}`}>
                  {analysis ? getReadinessLabel(analysis.exportReadiness.status) : 'Blocked'}
                </span>
              </div>
              <dl className="metrics-grid readiness-metrics">
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
                    : 'This SVG still has unresolved blockers that need additional repair support or manual editing.'}
              </p>
              <ul className="warning-list readiness-list">
                {analysis?.exportReadiness.autoFixes.map((item) => (
                  <li key={`fix-${item}`}>
                    <span className="risk-badge info">auto-fix</span>
                    <span>{item}</span>
                  </li>
                ))}
                {analysis?.exportReadiness.blockers.map((item) => (
                  <li key={`block-${item}`}>
                    <span className="risk-badge warning">blocked</span>
                    <span>{item}</span>
                  </li>
                ))}
                {analysis && analysis.exportReadiness.autoFixes.length === 0 && analysis.exportReadiness.blockers.length === 0 ? (
                  <li>
                    <span className="risk-badge info">clear</span>
                    <span>No tracked export blockers remain.</span>
                  </li>
                ) : null}
              </ul>
            </section>

            <section className="focus-card export-card">
              <h3>Export</h3>
              <p className="export-copy">Choose an export preset and download the resulting SVG directly from the browser.</p>
              <div className="export-presets" role="tablist" aria-label="Export presets">
                {exportPresetCards.map((preset) => (
                  <button
                    key={preset.id}
                    className={`export-preset ${selectedExportPreset === preset.id ? 'active' : ''}`}
                    type="button"
                    onClick={() => setSelectedExportPreset(preset.id)}
                  >
                    <strong>{preset.title}</strong>
                    <span>{preset.description}</span>
                  </button>
                ))}
              </div>
              <div className="export-actions">
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
                  disabled={selectedExportPreset !== 'current' && !normalizedExport}
                >
                  Download {getExportVariantLabel(selectedExportPreset)}
                </button>
                <button
                  className="primary-button export-button"
                  type="button"
                  onClick={() => void copySelectedPreset()}
                  disabled={selectedExportPreset !== 'current' && !normalizedExport}
                >
                  Copy {getExportVariantLabel(selectedExportPreset)}
                </button>
              </div>
              <ul className="tag-list compact export-list">
                <li>
                  <span>Current file</span>
                  <strong>{buildExportFileName(fileName, 'current')}</strong>
                </li>
                <li>
                  <span>Normalized file</span>
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
                    <strong>{getExportVariantLabel(exportReport.variant)}</strong>
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
            </section>

            <section className="focus-card">
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

            <section className="focus-card">
              <h3>Selected element</h3>
              {selectedNode ? (
                <div className="selection-card">
                  <p className="selection-tag">{selectedNode.name}</p>
                  <p className="selection-copy">{selectedNode.textPreview || 'No direct text content.'}</p>
                  <ul className="attribute-list">
                    {Object.entries(selectedNode.attributes).slice(0, 8).map(([name, value]) => (
                      <li key={name}>
                        <span>{name}</span>
                        <strong>{value}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="selection-copy">No element selected.</p>
              )}
            </section>

            <section className="focus-card">
              <h3>Featured tags</h3>
              <ul className="tag-list">
                {featuredTags.map((tag) => (
                  <li key={tag}>
                    <span>{tag}</span>
                    <strong>{analysis?.tagCounts[tag] ?? 0}</strong>
                  </li>
                ))}
              </ul>
            </section>

            <section className="focus-card">
              <h3>Top elements</h3>
              <ul className="tag-list compact">
                {topTags.length > 0 ? topTags.map(([tag, count]) => (
                  <li key={tag}>
                    <span>{tag}</span>
                    <strong>{count}</strong>
                  </li>
                )) : <li><span>No parsed elements yet</span><strong>0</strong></li>}
              </ul>
            </section>

            <section className="focus-card">
              <h3>Risk scan</h3>
              <ul className="warning-list risk-list">
                {analysis && analysis.risks.length > 0 ? (
                  analysis.risks.map((risk) => (
                    <li key={risk.message}>
                      <span className={`risk-badge ${risk.severity}`}>{risk.severity}</span>
                      <span>{risk.message}</span>
                    </li>
                  ))
                ) : (
                  <li>No structural risks detected yet.</li>
                )}
              </ul>
            </section>

            <section className="focus-card">
              <h3>Preview warnings</h3>
              <ul className="warning-list">
                {parseError ? (
                  <li>{parseError}</li>
                ) : analysis && analysis.warnings.length > 0 ? (
                  analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)
                ) : (
                  <li>No preview sanitization warnings for this file.</li>
                )}
              </ul>
            </section>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
