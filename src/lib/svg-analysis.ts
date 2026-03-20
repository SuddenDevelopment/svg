import { parseSync } from 'svgson';
import { detectNormalizationOpportunities } from './svg-normalization';
import type { TextConversionOptions } from './svg-fonts';

export type SvgAstNode = {
  name: string;
  type: string;
  value?: string;
  attributes?: Record<string, string>;
  children?: SvgAstNode[];
};

export type SvgNodeSummary = {
  id: string;
  name: string;
  attributes: Record<string, string>;
  childElementCount: number;
  textPreview: string;
};

export type SvgRisk = {
  severity: 'info' | 'warning';
  message: string;
};

export type ExportReadiness = {
  status: 'ready' | 'repairable' | 'blocked';
  autoFixCount: number;
  blockerCount: number;
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
  };
};

type SanitizedPreview = {
  markup: string;
  warnings: string[];
  nodesById: Record<string, SvgNodeSummary>;
  rootNodeId: string;
  sanitizedRoot: SVGSVGElement;
};

function walkAst(node: SvgAstNode, visit: (current: SvgAstNode) => void) {
  visit(node);
  for (const child of node.children ?? []) {
    walkAst(child, visit);
  }
}

function collectTagCounts(ast: SvgAstNode) {
  const tagCounts: Record<string, number> = {};
  let totalElements = 0;

  walkAst(ast, (node) => {
    if (node.type !== 'element') {
      return;
    }

    totalElements += 1;
    tagCounts[node.name] = (tagCounts[node.name] ?? 0) + 1;
  });

  return { tagCounts, totalElements };
}

function summarizeNode(node: Element, id: string): SvgNodeSummary {
  const attributes = Object.fromEntries(
    Array.from(node.attributes)
      .filter((attribute) => attribute.name !== 'data-svg-node-id' && attribute.name !== 'data-svg-node-selected')
      .map((attribute) => [attribute.name, attribute.value]),
  );

  return {
    id,
    name: node.tagName,
    attributes,
    childElementCount: node.children.length,
    textPreview: (node.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 120),
  };
}

function buildRiskList(svgRoot: SVGSVGElement, tagCounts: Record<string, number>) {
  const risks: SvgRisk[] = [];
  const pushRisk = (severity: SvgRisk['severity'], message: string) => {
    risks.push({ severity, message });
  };

  if ((tagCounts.text ?? 0) > 0) {
    pushRisk('warning', 'Text elements found. Geometry-only exports may need text-to-path conversion.');
  }

  if ((tagCounts.image ?? 0) > 0) {
    pushRisk('warning', 'Embedded raster images found. These will not behave like vector geometry.');
  }

  if ((tagCounts.use ?? 0) > 0) {
    pushRisk('warning', '<use> references found. Some downstream tools prefer fully expanded geometry.');
  }

  if ((tagCounts.style ?? 0) > 0) {
    pushRisk('info', 'Embedded <style> blocks found. Styling may need inlining for strict exports.');
  }

  if ((tagCounts.animate ?? 0) + (tagCounts.animateTransform ?? 0) + (tagCounts.set ?? 0) > 0) {
    pushRisk('info', 'Native SVG animation elements found. These are portable in SVG, but not geometry-safe for every downstream tool.');
  }

  if ((tagCounts.filter ?? 0) + (tagCounts.mask ?? 0) + (tagCounts.clipPath ?? 0) + (tagCounts.pattern ?? 0) > 0) {
    pushRisk('warning', 'Visual effect elements found. Filters, masks, clip paths, or patterns may need flattening or removal.');
  }

  const transformedNodes = svgRoot.querySelectorAll('[transform]').length;
  if (transformedNodes > 0) {
    pushRisk('warning', `${transformedNodes} transformed node${transformedNodes === 1 ? '' : 's'} found. Transform baking is usually a useful normalization step.`);
  }

  const strokeOnlyNodes = svgRoot.querySelectorAll('[stroke]:not([fill]), [stroke][fill="none"]').length;
  if (strokeOnlyNodes > 0) {
    pushRisk('info', `${strokeOnlyNodes} stroke-driven node${strokeOnlyNodes === 1 ? '' : 's'} found. Outline expansion may be needed for geometry-only targets.`);
  }

  if (!svgRoot.getAttribute('viewBox')) {
    pushRisk('info', 'No viewBox found. Adding one improves responsive preview behavior and export framing.');
  }

  return risks;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildExportReadiness(tagCounts: Record<string, number>, opportunities: Analysis['opportunities']): ExportReadiness {
  const autoFixes: string[] = [];
  const blockers: string[] = [];

  if (opportunities.inlineableStyleRuleCount > 0) {
    autoFixes.push(`${pluralize(opportunities.inlineableStyleRuleCount, 'simple style rule')} can be inlined automatically.`);
  }

  if (opportunities.primitiveShapeCount > 0) {
    autoFixes.push(`${pluralize(opportunities.primitiveShapeCount, 'shape primitive')} can be converted to paths.`);
  }

  if (opportunities.convertibleTextCount > 0) {
    autoFixes.push(`${pluralize(opportunities.convertibleTextCount, 'text element')} can be converted to paths.`);
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
  nodes.forEach((node, index) => {
    const id = `node-${index}`;
    node.setAttribute('data-svg-node-id', id);
    nodesById[id] = summarizeNode(node, id);
    if (index === 0) {
      rootNodeId = id;
    }
  });

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

export function buildAnalysis(source: string, fileName: string, textOptions: TextConversionOptions = {}): Analysis {
  const documentRoot = new DOMParser().parseFromString(source, 'image/svg+xml');
  const parserError = documentRoot.querySelector('parsererror');
  if (parserError) {
    throw new Error(parserError.textContent?.trim() || 'Unable to parse SVG markup.');
  }

  const documentElement = documentRoot.documentElement;
  if (documentElement.tagName.toLowerCase() !== 'svg') {
    throw new Error('The provided markup does not have an <svg> root element.');
  }
  const svgElement = documentElement as unknown as SVGSVGElement;

  const preview = sanitizeSvgElement(svgElement);
  const ast = parseSync(preview.markup) as SvgAstNode;
  const { tagCounts, totalElements } = collectTagCounts(ast);
  const risks = buildRiskList(preview.sanitizedRoot, tagCounts);
  const opportunities = detectNormalizationOpportunities(source, textOptions);
  const exportReadiness = buildExportReadiness(tagCounts, opportunities);

  return {
    fileName,
    sourceLength: source.length,
    rootName: svgElement.tagName,
    viewBox: svgElement.getAttribute('viewBox') ?? 'none',
    width: svgElement.getAttribute('width') ?? 'auto',
    height: svgElement.getAttribute('height') ?? 'auto',
    totalElements,
    tagCounts,
    previewMarkup: preview.markup,
    warnings: preview.warnings,
    risks,
    exportReadiness,
    nodesById: preview.nodesById,
    rootNodeId: preview.rootNodeId,
    opportunities,
  };
}
