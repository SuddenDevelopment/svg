export type ExportVariant = 'current' | 'runtime' | 'safe' | 'blender';

export type PngSnapshotResult = {
  blob: Blob;
  width: number;
  height: number;
};

function stripSvgExtension(fileName: string) {
  return fileName.replace(/\.svg$/i, '') || 'graphic';
}

export function buildExportFileName(fileName: string, variant: ExportVariant) {
  const baseName = stripSvgExtension(fileName.trim() || 'graphic.svg');

  switch (variant) {
    case 'current':
      return `${baseName}.svg`;
    case 'runtime':
      return `${baseName}.runtime.svg`;
    case 'safe':
      return `${baseName}.geometry.svg`;
    case 'blender':
      return `${baseName}.blender.svg`;
  }
}

export function buildPngExportFileName(fileName: string, variant: ExportVariant) {
  return buildExportFileName(fileName, variant).replace(/\.svg$/i, '.png');
}

export function getExportVariantLabel(variant: ExportVariant) {
  switch (variant) {
    case 'current':
      return 'Current SVG';
    case 'runtime':
      return 'Browser/runtime SVG';
    case 'safe':
      return 'Geometry-safe SVG';
    case 'blender':
      return 'Blender-friendly SVG';
  }
}

export function downloadSvgSource(source: string, fileName: string) {
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, fileName);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function parseSvgLength(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^([+-]?\d*\.?\d+)/);
  if (!match) {
    return null;
  }

  const numericValue = Number(match[1]);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

function parseViewBox(value: string | null) {
  if (!value) {
    return null;
  }

  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const [, , width, height] = parts;
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function getPngSnapshotDimensions(source: string) {
  const parser = new DOMParser();
  const documentRoot = parser.parseFromString(source, 'image/svg+xml');
  const parserError = documentRoot.querySelector('parsererror');
  if (parserError) {
    throw new Error('Unable to render a PNG snapshot from invalid SVG markup.');
  }

  const root = documentRoot.documentElement;
  if (!root || root.localName !== 'svg') {
    throw new Error('Unable to render a PNG snapshot because the document is missing an <svg> root.');
  }

  const viewBox = parseViewBox(root.getAttribute('viewBox'));
  const width = parseSvgLength(root.getAttribute('width'));
  const height = parseSvgLength(root.getAttribute('height'));
  const fallbackSize = 1024;

  if (width && height) {
    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
  }

  if (viewBox && width) {
    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(width * (viewBox.height / viewBox.width))),
    };
  }

  if (viewBox && height) {
    return {
      width: Math.max(1, Math.round(height * (viewBox.width / viewBox.height))),
      height: Math.max(1, Math.round(height)),
    };
  }

  if (viewBox) {
    return {
      width: Math.max(1, Math.round(viewBox.width)),
      height: Math.max(1, Math.round(viewBox.height)),
    };
  }

  if (width || height) {
    return {
      width: Math.max(1, Math.round(width ?? fallbackSize)),
      height: Math.max(1, Math.round(height ?? fallbackSize)),
    };
  }

  return {
    width: fallbackSize,
    height: fallbackSize,
  };
}

export async function createPngSnapshot(source: string): Promise<PngSnapshotResult> {
  const { width, height } = getPngSnapshotDimensions(source);
  const imageSource = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const imageUrl = URL.createObjectURL(imageSource);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('Unable to rasterize this SVG into a PNG snapshot in the current browser context.'));
      nextImage.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D rendering is not available in this browser context.');
    }

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (!nextBlob) {
          reject(new Error('Unable to encode a PNG snapshot in this browser context.'));
          return;
        }

        resolve(nextBlob);
      }, 'image/png');
    });

    return {
      blob,
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export async function copySvgSourceToClipboard(source: string) {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard writing is not available in this browser context.');
  }

  await navigator.clipboard.writeText(source);
}