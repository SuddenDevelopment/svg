import { SVGPathData } from 'svg-pathdata';

type Matrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type ViewBoxValues = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

export type ViewBoxMutationResult = {
  source: string;
  changed: boolean;
  viewBox: string | null;
  width: string | null;
  height: string | null;
};

type WorkspaceDimensions = {
  width: number;
  height: number;
};

const nonRenderableContainerNames = new Set([
  'clipPath',
  'defs',
  'desc',
  'linearGradient',
  'marker',
  'mask',
  'metadata',
  'pattern',
  'radialGradient',
  'script',
  'stop',
  'style',
  'symbol',
  'title',
]);

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
  if (getLocalTagName(documentElement).toLowerCase() !== 'svg') {
    throw new Error('The provided markup does not have an <svg> root element.');
  }

  return documentElement as unknown as SVGSVGElement;
}

function parseSvgLength(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^([+-]?\d*\.?\d+(?:e[-+]?\d+)?)/i);
  if (!match) {
    return null;
  }

  const numericValue = Number(match[1]);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function parseViewBox(value: string | null): ViewBoxValues | null {
  if (!value) {
    return null;
  }

  const parts = value.trim().split(/[\s,]+/).map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const [minX, minY, width, height] = parts;
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { minX, minY, width, height };
}

function formatNumber(value: number) {
  return `${Number(value.toFixed(3))}`;
}

function formatViewBox(viewBox: ViewBoxValues) {
  return [viewBox.minX, viewBox.minY, viewBox.width, viewBox.height].map(formatNumber).join(' ');
}

function identityMatrix(): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function multiplyMatrix(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function rotateMatrix(angleDeg: number, cx = 0, cy = 0): Matrix {
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: cx - cx * cos + cy * sin,
    f: cy - cx * sin - cy * cos,
  };
}

function parseTransformMatrix(transformValue: string | null) {
  if (!transformValue) {
    return identityMatrix();
  }

  const transformPattern = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;
  let current = identityMatrix();
  let match: RegExpExecArray | null;

  while ((match = transformPattern.exec(transformValue)) !== null) {
    const [, type, rawArgs] = match;
    const args = (rawArgs.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map((value) => Number.parseFloat(value));
    let next = identityMatrix();

    switch (type) {
      case 'matrix':
        next = {
          a: args[0] ?? 1,
          b: args[1] ?? 0,
          c: args[2] ?? 0,
          d: args[3] ?? 1,
          e: args[4] ?? 0,
          f: args[5] ?? 0,
        };
        break;
      case 'translate':
        next = { a: 1, b: 0, c: 0, d: 1, e: args[0] ?? 0, f: args[1] ?? 0 };
        break;
      case 'scale':
        next = { a: args[0] ?? 1, b: 0, c: 0, d: args[1] ?? args[0] ?? 1, e: 0, f: 0 };
        break;
      case 'rotate':
        next = rotateMatrix(args[0] ?? 0, args[1] ?? 0, args[2] ?? 0);
        break;
      case 'skewX': {
        const angle = Math.tan(((args[0] ?? 0) * Math.PI) / 180);
        next = { a: 1, b: 0, c: angle, d: 1, e: 0, f: 0 };
        break;
      }
      case 'skewY': {
        const angle = Math.tan(((args[0] ?? 0) * Math.PI) / 180);
        next = { a: 1, b: angle, c: 0, d: 1, e: 0, f: 0 };
        break;
      }
    }

    current = multiplyMatrix(current, next);
  }

  return current;
}

function transformPoint(matrix: Matrix, x: number, y: number) {
  return {
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  };
}

function createBounds(minX: number, minY: number, maxX: number, maxY: number): Bounds | null {
  if (![minX, minY, maxX, maxY].every((value) => Number.isFinite(value))) {
    return null;
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

function mergeBounds(current: Bounds | null, next: Bounds | null): Bounds | null {
  if (!current) {
    return next;
  }

  if (!next) {
    return current;
  }

  return {
    minX: Math.min(current.minX, next.minX),
    minY: Math.min(current.minY, next.minY),
    maxX: Math.max(current.maxX, next.maxX),
    maxY: Math.max(current.maxY, next.maxY),
  };
}

function transformBounds(bounds: Bounds, matrix: Matrix): Bounds {
  const corners = [
    transformPoint(matrix, bounds.minX, bounds.minY),
    transformPoint(matrix, bounds.maxX, bounds.minY),
    transformPoint(matrix, bounds.maxX, bounds.maxY),
    transformPoint(matrix, bounds.minX, bounds.maxY),
  ];
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function parseCoordinateList(value: string | null) {
  return (value ?? '')
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part));
}

function getTextApproximateBounds(element: Element): Bounds | null {
  const xValues = parseCoordinateList(element.getAttribute('x'));
  const yValues = parseCoordinateList(element.getAttribute('y'));
  const textContent = element.textContent ?? '';
  const fontSize = Math.max(1, parseSvgLength(element.getAttribute('font-size')) ?? 16);
  const textLength = Math.max(
    0,
    parseSvgLength(element.getAttribute('textLength')) ?? textContent.trim().length * fontSize * 0.6,
  );
  const x = xValues[0] ?? 0;
  const y = yValues[0] ?? 0;
  return createBounds(x, y - fontSize * 0.8, x + textLength, y + fontSize * 0.2);
}

function getPathBounds(pathData: string): Bounds | null {
  let commands;

  try {
    commands = new SVGPathData(pathData).toAbs().commands;
  } catch {
    return null;
  }

  const points = commands.flatMap((command) => {
    const values: Array<{ x: number; y: number }> = [];
    const commandValues = command as Record<string, number | boolean | undefined>;
    const candidates: Array<[number | undefined, number | undefined]> = [
      [typeof commandValues.x === 'number' ? commandValues.x : undefined, typeof commandValues.y === 'number' ? commandValues.y : undefined],
      [typeof commandValues.x1 === 'number' ? commandValues.x1 : undefined, typeof commandValues.y1 === 'number' ? commandValues.y1 : undefined],
      [typeof commandValues.x2 === 'number' ? commandValues.x2 : undefined, typeof commandValues.y2 === 'number' ? commandValues.y2 : undefined],
    ];

    candidates.forEach(([x, y]) => {
      if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
        values.push({ x, y });
      }
    });

    return values;
  });

  if (points.length === 0) {
    return null;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function getElementStrokePadding(element: Element) {
  const stroke = (element.getAttribute('stroke') ?? '').trim().toLowerCase();
  const strokeWidth = Math.max(0, parseSvgLength(element.getAttribute('stroke-width')) ?? 0);
  if (!stroke || stroke === 'none' || strokeWidth === 0) {
    return 0;
  }

  return strokeWidth / 2;
}

function expandBounds(bounds: Bounds | null, padding: number) {
  if (!bounds || padding <= 0) {
    return bounds;
  }

  return {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding,
  };
}

function getLocalElementBounds(element: Element): Bounds | null {
  const tagName = getLocalTagName(element);
  let bounds: Bounds | null = null;

  switch (tagName) {
    case 'rect':
    case 'image':
    case 'foreignObject':
    case 'use': {
      const x = parseSvgLength(element.getAttribute('x')) ?? 0;
      const y = parseSvgLength(element.getAttribute('y')) ?? 0;
      const width = parseSvgLength(element.getAttribute('width')) ?? 0;
      const height = parseSvgLength(element.getAttribute('height')) ?? 0;
      if (width > 0 && height > 0) {
        bounds = createBounds(x, y, x + width, y + height);
      }
      break;
    }
    case 'circle': {
      const cx = parseSvgLength(element.getAttribute('cx')) ?? 0;
      const cy = parseSvgLength(element.getAttribute('cy')) ?? 0;
      const r = parseSvgLength(element.getAttribute('r')) ?? 0;
      if (r > 0) {
        bounds = createBounds(cx - r, cy - r, cx + r, cy + r);
      }
      break;
    }
    case 'ellipse': {
      const cx = parseSvgLength(element.getAttribute('cx')) ?? 0;
      const cy = parseSvgLength(element.getAttribute('cy')) ?? 0;
      const rx = parseSvgLength(element.getAttribute('rx')) ?? 0;
      const ry = parseSvgLength(element.getAttribute('ry')) ?? 0;
      if (rx > 0 && ry > 0) {
        bounds = createBounds(cx - rx, cy - ry, cx + rx, cy + ry);
      }
      break;
    }
    case 'line': {
      const x1 = parseSvgLength(element.getAttribute('x1')) ?? 0;
      const y1 = parseSvgLength(element.getAttribute('y1')) ?? 0;
      const x2 = parseSvgLength(element.getAttribute('x2')) ?? 0;
      const y2 = parseSvgLength(element.getAttribute('y2')) ?? 0;
      bounds = createBounds(Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2));
      break;
    }
    case 'polyline':
    case 'polygon': {
      const values = parseCoordinateList(element.getAttribute('points'));
      const points: Array<{ x: number; y: number }> = [];
      for (let index = 0; index < values.length - 1; index += 2) {
        points.push({ x: values[index] ?? 0, y: values[index + 1] ?? 0 });
      }

      if (points.length > 0) {
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        bounds = createBounds(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
      }
      break;
    }
    case 'path':
      bounds = getPathBounds(element.getAttribute('d') ?? '');
      break;
    case 'text':
    case 'tspan':
      bounds = getTextApproximateBounds(element);
      break;
  }

  return expandBounds(bounds, getElementStrokePadding(element));
}

function collectRenderableBounds(element: Element, inheritedMatrix: Matrix): Bounds | null {
  const tagName = getLocalTagName(element);
  if (nonRenderableContainerNames.has(tagName)) {
    return null;
  }

  const elementMatrix = multiplyMatrix(inheritedMatrix, parseTransformMatrix(element.getAttribute('transform')));
  let bounds = getLocalElementBounds(element);
  if (bounds) {
    bounds = transformBounds(bounds, elementMatrix);
  }

  Array.from(element.children).forEach((child) => {
    bounds = mergeBounds(bounds, collectRenderableBounds(child, elementMatrix));
  });

  return bounds;
}

function getContentBounds(root: SVGSVGElement) {
  let bounds: Bounds | null = null;
  Array.from(root.children).forEach((child) => {
    bounds = mergeBounds(bounds, collectRenderableBounds(child, identityMatrix()));
  });
  return bounds;
}

function boundsToViewBox(bounds: Bounds): ViewBoxValues {
  const width = Math.max(0.001, bounds.maxX - bounds.minX);
  const height = Math.max(0.001, bounds.maxY - bounds.minY);
  return {
    minX: bounds.minX,
    minY: bounds.minY,
    width,
    height,
  };
}

function serializeResult(root: SVGSVGElement, viewBox: string | null, changed: boolean): ViewBoxMutationResult {
  return {
    source: new XMLSerializer().serializeToString(root),
    changed,
    viewBox,
    width: root.getAttribute('width'),
    height: root.getAttribute('height'),
  };
}

export function setViewBoxToWorkspaceArea(source: string, workspaceDimensions?: WorkspaceDimensions | null): ViewBoxMutationResult {
  const root = parseSvgRoot(source);
  const width = parseSvgLength(root.getAttribute('width'));
  const height = parseSvgLength(root.getAttribute('height'));
  const currentViewBox = root.getAttribute('viewBox');
  const fallbackViewBox = parseViewBox(currentViewBox);

  const workspaceWidth = workspaceDimensions && Number.isFinite(workspaceDimensions.width) && workspaceDimensions.width > 0
    ? workspaceDimensions.width
    : null;
  const workspaceHeight = workspaceDimensions && Number.isFinite(workspaceDimensions.height) && workspaceDimensions.height > 0
    ? workspaceDimensions.height
    : null;

  const targetViewBox = workspaceWidth && workspaceHeight
    ? formatViewBox({ minX: 0, minY: 0, width: workspaceWidth, height: workspaceHeight })
    : width && height
    ? formatViewBox({ minX: 0, minY: 0, width, height })
    : fallbackViewBox
      ? formatViewBox(fallbackViewBox)
      : null;

  if (!targetViewBox) {
    throw new Error('The SVG root needs explicit width and height, or an existing viewBox, before it can be fitted to the workspace area.');
  }

  if (currentViewBox === targetViewBox) {
    return serializeResult(root, targetViewBox, false);
  }

  root.setAttribute('viewBox', targetViewBox);
  return serializeResult(root, targetViewBox, true);
}

export function cropViewBoxToElements(source: string): ViewBoxMutationResult {
  const root = parseSvgRoot(source);
  const bounds = getContentBounds(root);
  if (!bounds) {
    throw new Error('No renderable element bounds were found for cropping.');
  }

  const nextViewBox = formatViewBox(boundsToViewBox(bounds));
  if (root.getAttribute('viewBox') === nextViewBox) {
    return serializeResult(root, nextViewBox, false);
  }

  root.setAttribute('viewBox', nextViewBox);
  return serializeResult(root, nextViewBox, true);
}

export function removeViewBoxFromSource(source: string): ViewBoxMutationResult {
  const root = parseSvgRoot(source);
  const currentViewBox = parseViewBox(root.getAttribute('viewBox'));

  if (!root.hasAttribute('viewBox')) {
    return serializeResult(root, null, false);
  }

  if (currentViewBox && !root.getAttribute('width')) {
    root.setAttribute('width', formatNumber(currentViewBox.width));
  }

  if (currentViewBox && !root.getAttribute('height')) {
    root.setAttribute('height', formatNumber(currentViewBox.height));
  }

  root.removeAttribute('viewBox');
  return serializeResult(root, null, true);
}