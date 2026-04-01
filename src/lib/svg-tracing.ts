import ImageTracer from 'imagetracerjs';
import type { ImageTracerOptions, ImageTracerPaletteColor } from 'imagetracerjs';

export type RasterTraceMode = 'color' | 'grayscale' | 'monochrome';
export type RasterTracePresetId = 'illustration' | 'logo' | 'photo' | 'grayscale';

export type RasterTraceSettings = {
  presetId: RasterTracePresetId;
  mode: RasterTraceMode;
  numberOfColors: number;
  threshold: number;
  detail: number;
  blurRadius: number;
  noiseFilter: number;
  enhanceCorners: boolean;
};

export type RasterTraceAsset = {
  fileName: string;
  mimeType: string;
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
};

const MONOCHROME_PALETTE: ImageTracerPaletteColor[] = [
  { r: 0, g: 0, b: 0, a: 255 },
  { r: 255, g: 255, b: 255, a: 255 },
];

const rasterMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
  'image/tiff',
]);

const rasterExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif', '.tif', '.tiff'];

export const rasterTraceAccept = '.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.tif,.tiff,image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,image/tiff';
export const rasterTraceFormatLabel = 'PNG, JPG, WebP, GIF, BMP, AVIF, and TIFF';

export const rasterTracePresets: Array<{
  id: RasterTracePresetId;
  label: string;
  description: string;
}> = [
  {
    id: 'illustration',
    label: 'Illustration',
    description: 'Balanced color tracing for icons, decals, and flat artwork.',
  },
  {
    id: 'logo',
    label: 'Logo',
    description: 'High-contrast monochrome tracing that keeps corners crisp and background fills easy to discard.',
  },
  {
    id: 'photo',
    label: 'Photo',
    description: 'Smoother tracing with more colors for painterly or shaded raster art.',
  },
  {
    id: 'grayscale',
    label: 'Grayscale',
    description: 'Posterized tonal tracing when you want value shapes without full color.',
  },
];

const detailMap: Record<number, { ltres: number; qtres: number; roundcoords: number }> = {
  1: { ltres: 2.5, qtres: 2.5, roundcoords: 0 },
  2: { ltres: 1.75, qtres: 1.75, roundcoords: 1 },
  3: { ltres: 1, qtres: 1, roundcoords: 1 },
  4: { ltres: 0.5, qtres: 0.5, roundcoords: 2 },
  5: { ltres: 0.2, qtres: 0.2, roundcoords: 2 },
};

export function createRasterTraceSettings(presetId: RasterTracePresetId = 'illustration'): RasterTraceSettings {
  switch (presetId) {
    case 'logo':
      return {
        presetId,
        mode: 'monochrome',
        numberOfColors: 2,
        threshold: 160,
        detail: 4,
        blurRadius: 0,
        noiseFilter: 6,
        enhanceCorners: true,
      };
    case 'photo':
      return {
        presetId,
        mode: 'color',
        numberOfColors: 24,
        threshold: 160,
        detail: 2,
        blurRadius: 2,
        noiseFilter: 4,
        enhanceCorners: false,
      };
    case 'grayscale':
      return {
        presetId,
        mode: 'grayscale',
        numberOfColors: 10,
        threshold: 160,
        detail: 3,
        blurRadius: 1,
        noiseFilter: 5,
        enhanceCorners: true,
      };
    case 'illustration':
    default:
      return {
        presetId: 'illustration',
        mode: 'color',
        numberOfColors: 12,
        threshold: 160,
        detail: 3,
        blurRadius: 1,
        noiseFilter: 6,
        enhanceCorners: true,
      };
  }
}

export function isSupportedRasterFile(file: Pick<File, 'name' | 'type'>) {
  const lowerName = file.name.toLowerCase();
  return rasterMimeTypes.has(file.type) || rasterExtensions.some((extension) => lowerName.endsWith(extension));
}

export function buildTracedSvgFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/u, '') + '-traced.svg';
}

export function buildImageTracerOptions(settings: RasterTraceSettings): ImageTracerOptions {
  const detail = detailMap[settings.detail] ?? detailMap[3];
  const options: ImageTracerOptions = {
    viewbox: true,
    desc: false,
    scale: 1,
    strokewidth: 0,
    ltres: detail.ltres,
    qtres: detail.qtres,
    roundcoords: detail.roundcoords,
    pathomit: settings.noiseFilter,
    blurradius: settings.blurRadius,
    blurdelta: settings.blurRadius > 0 ? 64 : 20,
    rightangleenhance: settings.enhanceCorners,
    linefilter: settings.noiseFilter >= 12,
    colorsampling: settings.mode === 'color' ? 2 : 0,
    colorquantcycles: settings.mode === 'color' ? 3 : 1,
    numberofcolors: settings.mode === 'monochrome' ? 2 : settings.numberOfColors,
  };

  if (settings.mode === 'monochrome') {
    options.pal = MONOCHROME_PALETTE;
  }

  return options;
}

export async function loadRasterTraceAsset(file: File): Promise<RasterTraceAsset> {
  if (!isSupportedRasterFile(file)) {
    throw new Error(`Unsupported raster type. Load ${rasterTraceFormatLabel} files for tracing.`);
  }

  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);

  return {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    dataUrl,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    bytes: file.size,
  };
}

export async function traceRasterAssetToSvg(asset: RasterTraceAsset, settings: RasterTraceSettings) {
  const image = await loadImage(asset.dataUrl);
  const canvas = document.createElement('canvas');
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('The browser could not prepare a canvas context for tracing.');
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const preparedImageData = settings.mode === 'monochrome'
    ? buildMonochromeImageData(imageData, settings.threshold)
    : settings.mode === 'grayscale'
      ? buildGrayscaleImageData(imageData)
      : imageData;

  const svgMarkup = ImageTracer.imagedataToSVG(preparedImageData, buildImageTracerOptions(settings));
  return postprocessTracedSvgMarkup(svgMarkup, width, height, settings.mode === 'monochrome');
}

export function postprocessTracedSvgMarkup(svgMarkup: string, width: number, height: number, removeWhiteFills = false) {
  const documentRoot = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml');
  const parserError = documentRoot.querySelector('parsererror');
  if (parserError) {
    throw new Error(parserError.textContent?.trim() || 'The traced SVG output could not be parsed.');
  }

  const root = documentRoot.documentElement;
  const localName = root.localName || root.tagName;
  if (localName.toLowerCase() !== 'svg') {
    throw new Error('The traced output did not produce an SVG root element.');
  }

  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  root.setAttribute('viewBox', `0 0 ${width} ${height}`);

  if (removeWhiteFills) {
    Array.from(root.querySelectorAll('*')).forEach((node) => {
      const fillValue = getEffectiveFill(node);
      if (fillValue && isWhiteFill(fillValue)) {
        node.remove();
      }
    });
  }

  return new XMLSerializer().serializeToString(root);
}

function buildGrayscaleImageData(source: ImageData) {
  const nextData = new Uint8ClampedArray(source.data);

  for (let index = 0; index < nextData.length; index += 4) {
    const red = nextData[index] ?? 0;
    const green = nextData[index + 1] ?? 0;
    const blue = nextData[index + 2] ?? 0;
    const luminance = Math.round((red * 0.299) + (green * 0.587) + (blue * 0.114));
    nextData[index] = luminance;
    nextData[index + 1] = luminance;
    nextData[index + 2] = luminance;
  }

  return new ImageData(nextData, source.width, source.height);
}

function buildMonochromeImageData(source: ImageData, threshold: number) {
  const nextData = new Uint8ClampedArray(source.data);

  for (let index = 0; index < nextData.length; index += 4) {
    const alpha = nextData[index + 3] ?? 0;
    if (alpha === 0) {
      nextData[index] = 255;
      nextData[index + 1] = 255;
      nextData[index + 2] = 255;
      continue;
    }

    const red = nextData[index] ?? 0;
    const green = nextData[index + 1] ?? 0;
    const blue = nextData[index + 2] ?? 0;
    const luminance = (red * 0.299) + (green * 0.587) + (blue * 0.114);
    const channelValue = luminance >= threshold ? 255 : 0;
    nextData[index] = channelValue;
    nextData[index + 1] = channelValue;
    nextData[index + 2] = channelValue;
    nextData[index + 3] = 255;
  }

  return new ImageData(nextData, source.width, source.height);
}

function getEffectiveFill(node: Element) {
  const inlineFill = node.getAttribute('fill');
  if (inlineFill) {
    return inlineFill.trim().toLowerCase();
  }

  const inlineStyle = node.getAttribute('style');
  if (!inlineStyle) {
    return null;
  }

  const fillDeclaration = inlineStyle
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith('fill:'));

  return fillDeclaration ? fillDeclaration.slice(fillDeclaration.indexOf(':') + 1).trim().toLowerCase() : null;
}

function isWhiteFill(value: string) {
  return value === '#fff'
    || value === '#ffffff'
    || value === 'white'
    || value === 'rgb(255,255,255)'
    || value === 'rgb(255, 255, 255)'
    || value === 'rgba(255,255,255,1)'
    || value === 'rgba(255, 255, 255, 1)';
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The selected raster file could not be decoded by this browser.'));
    image.src = source;
  });
}