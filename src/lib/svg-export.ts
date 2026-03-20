export type ExportVariant = 'current' | 'safe' | 'blender';

function stripSvgExtension(fileName: string) {
  return fileName.replace(/\.svg$/i, '') || 'graphic';
}

export function buildExportFileName(fileName: string, variant: ExportVariant) {
  const baseName = stripSvgExtension(fileName.trim() || 'graphic.svg');

  switch (variant) {
    case 'current':
      return `${baseName}.svg`;
    case 'safe':
      return `${baseName}.normalized.svg`;
    case 'blender':
      return `${baseName}.blender.svg`;
  }
}

export function getExportVariantLabel(variant: ExportVariant) {
  switch (variant) {
    case 'current':
      return 'Current SVG';
    case 'safe':
      return 'Normalized SVG';
    case 'blender':
      return 'Blender-friendly SVG';
  }
}

export function downloadSvgSource(source: string, fileName: string) {
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function copySvgSourceToClipboard(source: string) {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard writing is not available in this browser context.');
  }

  await navigator.clipboard.writeText(source);
}