import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { SVGPathData } from 'svg-pathdata';
import {
  buildEdgePreservedImageData,
  buildImageTracerOptions,
  buildPosterizedImageData,
  createRasterTraceSettings,
  type RasterTraceSettings,
} from '../src/lib/svg-tracing';
import ImageTracer from 'imagetracerjs';
import type { ImageTracerPaletteColor } from 'imagetracerjs';

type ImageDataLike = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

type Candidate = {
  name: string;
  settings: RasterTraceSettings;
  alphaThreshold: number;
  paletteSize: number;
  paletteMode: 'none' | 'dominant' | 'patriotic3' | 'patriotic4';
};

type ShapeSummary = {
  fill: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  area: number;
};

const IMAGE_PATH = 'c:/Users/Admin/Documents/people_over_politics/public/images/logo.png';

function loadImageData(imagePath: string): ImageDataLike {
  const payloadPath = join(process.cwd(), '.tmp-trace-logo-pixels.json');
  const script = [
    'Add-Type -AssemblyName System.Drawing',
    `$bmp = [System.Drawing.Bitmap]::FromFile('${imagePath.replace(/'/g, "''")}')`,
    '$pixels = New-Object byte[] ($bmp.Width * $bmp.Height * 4)',
    '$index = 0',
    'for ($y = 0; $y -lt $bmp.Height; $y++) {',
    '  for ($x = 0; $x -lt $bmp.Width; $x++) {',
    '    $c = $bmp.GetPixel($x, $y)',
    '    $pixels[$index] = $c.R',
    '    $pixels[$index + 1] = $c.G',
    '    $pixels[$index + 2] = $c.B',
    '    $pixels[$index + 3] = $c.A',
    '    $index += 4',
    '  }',
    '}',
    '$width = $bmp.Width',
    '$height = $bmp.Height',
    '$bmp.Dispose()',
    `$payload = @{ width = $width; height = $height; data = [Convert]::ToBase64String($pixels) } | ConvertTo-Json -Compress | Set-Content -Encoding UTF8 '${payloadPath.replace(/'/g, "''")}'`,
  ].join('; ');

  execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
  const raw = readFileSync(payloadPath, 'utf8').trim();
  const payload = JSON.parse(raw) as { width: number; height: number; data: string };
  return {
    width: payload.width,
    height: payload.height,
    data: new Uint8ClampedArray(Buffer.from(payload.data, 'base64')),
  };
}

function toPreparedImageData(source: ImageDataLike, settings: RasterTraceSettings): ImageDataLike {
  const base = settings.photoCleanup && settings.mode !== 'monochrome'
    ? buildEdgePreservedImageData(source as ImageData, settings.photoCleanupStrength)
    : source as ImageData;
  const posterized = settings.posterize && settings.mode !== 'monochrome'
    ? buildPosterizedImageData(base as ImageData, settings.posterizeLevels, settings.mode === 'grayscale')
    : base;
  return {
    width: posterized.width,
    height: posterized.height,
    data: new Uint8ClampedArray(posterized.data),
  };
}

function cleanupAlphaEdges(source: ImageDataLike, threshold: number): ImageDataLike {
  const next = new Uint8ClampedArray(source.data);
  for (let index = 0; index < next.length; index += 4) {
    const alpha = next[index + 3] ?? 0;
    if (alpha < threshold) {
      next[index] = 0;
      next[index + 1] = 0;
      next[index + 2] = 0;
      next[index + 3] = 0;
    } else {
      next[index + 3] = 255;
    }
  }

  return { width: source.width, height: source.height, data: next };
}

function getDominantPalette(source: ImageDataLike, maxColors: number) {
  const buckets = new Map<string, { count: number; color: ImageTracerPaletteColor }>();
  for (let index = 0; index < source.data.length; index += 4) {
    const alpha = source.data[index + 3] ?? 0;
    if (alpha < 16) {
      continue;
    }
    const red = Math.round((source.data[index] ?? 0) / 16) * 16;
    const green = Math.round((source.data[index + 1] ?? 0) / 16) * 16;
    const blue = Math.round((source.data[index + 2] ?? 0) / 16) * 16;
    const key = `${red}-${green}-${blue}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
    } else {
      buckets.set(key, {
        count: 1,
        color: { r: red, g: green, b: blue, a: 255 },
      });
    }
  }

  const clusters: Array<{
    count: number;
    redTotal: number;
    greenTotal: number;
    blueTotal: number;
  }> = [];

  Array.from(buckets.values())
    .sort((left, right) => right.count - left.count)
    .forEach((entry) => {
      const cluster = clusters.find((candidate) => {
        const red = candidate.redTotal / candidate.count;
        const green = candidate.greenTotal / candidate.count;
        const blue = candidate.blueTotal / candidate.count;
        const distance = Math.abs(red - entry.color.r) + Math.abs(green - entry.color.g) + Math.abs(blue - entry.color.b);
        return distance <= 80;
      });

      if (cluster) {
        cluster.count += entry.count;
        cluster.redTotal += entry.color.r * entry.count;
        cluster.greenTotal += entry.color.g * entry.count;
        cluster.blueTotal += entry.color.b * entry.count;
        return;
      }

      clusters.push({
        count: entry.count,
        redTotal: entry.color.r * entry.count,
        greenTotal: entry.color.g * entry.count,
        blueTotal: entry.color.b * entry.count,
      });
    });

  return clusters
    .sort((left, right) => right.count - left.count)
    .slice(0, maxColors)
    .map((cluster) => ({
      r: Math.round(cluster.redTotal / cluster.count),
      g: Math.round(cluster.greenTotal / cluster.count),
      b: Math.round(cluster.blueTotal / cluster.count),
      a: 255,
    }));
}

function snapToPalette(source: ImageDataLike, palette: ImageTracerPaletteColor[]): ImageDataLike {
  const next = new Uint8ClampedArray(source.data);
  for (let index = 0; index < next.length; index += 4) {
    const alpha = next[index + 3] ?? 0;
    if (alpha === 0) {
      continue;
    }

    let best = palette[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    palette.forEach((color) => {
      const distance = Math.abs(color.r - next[index]) + Math.abs(color.g - next[index + 1]) + Math.abs(color.b - next[index + 2]);
      if (distance < bestDistance) {
        best = color;
        bestDistance = distance;
      }
    });

    next[index] = best.r;
    next[index + 1] = best.g;
    next[index + 2] = best.b;
    next[index + 3] = 255;
  }

  return { width: source.width, height: source.height, data: next };
}

function getPathBounds(d: string) {
  const commands = new SVGPathData(d).toAbs().commands;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let currentX = 0;
  let currentY = 0;

  commands.forEach((command) => {
    const pairs: Array<[number, number]> = [];
    if ('x' in command && 'y' in command && Number.isFinite(command.x) && Number.isFinite(command.y)) {
      pairs.push([command.x, command.y]);
      currentX = command.x;
      currentY = command.y;
    }
    if ('x1' in command && 'y1' in command && Number.isFinite(command.x1) && Number.isFinite(command.y1)) {
      pairs.push([command.x1, command.y1]);
    }
    if ('x2' in command && 'y2' in command && Number.isFinite(command.x2) && Number.isFinite(command.y2)) {
      pairs.push([command.x2, command.y2]);
    }
    if (command.type === SVGPathData.HORIZ_LINE_TO) {
      currentX = command.x;
      pairs.push([command.x, currentY]);
    }
    if (command.type === SVGPathData.VERT_LINE_TO) {
      currentY = command.y;
      pairs.push([currentX, command.y]);
    }
    pairs.forEach(([x, y]) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
  });

  if (!Number.isFinite(minX)) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

function summarizeShapes(svgMarkup: string) {
  const dom = new JSDOM(svgMarkup, { contentType: 'image/svg+xml' });
  const document = dom.window.document;
  const shapes: ShapeSummary[] = [];

  Array.from(document.querySelectorAll('path')).forEach((path) => {
    const d = path.getAttribute('d');
    const fill = (path.getAttribute('fill') ?? '').toLowerCase();
    if (!d || !fill) {
      return;
    }
    const bounds = getPathBounds(d);
    if (!bounds) {
      return;
    }
    shapes.push({
      fill,
      bounds,
      area: Math.max(0, bounds.maxX - bounds.minX) * Math.max(0, bounds.maxY - bounds.minY),
    });
  });

  return shapes;
}

function parseFillChannels(fill: string) {
  const normalized = fill.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return [
      Number.parseInt(normalized.slice(1, 3), 16),
      Number.parseInt(normalized.slice(3, 5), 16),
      Number.parseInt(normalized.slice(5, 7), 16),
    ] as const;
  }

  const rgb = normalized.match(/^rgb\(([^)]+)\)$/i);
  if (!rgb) {
    return null;
  }

  const channels = rgb[1].split(',').slice(0, 3).map((part) => Number.parseFloat(part.trim()));
  return channels.length === 3 && channels.every((value) => Number.isFinite(value))
    ? [channels[0], channels[1], channels[2]] as const
    : null;
}

function classifyFill(fill: string) {
  const channels = parseFillChannels(fill);
  if (!channels) {
    return 'other';
  }

  const [red, green, blue] = channels;
  if (blue > red + 20 && blue > green + 20) {
    return 'blue';
  }
  if (red > blue + 20 && red > green + 20) {
    return 'red';
  }
  return 'other';
}

function scorePolitics(shapes: ShapeSummary[]) {
  const bottomShapes = shapes.filter((shape) => shape.bounds.minY >= 350 && shape.bounds.maxY <= 530 && shape.area >= 1200);
  const blue = bottomShapes.filter((shape) => classifyFill(shape.fill) === 'blue');
  const red = bottomShapes.filter((shape) => classifyFill(shape.fill) === 'red');
  const blueCount = blue.length;
  const redCount = red.length;
  const fragmentPenalty = Math.max(0, bottomShapes.length - 8);
  const score = (Math.min(blueCount, 4) * 10) + (Math.min(redCount, 4) * 10) - (fragmentPenalty * 4);
  return { score, bottomShapes: bottomShapes.length, blueCount, redCount };
}

function buildCandidates(): Candidate[] {
  const base = createRasterTraceSettings('posterized-photo');
  const candidates: Candidate[] = [];

  [6].forEach((colors) => {
    [false].forEach((removeBackground) => {
      [1, 2].forEach((cleanup) => {
        [5].forEach((levels) => {
          [8, 12].forEach((pathomit) => {
            [180, 200].forEach((alphaThreshold) => {
              ['dominant'].forEach((paletteMode) => {
                [5, 6, 7].forEach((paletteSize) => {
                candidates.push({
                  name: `colors=${colors} cleanup=${cleanup} levels=${levels} omit=${pathomit} bg=${removeBackground} alpha=${alphaThreshold} palette=${paletteMode} size=${paletteSize}`,
                  settings: {
                    ...base,
                    numberOfColors: colors,
                    photoCleanupStrength: cleanup,
                    posterizeLevels: levels,
                    noiseFilter: pathomit,
                    removeBackground,
                  },
                  alphaThreshold,
                  paletteSize,
                  paletteMode: paletteMode as Candidate['paletteMode'],
                });
                });
              });
            });
          });
        });
      });
    });
  });

  return candidates;
}

function getPaletteForCandidate(candidate: Candidate, prepared: ImageDataLike) {
  if (candidate.paletteMode === 'none') {
    return null;
  }
  if (candidate.paletteMode === 'dominant') {
    return getDominantPalette(prepared, candidate.paletteSize);
  }
  if (candidate.paletteMode === 'patriotic3') {
    return [
      { r: 0, g: 64, b: 128, a: 255 },
      { r: 192, g: 0, b: 0, a: 255 },
      { r: 255, g: 255, b: 255, a: 255 },
    ];
  }

  return [
    { r: 0, g: 64, b: 128, a: 255 },
    { r: 192, g: 0, b: 0, a: 255 },
    { r: 255, g: 255, b: 255, a: 255 },
    { r: 0, g: 0, b: 0, a: 255 },
  ];
}

function main() {
  const image = loadImageData(IMAGE_PATH);
  const topResults: Array<{
    name: string;
    score: number;
    blueCount: number;
    redCount: number;
    bottomShapes: number;
    bottomShapesDetail: ShapeSummary[];
  }> = [];
  let bestResult: (typeof topResults)[number] | null = null;

  buildCandidates().forEach((candidate) => {
    const alphaCleaned = cleanupAlphaEdges(image, candidate.alphaThreshold);
    const prepared = toPreparedImageData(alphaCleaned, candidate.settings);
    const palette = getPaletteForCandidate(candidate, prepared);
    const snapped = palette ? snapToPalette(prepared, palette) : prepared;
    const baseOptions = buildImageTracerOptions(candidate.settings);
    const tracerOptions = {
      ...baseOptions,
      colorsampling: palette ? 0 : baseOptions.colorsampling,
      colorquantcycles: palette ? 1 : baseOptions.colorquantcycles,
      numberofcolors: palette ? palette.length : baseOptions.numberofcolors,
      pal: palette ?? undefined,
    };
    const svgMarkup = ImageTracer.imagedataToSVG(snapped as ImageData, tracerOptions);
    const shapes = summarizeShapes(svgMarkup);
    const bottomShapes = shapes.filter((shape) => shape.bounds.minY >= 350 && shape.bounds.maxY <= 530 && shape.area >= 1200);
    const result = {
      name: candidate.name,
      bottomShapesDetail: bottomShapes,
      ...scorePolitics(shapes),
    };
    if (!bestResult || result.score > bestResult.score) {
      bestResult = result;
    }
    topResults.push(result);
    topResults.sort((left, right) => right.score - left.score);
    if (topResults.length > 10) {
      topResults.length = 10;
    }
  });

  topResults.forEach((result, index) => {
    console.log(`${index + 1}. ${result.name} -> score=${result.score} blue=${result.blueCount} red=${result.redCount} shapes=${result.bottomShapes}`);
  });

  if (!bestResult) {
    throw new Error('No candidates evaluated.');
  }

  const best = bestResult;
  console.log('BEST DETAIL');
  best.bottomShapesDetail.forEach((shape) => {
    console.log(`${shape.fill} :: x=${shape.bounds.minX}-${shape.bounds.maxX} y=${shape.bounds.minY}-${shape.bounds.maxY} area=${Math.round(shape.area)} type=${classifyFill(shape.fill)}`);
  });
}

main();