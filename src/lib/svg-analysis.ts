import { detectNormalizationOpportunities } from './svg-normalization';
import type { TextConversionOptions } from './svg-fonts';

export type SvgNodeSummary = {
  id: string;
  path: string;
  name: string;
  attributes: Record<string, string>;
  childElementCount: number;
  textPreview: string;
};

export type SvgRisk = {
  severity: 'info' | 'warning';
  message: string;
  nodeIds: string[];
};

export type ExportReadiness = {
  status: 'ready' | 'repairable' | 'blocked';
  autoFixCount: number;
  blockerCount: number;
  autoFixes: string[];
  blockers: string[];
};

export type WorkflowReadinessProfile = {
  status: 'ready' | 'repairable' | 'blocked';
  score: number;
  summary: string;
  strengths: string[];
  autoFixes: string[];
  blockers: string[];
};

export type Analysis = {
  fileName: string;
  sourceLength: number;
  rootName: string;
  viewBox: string;
  width: string;
  height: string;
  totalElements: number;
  tagCounts: Record<string, number>;
  previewMarkup: string;
  warnings: string[];
  risks: SvgRisk[];
  exportReadiness: ExportReadiness;
  workflowReadiness: {
    geometrySafe: WorkflowReadinessProfile;
    runtimeSvg: WorkflowReadinessProfile;
  };
  runtimeFeatures: {
    animationElementCount: number;
    mediaElementCount: number;
    linkElementCount: number;
    localReferenceCount: number;
    externalReferenceCount: number;
    baseProfile: string;
  };
  inventory: {
    defsCount: number;
    linearGradientCount: number;
    radialGradientCount: number;
    stopCount: number;
    styleBlockCount: number;
    useCount: number;
    localReferenceCount: number;
    externalReferenceCount: number;
  };
  authoringMetadata: {
    metadataElementCount: number;
    namespacedNodeCount: number;
    namespacedAttributeCount: number;
    namespaceCounts: Array<{
      prefix: string;
      count: number;
    }>;
  };
  nodesById: Record<string, SvgNodeSummary>;
  rootNodeId: string;
  opportunities: {
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
};

export type AnalysisOpportunities = Analysis['opportunities'];

type SanitizedPreview = {
  markup: string;
  warnings: string[];
  nodesById: Record<string, SvgNodeSummary>;
  rootNodeId: string;
  sanitizedRoot: SVGSVGElement;
};

export type PreviewSnapshot = SanitizedPreview;

function getLocalTagName(element: Element) {
  return element.localName || element.tagName.split(':').at(-1) || element.tagName;
}

function getReferenceAttributeElements(svgRoot: SVGSVGElement) {
  return [svgRoot, ...Array.from(svgRoot.querySelectorAll('*'))].filter((node) => {
    return node.hasAttribute('href') || node.hasAttribute('xlink:href');
  });
}

function parseSvgRoot(source: string) {
  const documentRoot = new DOMParser().parseFromString(source, 'image/svg+xml');
  const parserError = documentRoot.querySelector('parsererror');
  if (parserError) {
    throw new Error(parserError.textContent?.trim() || 'Unable to parse SVG markup.');
  }

  const documentElement = documentRoot.documentElement;
  if (getLocalTagName(documentElement).toLowerCase() !== 'svg') {
    throw new Error('The provided markup does not have an <svg> root element.');
  }

  return documentElement as unknown as SVGSVGElement;
}

function collectTagCounts(svgRoot: SVGSVGElement) {
  const tagCounts: Record<string, number> = {};
  const nodes = [svgRoot, ...Array.from(svgRoot.querySelectorAll('*'))];

  nodes.forEach((node) => {
    const tagName = getLocalTagName(node);
    tagCounts[tagName] = (tagCounts[tagName] ?? 0) + 1;
  });

  return { tagCounts, totalElements: nodes.length };
}

function collectReferenceStats(svgRoot: SVGSVGElement) {
  let localReferenceCount = 0;
  let externalReferenceCount = 0;

  const classifyReferenceValue = (value: string) => {
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
  };

  [svgRoot, ...Array.from(svgRoot.querySelectorAll('*'))].forEach((node) => {
    for (const attributeName of ['href', 'xlink:href']) {
      const value = node.getAttribute(attributeName)?.trim();
      if (!value) {
        continue;
      }

      const referenceType = classifyReferenceValue(value);

      if (referenceType === 'local') {
        localReferenceCount += 1;
      } else if (referenceType === 'external') {
        externalReferenceCount += 1;
      }
    }
  });

  return {
    localReferenceCount,
    externalReferenceCount,
  };
}

function collectRuntimeFeatures(svgRoot: SVGSVGElement) {
  const { localReferenceCount, externalReferenceCount } = collectReferenceStats(svgRoot);

  return {
    animationElementCount: (svgRoot.querySelectorAll('animate').length + svgRoot.querySelectorAll('animateTransform').length + svgRoot.querySelectorAll('set').length),
    mediaElementCount: svgRoot.querySelectorAll('video, audio').length,
    linkElementCount: svgRoot.querySelectorAll('a').length,
    localReferenceCount,
    externalReferenceCount,
    baseProfile: svgRoot.getAttribute('baseProfile') ?? 'full',
  };
}

function collectInventory(svgRoot: SVGSVGElement) {
  const { localReferenceCount, externalReferenceCount } = collectReferenceStats(svgRoot);

  return {
    defsCount: svgRoot.querySelectorAll('defs').length,
    linearGradientCount: svgRoot.querySelectorAll('linearGradient').length,
    radialGradientCount: svgRoot.querySelectorAll('radialGradient').length,
    stopCount: svgRoot.querySelectorAll('stop').length,
    styleBlockCount: svgRoot.querySelectorAll('style').length,
    useCount: svgRoot.querySelectorAll('use').length,
    localReferenceCount,
    externalReferenceCount,
  };
}

function collectAuthoringMetadata(svgRoot: SVGSVGElement) {
  const namespaceCounts = new Map<string, number>();
  let namespacedNodeCount = 0;
  let namespacedAttributeCount = 0;
  const ignoredPrefixes = new Set(['xmlns', 'xml', 'xlink']);

  [svgRoot, ...Array.from(svgRoot.querySelectorAll('*'))].forEach((node) => {
    const nodeName = node.tagName;
    if (nodeName.includes(':')) {
      const prefix = nodeName.split(':')[0];
      if (!ignoredPrefixes.has(prefix)) {
        namespacedNodeCount += 1;
        namespaceCounts.set(prefix, (namespaceCounts.get(prefix) ?? 0) + 1);
      }
    }

    Array.from(node.attributes).forEach((attribute) => {
      if (!attribute.name.includes(':')) {
        return;
      }

      const prefix = attribute.name.split(':')[0];
      if (ignoredPrefixes.has(prefix)) {
        return;
      }

      namespacedAttributeCount += 1;
      namespaceCounts.set(prefix, (namespaceCounts.get(prefix) ?? 0) + 1);
    });
  });

  return {
    metadataElementCount: svgRoot.querySelectorAll('metadata').length,
    namespacedNodeCount,
    namespacedAttributeCount,
    namespaceCounts: Array.from(namespaceCounts.entries())
      .map(([prefix, count]) => ({ prefix, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 6),
  };
}

function summarizeNode(node: Element, id: string, path: string): SvgNodeSummary {
  const attributes = Object.fromEntries(
    Array.from(node.attributes)
      .filter((attribute) => attribute.name !== 'data-svg-node-id' && attribute.name !== 'data-svg-node-selected')
      .map((attribute) => [attribute.name, attribute.value]),
  );

  return {
    id,
    path,
    name: node.tagName,
    attributes,
    childElementCount: node.children.length,
    textPreview: (node.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 120),
  };
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

function getPreviewNodeIds(elements: Iterable<Element>) {
  return Array.from(new Set(Array.from(elements)
    .map((element) => element.getAttribute('data-svg-node-id'))
    .filter((nodeId): nodeId is string => Boolean(nodeId)))).slice(0, 12);
}

function buildRiskList(svgRoot: SVGSVGElement, tagCounts: Record<string, number>, opportunities: Analysis['opportunities']) {
  const risks: SvgRisk[] = [];
  const pushRisk = (severity: SvgRisk['severity'], message: string, elements: Iterable<Element> = []) => {
    risks.push({ severity, message, nodeIds: getPreviewNodeIds(elements) });
  };
  const mediaCount = (tagCounts.video ?? 0) + (tagCounts.audio ?? 0);
  const strokeOnlyElements = [svgRoot, ...Array.from(svgRoot.querySelectorAll('*'))].filter((element) => isStrokeOnlyElement(element));

  if ((tagCounts.text ?? 0) > 0) {
    pushRisk('warning', 'Text elements found. Geometry-only exports may need text-to-path conversion.', svgRoot.querySelectorAll('text'));
  }

  if ((tagCounts.image ?? 0) > 0) {
    pushRisk('warning', 'Embedded raster images found. These will not behave like vector geometry.', svgRoot.querySelectorAll('image'));
  }

  if (mediaCount > 0) {
    pushRisk('warning', `${pluralize(mediaCount, 'media element')} found. Embedded video or audio depends on runtime playback support and is not geometry-safe.`, svgRoot.querySelectorAll('video, audio'));
  }

  if ((tagCounts.use ?? 0) > 0) {
    pushRisk('warning', '<use> references found. Some downstream tools prefer fully expanded geometry.', svgRoot.querySelectorAll('use'));
  }

  if ((tagCounts.style ?? 0) > 0) {
    pushRisk('info', 'Embedded <style> blocks found. Styling may need inlining for strict exports.', svgRoot.querySelectorAll('style'));
  }

  if ((tagCounts.animate ?? 0) + (tagCounts.animateTransform ?? 0) + (tagCounts.set ?? 0) > 0) {
    pushRisk('info', 'Native SVG animation elements found. These are portable in SVG, but not geometry-safe for every downstream tool.', svgRoot.querySelectorAll('animate, animateTransform, set'));
  }

  if ((tagCounts.filter ?? 0) + (tagCounts.mask ?? 0) + (tagCounts.clipPath ?? 0) + (tagCounts.pattern ?? 0) > 0) {
    pushRisk('warning', 'Visual effect elements found. Filters, masks, clip paths, or patterns may need flattening or removal.', svgRoot.querySelectorAll('filter, mask, clipPath, pattern'));
  }

  const transformedNodes = svgRoot.querySelectorAll('[transform]').length;
  if (transformedNodes > 0) {
    pushRisk('warning', `${transformedNodes} transformed node${transformedNodes === 1 ? '' : 's'} found. Transform baking is usually a useful normalization step.`, svgRoot.querySelectorAll('[transform]'));
  }

  const strokeOnlyNodes = strokeOnlyElements.length;
  if (strokeOnlyNodes > 0) {
    const autoFixSummary = opportunities.strokeOutlineCount > 0
      ? ` ${pluralize(opportunities.strokeOutlineCount, 'node')} can be outlined automatically.`
      : '';
    const blockedSummary = opportunities.blockedStrokeOutlineCount > 0
      ? ` ${pluralize(opportunities.blockedStrokeOutlineCount, 'node')} still need manual or future complex outlining.`
      : '';
    pushRisk('info', `${strokeOnlyNodes} stroke-driven node${strokeOnlyNodes === 1 ? '' : 's'} found.${autoFixSummary}${blockedSummary}`, strokeOnlyElements);
  }

  if (opportunities.pathCleanupCount > 0) {
    pushRisk('info', `${pluralize(opportunities.pathCleanupCount, 'path cleanup')} found. Near-open paths, fragment joins, winding repairs, self-intersection stabilization, duplicate geometry, or tiny path noise can be cleaned automatically.`, svgRoot.querySelectorAll('path'));
  }

  if (opportunities.referenceCleanupCount > 0) {
    pushRisk('info', `${pluralize(opportunities.referenceCleanupCount, 'reference cleanup')} found. Broken local refs, invalid href/xlink chains, and non-link external dependency refs can be cleaned automatically.`, getReferenceAttributeElements(svgRoot));
  }

  if (!svgRoot.getAttribute('viewBox')) {
    pushRisk('info', 'No viewBox found. Adding one improves responsive preview behavior and export framing.', [svgRoot]);
  }

  return risks;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildExportReadiness(tagCounts: Record<string, number>, opportunities: Analysis['opportunities']): ExportReadiness {
  const autoFixes: string[] = [];
  const blockers: string[] = [];
  const mediaCount = (tagCounts.video ?? 0) + (tagCounts.audio ?? 0);

  if (opportunities.inlineableStyleRuleCount > 0) {
    autoFixes.push(`${pluralize(opportunities.inlineableStyleRuleCount, 'simple style rule')} can be inlined automatically.`);
  }

  if (opportunities.primitiveShapeCount > 0) {
    autoFixes.push(`${pluralize(opportunities.primitiveShapeCount, 'shape primitive')} can be converted to paths.`);
  }

  if (opportunities.convertibleTextCount > 0) {
    autoFixes.push(`${pluralize(opportunities.convertibleTextCount, 'text element')} can be converted to paths.`);
  }

  if (opportunities.strokeOutlineCount > 0) {
    autoFixes.push(`${pluralize(opportunities.strokeOutlineCount, 'stroke-driven node')} can be converted to filled outlines.`);
  }

  if (opportunities.pathCleanupCount > 0) {
    autoFixes.push(`${pluralize(opportunities.pathCleanupCount, 'path cleanup')} can close near-open paths, join fragments, repair polygon winding, stabilize self-intersections, or remove duplicate and tiny geometry.`);
  }

  if (opportunities.referenceCleanupCount > 0) {
    autoFixes.push(`${pluralize(opportunities.referenceCleanupCount, 'reference cleanup')} can remove broken local refs, invalid href/xlink chains, or non-link external dependency refs.`);
  }

  if (opportunities.directTransformCount > 0) {
    autoFixes.push(`${pluralize(opportunities.directTransformCount, 'direct transform')} can be baked into geometry.`);
  }

  if (opportunities.bakeableContainerTransformCount > 0) {
    autoFixes.push(`${pluralize(opportunities.bakeableContainerTransformCount, 'container transform')} can be baked safely.`);
  }

  if (opportunities.expandableUseCount > 0) {
    autoFixes.push(`${pluralize(opportunities.expandableUseCount, 'use reference')} can be expanded into concrete geometry.`);
  }

  if (opportunities.blockedStyleRuleCount > 0) {
    blockers.push(`${pluralize(opportunities.blockedStyleRuleCount, 'style rule')} still use unsupported selectors or syntax.`);
  }

  if (opportunities.blockedContainerTransformCount > 0) {
    blockers.push(`${pluralize(opportunities.blockedContainerTransformCount, 'container transform')} remain blocked by unsupported descendants.`);
  }

  if (opportunities.blockedUseCount > 0) {
    blockers.push(`${pluralize(opportunities.blockedUseCount, 'use reference')} still point to missing or unsupported targets.`);
  }

  if (opportunities.blockedTextCount > 0) {
    blockers.push(`${pluralize(opportunities.blockedTextCount, 'text element')} still need conversion support or embedded fonts for geometry-only export.`);
  }

  if ((tagCounts.image ?? 0) > 0) {
    blockers.push(`${pluralize(tagCounts.image, 'image element')} remain raster-based.`);
  }

  if (mediaCount > 0) {
    blockers.push(`${pluralize(mediaCount, 'media element')} still depend on SVG Tiny or browser playback support.`);
  }

  const effectCount = (tagCounts.filter ?? 0) + (tagCounts.mask ?? 0) + (tagCounts.clipPath ?? 0) + (tagCounts.pattern ?? 0);
  if (effectCount > 0) {
    blockers.push(`${pluralize(effectCount, 'effect node')} may need flattening or removal.`);
  }

  return {
    status: blockers.length > 0 ? 'blocked' : autoFixes.length > 0 ? 'repairable' : 'ready',
    autoFixCount: autoFixes.length,
    blockerCount: blockers.length,
    autoFixes,
    blockers,
  };
}

function getReadinessScore(status: WorkflowReadinessProfile['status'], autoFixCount: number, blockerCount: number) {
  if (status === 'ready') {
    return 100;
  }

  if (status === 'repairable') {
    return Math.max(60, 92 - autoFixCount * 8);
  }

  return Math.max(20, 54 - blockerCount * 14 - autoFixCount * 4);
}

function buildWorkflowReadiness(
  exportReadiness: ExportReadiness,
  runtimeFeatures: Analysis['runtimeFeatures'],
  warnings: string[],
  opportunities: Analysis['opportunities'],
) {
  const geometrySafe: WorkflowReadinessProfile = {
    status: exportReadiness.status,
    score: getReadinessScore(exportReadiness.status, exportReadiness.autoFixCount, exportReadiness.blockerCount),
    summary:
      exportReadiness.status === 'ready'
        ? 'No tracked blockers remain for the geometry-safe export pipeline.'
        : exportReadiness.status === 'repairable'
          ? 'This file is close to geometry-safe export and currently depends on tracked auto-fixable cleanup only.'
          : 'Geometry-safe export is still blocked by unresolved content that needs manual editing or future repair support.',
    strengths: [
      exportReadiness.blockerCount === 0 ? 'No tracked geometry-safe blockers remain.' : '',
      exportReadiness.autoFixCount > 0 ? `${exportReadiness.autoFixCount} tracked repair${exportReadiness.autoFixCount === 1 ? '' : 's'} can improve export readiness.` : '',
    ].filter(Boolean),
    autoFixes: exportReadiness.autoFixes,
    blockers: exportReadiness.blockers,
  };

  const runtimeStrengths = [
    runtimeFeatures.mediaElementCount > 0 ? `${runtimeFeatures.mediaElementCount} media element${runtimeFeatures.mediaElementCount === 1 ? '' : 's'} can be preserved in a browser/runtime SVG profile.` : '',
    runtimeFeatures.animationElementCount > 0 ? `${runtimeFeatures.animationElementCount} native animation element${runtimeFeatures.animationElementCount === 1 ? '' : 's'} can stay intact in a browser/runtime SVG profile.` : '',
    runtimeFeatures.linkElementCount > 0 ? `${runtimeFeatures.linkElementCount} link element${runtimeFeatures.linkElementCount === 1 ? '' : 's'} can remain interactive in browser SVG output.` : '',
    runtimeFeatures.mediaElementCount === 0 && runtimeFeatures.animationElementCount === 0
      ? 'No runtime-only media or animation dependencies are currently required.'
      : '',
  ].filter(Boolean);

  const runtimeAutoFixes = [
    opportunities.referenceCleanupCount > 0
      ? `${opportunities.referenceCleanupCount} broken local ref${opportunities.referenceCleanupCount === 1 ? '' : 's'}, invalid href/xlink chain${opportunities.referenceCleanupCount === 1 ? '' : 's'}, or non-link external dependency ref${opportunities.referenceCleanupCount === 1 ? '' : 's'} can be cleaned automatically.`
      : '',
  ].filter(Boolean);

  const runtimeBlockers = [
    warnings.some((warning) => warning.includes('executable node'))
      ? 'Executable content was stripped from preview and still needs manual removal before a trusted browser/runtime export.'
      : '',
    warnings.some((warning) => warning.includes('inline event handler'))
      ? 'Inline event handlers were stripped from preview and still need manual review before a trusted browser/runtime export.'
      : '',
  ].filter(Boolean);

  const runtimeStatus: WorkflowReadinessProfile['status'] = runtimeBlockers.length > 0
    ? 'blocked'
    : runtimeAutoFixes.length > 0
      ? 'repairable'
      : 'ready';

  const runtimeSvg: WorkflowReadinessProfile = {
    status: runtimeStatus,
    score: getReadinessScore(runtimeStatus, runtimeAutoFixes.length, runtimeBlockers.length),
    summary:
      runtimeStatus === 'ready'
        ? 'This file is currently suitable for a self-contained browser/runtime SVG workflow.'
        : runtimeStatus === 'repairable'
          ? 'This file is suitable for browser/runtime SVG after cleaning the remaining broken, chained, or external dependency refs.'
          : 'This file still contains source-level scripting concerns that need manual review before trusted browser/runtime use.',
    strengths: runtimeStrengths,
    autoFixes: runtimeAutoFixes,
    blockers: runtimeBlockers,
  };

  return {
    geometrySafe,
    runtimeSvg,
  };
}

export function sanitizeSvgElement(svgElement: SVGSVGElement): SanitizedPreview {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  const warnings: string[] = [];

  let removedScripts = 0;
  let removedForeignObjects = 0;
  let removedEventAttributes = 0;
  let removedJavascriptLinks = 0;

  clone.querySelectorAll('script, iframe, object, embed').forEach((node) => {
    removedScripts += 1;
    node.remove();
  });

  clone.querySelectorAll('foreignObject').forEach((node) => {
    removedForeignObjects += 1;
    node.remove();
  });

  const nodes = [clone, ...Array.from(clone.querySelectorAll('*'))];
  for (const node of nodes) {
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.name.toLowerCase().startsWith('on')) {
        node.removeAttribute(attribute.name);
        removedEventAttributes += 1;
        continue;
      }

      const isLinkAttribute = attribute.name === 'href' || attribute.name === 'xlink:href';
      if (isLinkAttribute && attribute.value.trim().toLowerCase().startsWith('javascript:')) {
        node.removeAttribute(attribute.name);
        removedJavascriptLinks += 1;
      }
    }
  }

  const nodesById: Record<string, SvgNodeSummary> = {};
  let rootNodeId = 'node-0';
  let nodeIndex = 0;

  const assignNodeIds = (node: Element, path: string) => {
    const id = `node-${nodeIndex}`;
    nodeIndex += 1;
    node.setAttribute('data-svg-node-id', id);
    nodesById[id] = summarizeNode(node, id, path);
    if (path === '0') {
      rootNodeId = id;
    }

    Array.from(node.children).forEach((child, childIndex) => {
      assignNodeIds(child, `${path}.${childIndex}`);
    });
  };

  assignNodeIds(clone, '0');

  if (removedScripts > 0) {
    warnings.push(`Removed ${removedScripts} executable node${removedScripts === 1 ? '' : 's'} from preview.`);
  }

  if (removedForeignObjects > 0) {
    warnings.push(`Removed ${removedForeignObjects} foreignObject node${removedForeignObjects === 1 ? '' : 's'} from preview.`);
  }

  if (removedEventAttributes > 0) {
    warnings.push(`Removed ${removedEventAttributes} inline event handler${removedEventAttributes === 1 ? '' : 's'} from preview.`);
  }

  if (removedJavascriptLinks > 0) {
    warnings.push(`Removed ${removedJavascriptLinks} javascript: link${removedJavascriptLinks === 1 ? '' : 's'} from preview.`);
  }

  return {
    markup: new XMLSerializer().serializeToString(clone),
    warnings,
    nodesById,
    rootNodeId,
    sanitizedRoot: clone,
  };
}

export function buildPreviewSnapshot(source: string): PreviewSnapshot {
  return sanitizeSvgElement(parseSvgRoot(source));
}

function buildAnalysisFromPreviewWithOpportunities(
  source: string,
  fileName: string,
  preview: PreviewSnapshot,
  opportunities: AnalysisOpportunities,
): Analysis {
  const svgElement = preview.sanitizedRoot;
  const { tagCounts, totalElements } = collectTagCounts(svgElement);
  const risks = buildRiskList(svgElement, tagCounts, opportunities);
  const exportReadiness = buildExportReadiness(tagCounts, opportunities);
  const runtimeFeatures = collectRuntimeFeatures(svgElement);
  const inventory = collectInventory(svgElement);
  const authoringMetadata = collectAuthoringMetadata(svgElement);
  const workflowReadiness = buildWorkflowReadiness(exportReadiness, runtimeFeatures, preview.warnings, opportunities);

  return {
    fileName,
    sourceLength: source.length,
    rootName: getLocalTagName(svgElement),
    viewBox: svgElement.getAttribute('viewBox') ?? 'none',
    width: svgElement.getAttribute('width') ?? 'auto',
    height: svgElement.getAttribute('height') ?? 'auto',
    totalElements,
    tagCounts,
    previewMarkup: preview.markup,
    warnings: preview.warnings,
    risks,
    exportReadiness,
    workflowReadiness,
    runtimeFeatures,
    inventory,
    authoringMetadata,
    nodesById: preview.nodesById,
    rootNodeId: preview.rootNodeId,
    opportunities,
  };
}

function buildAnalysisFromPreview(
  source: string,
  fileName: string,
  preview: PreviewSnapshot,
  textOptions: TextConversionOptions = {},
): Analysis {
  return buildAnalysisFromPreviewWithOpportunities(
    source,
    fileName,
    preview,
    detectNormalizationOpportunities(source, textOptions),
  );
}

function getNodeSignature(node: SvgNodeSummary) {
  const attributeSignature = Object.entries(node.attributes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${value}`)
    .join('|');

  return [node.name, attributeSignature, node.childElementCount, node.textPreview].join('::');
}

function compressChangedPaths(paths: string[]) {
  const uniquePaths = Array.from(new Set(paths)).sort((left, right) => left.length - right.length || left.localeCompare(right));
  return uniquePaths.filter((path, index) => !uniquePaths.slice(0, index).some((candidate) => path.startsWith(`${candidate}.`)));
}

export function getChangedPreviewNodePaths(previousSource: string, nextSource: string) {
  try {
    const previousPreview = sanitizeSvgElement(parseSvgRoot(previousSource));
    const nextPreview = sanitizeSvgElement(parseSvgRoot(nextSource));
    const previousByPath = new Map(Object.values(previousPreview.nodesById).map((node) => [node.path, node]));
    const nextByPath = new Map(Object.values(nextPreview.nodesById).map((node) => [node.path, node]));
    const changedPaths: string[] = [];

    nextByPath.forEach((node, path) => {
      const previousNode = previousByPath.get(path);
      if (!previousNode || getNodeSignature(previousNode) !== getNodeSignature(node)) {
        changedPaths.push(path);
      }
    });

    previousByPath.forEach((_, path) => {
      if (!nextByPath.has(path)) {
        const parentPath = path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : '0';
        changedPaths.push(nextByPath.has(parentPath) ? parentPath : '0');
      }
    });

    return compressChangedPaths(changedPaths).slice(0, 12);
  } catch {
    return [] as string[];
  }
}

export function buildAnalysis(source: string, fileName: string, textOptions: TextConversionOptions = {}): Analysis {
  return buildAnalysisFromPreview(source, fileName, buildPreviewSnapshot(source), textOptions);
}

export { buildAnalysisFromPreview, buildAnalysisFromPreviewWithOpportunities };
