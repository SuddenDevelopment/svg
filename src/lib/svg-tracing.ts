import ImageTracer from 'imagetracerjs';
import type { ImageTracerOptions, ImageTracerPaletteColor } from 'imagetracerjs';

export type RasterTraceMode = 'color' | 'grayscale' | 'monochrome';
export type RasterTracePresetId = 'illustration' | 'logo' | 'photo' | 'grayscale' | 'posterized-photo';

export type RasterTraceSettings = {
  presetId: RasterTracePresetId;
  mode: RasterTraceMode;
  numberOfColors: number;
  threshold: number;
  detail: number;
  blurRadius: number;
  noiseFilter: number;
  enhanceCorners: boolean;
  photoCleanup: boolean;
  photoCleanupStrength: number;
  posterize: boolean;
  posterizeLevels: number;
  removeBackground: boolean;
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

function createImageDataResult(data: Uint8ClampedArray, width: number, height: number) {
  const imageDataArray = new Uint8ClampedArray(data);
  return typeof ImageData === 'function'
    ? new ImageData(imageDataArray, width, height)
    : ({ data: imageDataArray, width, height } as ImageData);
}

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
    id: 'posterized-photo',
    label: 'Posterized photo',
    description: 'Pre-posterizes JPEG or photo sources before tracing so compression noise collapses into cleaner color regions.',
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
        photoCleanup: false,
        photoCleanupStrength: 1,
        posterize: false,
        posterizeLevels: 2,
        removeBackground: true,
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
        photoCleanup: true,
        photoCleanupStrength: 2,
        posterize: false,
        posterizeLevels: 6,
        removeBackground: false,
      };
    case 'posterized-photo':
      return {
        presetId,
        mode: 'color',
        numberOfColors: 10,
        threshold: 160,
        detail: 2,
        blurRadius: 2,
        noiseFilter: 8,
        enhanceCorners: false,
        photoCleanup: true,
        photoCleanupStrength: 2,
        posterize: true,
        posterizeLevels: 6,
        removeBackground: false,
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
        photoCleanup: true,
        photoCleanupStrength: 1,
        posterize: true,
        posterizeLevels: 7,
        removeBackground: false,
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
        photoCleanup: false,
        photoCleanupStrength: 1,
        posterize: false,
        posterizeLevels: 6,
        removeBackground: false,
      };
  }
}

export function isJpegRasterAsset(file: Pick<File, 'name' | 'type'> | RasterTraceAsset) {
  const fileName = 'fileName' in file ? file.fileName : file.name;
  const mimeType = 'mimeType' in file ? file.mimeType : file.type;
  const lowerName = fileName.toLowerCase();
  return mimeType === 'image/jpeg' || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg');
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
  const cleanedImageData = settings.photoCleanup && settings.mode !== 'monochrome'
    ? buildEdgePreservedImageData(imageData, settings.photoCleanupStrength)
    : imageData;
  const preparedBaseImageData = settings.mode === 'monochrome'
    ? buildMonochromeImageData(cleanedImageData, settings.threshold)
    : settings.mode === 'grayscale'
      ? buildGrayscaleImageData(cleanedImageData)
      : cleanedImageData;
  const preparedImageData = settings.posterize && settings.mode !== 'monochrome'
    ? buildPosterizedImageData(preparedBaseImageData, settings.posterizeLevels, settings.mode === 'grayscale')
    : preparedBaseImageData;

  const svgMarkup = ImageTracer.imagedataToSVG(preparedImageData, buildImageTracerOptions(settings));
  return postprocessTracedSvgMarkup(svgMarkup, width, height, {
    removeWhiteFills: settings.mode === 'monochrome',
    removeBackground: settings.removeBackground,
  });
}

export function postprocessTracedSvgMarkup(
  svgMarkup: string,
  width: number,
  height: number,
  cleanupOptions: boolean | { removeWhiteFills?: boolean; removeBackground?: boolean } = false,
) {
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

  const options = typeof cleanupOptions === 'boolean'
    ? { removeWhiteFills: cleanupOptions, removeBackground: false }
    : { removeWhiteFills: false, removeBackground: false, ...cleanupOptions };

  if (options.removeWhiteFills) {
    Array.from(root.querySelectorAll('*')).forEach((node) => {
      const fillValue = getEffectiveFill(node);
      if (fillValue && isWhiteFill(fillValue)) {
        node.remove();
      }
    });
  }

  if (options.removeBackground) {
    removeLikelyBackgroundNode(root, width, height);
  }

  return new XMLSerializer().serializeToString(root);
}

export function buildEdgePreservedImageData(source: ImageData, strength: number) {
  const radius = Math.max(1, Math.min(3, Math.round(strength)));
  const edgeThreshold = 28 + (radius * 24);
  const width = source.width;
  const height = source.height;
  const sourceData = source.data;
  const nextData = new Uint8ClampedArray(sourceData.length);

  const getOffset = (x: number, y: number) => ((y * width) + x) * 4;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = getOffset(x, y);
      const centerAlpha = sourceData[offset + 3] ?? 0;
      if (centerAlpha === 0) {
        nextData[offset] = sourceData[offset] ?? 0;
        nextData[offset + 1] = sourceData[offset + 1] ?? 0;
        nextData[offset + 2] = sourceData[offset + 2] ?? 0;
        nextData[offset + 3] = 0;
        continue;
      }

      const centerRed = sourceData[offset] ?? 0;
      const centerGreen = sourceData[offset + 1] ?? 0;
      const centerBlue = sourceData[offset + 2] ?? 0;

      let weightTotal = 2.4;
      let redTotal = centerRed * weightTotal;
      let greenTotal = centerGreen * weightTotal;
      let blueTotal = centerBlue * weightTotal;

      for (let sampleY = Math.max(0, y - radius); sampleY <= Math.min(height - 1, y + radius); sampleY += 1) {
        for (let sampleX = Math.max(0, x - radius); sampleX <= Math.min(width - 1, x + radius); sampleX += 1) {
          if (sampleX === x && sampleY === y) {
            continue;
          }

          const sampleOffset = getOffset(sampleX, sampleY);
          const sampleAlpha = sourceData[sampleOffset + 3] ?? 0;
          if (sampleAlpha === 0) {
            continue;
          }

          const sampleRed = sourceData[sampleOffset] ?? 0;
          const sampleGreen = sourceData[sampleOffset + 1] ?? 0;
          const sampleBlue = sourceData[sampleOffset + 2] ?? 0;
          const colorDifference = (
            Math.abs(sampleRed - centerRed)
            + Math.abs(sampleGreen - centerGreen)
            + Math.abs(sampleBlue - centerBlue)
          ) / 3;

          if (colorDifference > edgeThreshold * 1.6) {
            continue;
          }

          const distanceSquared = ((sampleX - x) ** 2) + ((sampleY - y) ** 2);
          const spatialWeight = 1 / (1 + distanceSquared);
          const colorWeight = Math.max(0.08, 1 - (colorDifference / edgeThreshold));
          const weight = spatialWeight * colorWeight;

          redTotal += sampleRed * weight;
          greenTotal += sampleGreen * weight;
          blueTotal += sampleBlue * weight;
          weightTotal += weight;
        }
      }

      nextData[offset] = Math.round(redTotal / weightTotal);
      nextData[offset + 1] = Math.round(greenTotal / weightTotal);
      nextData[offset + 2] = Math.round(blueTotal / weightTotal);
      nextData[offset + 3] = centerAlpha;
    }
  }

  return createImageDataResult(nextData, width, height);
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

  return createImageDataResult(nextData, source.width, source.height);
}

export function buildPosterizedImageData(source: ImageData, levels: number, grayscaleOnly = false) {
  const normalizedLevels = Math.max(2, Math.min(16, Math.round(levels)));
  const nextData = new Uint8ClampedArray(source.data);
  const quantizeChannel = (value: number) => {
    const ratio = value / 255;
    const stepIndex = Math.round(ratio * (normalizedLevels - 1));
    return Math.round((stepIndex / (normalizedLevels - 1)) * 255);
  };

  for (let index = 0; index < nextData.length; index += 4) {
    if (grayscaleOnly) {
      const luminance = quantizeChannel(nextData[index] ?? 0);
      nextData[index] = luminance;
      nextData[index + 1] = luminance;
      nextData[index + 2] = luminance;
      continue;
    }

    nextData[index] = quantizeChannel(nextData[index] ?? 0);
    nextData[index + 1] = quantizeChannel(nextData[index + 1] ?? 0);
    nextData[index + 2] = quantizeChannel(nextData[index + 2] ?? 0);
  }

  return createImageDataResult(nextData, source.width, source.height);
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

  return createImageDataResult(nextData, source.width, source.height);
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

function removeLikelyBackgroundNode(root: Element, width: number, height: number) {
  const directChildren = Array.from(root.children);
  const candidate = directChildren.find((node) => {
    const fillValue = getEffectiveFill(node);
    if (!fillValue || !isNearWhiteFill(fillValue)) {
      return false;
    }

    const coverage = getApproximateNodeCoverage(node);
    if (!coverage) {
      return false;
    }

    const marginX = Math.max(2, width * 0.04);
    const marginY = Math.max(2, height * 0.04);
    const spansWidth = coverage.minX <= marginX && coverage.maxX >= width - marginX;
    const spansHeight = coverage.minY <= marginY && coverage.maxY >= height - marginY;
    const coversMostWidth = (coverage.maxX - coverage.minX) >= width * 0.94;
    const coversMostHeight = (coverage.maxY - coverage.minY) >= height * 0.94;

    return spansWidth && spansHeight && coversMostWidth && coversMostHeight;
  });

  candidate?.remove();
}

function getApproximateNodeCoverage(node: Element) {
  const localName = (node.localName || node.tagName).toLowerCase();
  if (localName === 'rect') {
    const x = Number.parseFloat(node.getAttribute('x') ?? '0');
    const y = Number.parseFloat(node.getAttribute('y') ?? '0');
    const width = Number.parseFloat(node.getAttribute('width') ?? '0');
    const height = Number.parseFloat(node.getAttribute('height') ?? '0');
    if ([x, y, width, height].some((value) => Number.isNaN(value))) {
      return null;
    }

    return {
      minX: x,
      minY: y,
      maxX: x + width,
      maxY: y + height,
    };
  }

  const serializedPoints = node.getAttribute('d') ?? node.getAttribute('points');
  if (!serializedPoints) {
    return null;
  }

  const values = Array.from(serializedPoints.matchAll(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi), (match) => Number.parseFloat(match[0]));
  if (values.length < 4) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < values.length - 1; index += 2) {
    const x = values[index];
    const y = values[index + 1];
    if (x === undefined || y === undefined || Number.isNaN(x) || Number.isNaN(y)) {
      continue;
    }
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)
    ? { minX, minY, maxX, maxY }
    : null;
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

function isNearWhiteFill(value: string) {
  const channels = parseColorChannels(value);
  if (!channels) {
    return isWhiteFill(value);
  }

  const [red, green, blue] = channels;
  const luminance = (red * 0.299) + (green * 0.587) + (blue * 0.114);
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  return luminance >= 244 && chroma <= 22;
}

function parseColorChannels(value: string) {
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    const red = Number.parseInt(`${normalized[1]}${normalized[1]}`, 16);
    const green = Number.parseInt(`${normalized[2]}${normalized[2]}`, 16);
    const blue = Number.parseInt(`${normalized[3]}${normalized[3]}`, 16);
    return [red, green, blue] as const;
  }

  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    const red = Number.parseInt(normalized.slice(1, 3), 16);
    const green = Number.parseInt(normalized.slice(3, 5), 16);
    const blue = Number.parseInt(normalized.slice(5, 7), 16);
    return [red, green, blue] as const;
  }

  const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgbMatch) {
    return null;
  }

  const channels = rgbMatch[1].split(',').slice(0, 3).map((channel) => Number.parseFloat(channel.trim()));
  return channels.length === 3 && channels.every((channel) => Number.isFinite(channel))
    ? [channels[0], channels[1], channels[2]] as const
    : null;
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