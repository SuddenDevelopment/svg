const EMPTY_SVG_TEMPLATE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"></svg>';

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

  return documentElement as Element;
}

function escapeText(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttribute(value: string) {
  return escapeText(value)
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function isWhitespaceSensitiveParent(node: Node | null) {
  const parentName = node instanceof Element
    ? (node.localName || node.tagName.split(':').at(-1) || node.tagName).toLowerCase()
    : '';

  return parentName === 'text' || parentName === 'tspan' || parentName === 'style' || parentName === 'desc' || parentName === 'title';
}

function normalizeCompactTree(node: Node) {
  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.parentNode?.removeChild(child);
      return;
    }

    if (child.nodeType === Node.TEXT_NODE) {
      const textValue = child.textContent ?? '';
      if (!isWhitespaceSensitiveParent(child.parentNode) && textValue.trim() === '') {
        child.parentNode?.removeChild(child);
        return;
      }
    }

    normalizeCompactTree(child);
  });
}

function serializePrettyNode(node: Node, depth: number): string[] {
  const indent = '  '.repeat(depth);

  if (node.nodeType === Node.TEXT_NODE) {
    const textValue = node.textContent ?? '';
    if (!isWhitespaceSensitiveParent(node.parentNode) && textValue.trim() === '') {
      return [];
    }

    return [`${indent}${escapeText(textValue)}`];
  }

  if (node.nodeType === Node.COMMENT_NODE) {
    return [`${indent}<!--${node.textContent ?? ''}-->`];
  }

  if (!(node instanceof Element)) {
    return [];
  }

  const attributes = Array.from(node.attributes)
    .map((attribute) => `${attribute.name}="${escapeAttribute(attribute.value)}"`)
    .join(' ');
  const openTag = attributes ? `<${node.tagName} ${attributes}` : `<${node.tagName}`;
  const childNodes = Array.from(node.childNodes).flatMap((child) => serializePrettyNode(child, depth + 1));

  if (childNodes.length === 0) {
    return [`${indent}${openTag} />`];
  }

  const hasOnlyInlineText = Array.from(node.childNodes).every((child) => child.nodeType === Node.TEXT_NODE) && childNodes.length === 1;
  if (hasOnlyInlineText) {
    return [`${indent}${openTag}>${childNodes[0].trim()}<${`/${node.tagName}`}>`];
  }

  return [`${indent}${openTag}>`, ...childNodes, `${indent}</${node.tagName}>`];
}

export function prettifySvgSource(source: string) {
  const root = parseSvgRoot(source);
  return `${serializePrettyNode(root, 0).join('\n')}\n`;
}

export function optimizeSvgSource(source: string) {
  const root = parseSvgRoot(source);
  normalizeCompactTree(root);
  return new XMLSerializer().serializeToString(root);
}

export function clearSvgSource() {
  return EMPTY_SVG_TEMPLATE;
}

export { EMPTY_SVG_TEMPLATE };