import * as opentype from 'opentype.js';

export type UploadedFontAsset = {
  id: string;
  fileName: string;
  familyName: string;
  font: opentype.Font;
};

export type FontMapping = Record<string, string>;

export type TextConversionOptions = {
  uploadedFonts?: UploadedFontAsset[];
  fontMappings?: FontMapping;
};

function createFontId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `font-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeFontFamilyName(value: string | null) {
  if (!value) {
    return '';
  }

  const firstFamily = value
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .find(Boolean);

  return firstFamily?.toLowerCase() ?? '';
}

export function getFontDisplayFamily(font: opentype.Font) {
  return (
    font.names.fontFamily?.en ??
    font.names.fullName?.en ??
    'Uploaded font'
  );
}

export async function parseUploadedFontFile(file: File): Promise<UploadedFontAsset> {
  const buffer = await file.arrayBuffer();
  const font = opentype.parse(buffer);

  return {
    id: createFontId(),
    fileName: file.name,
    familyName: getFontDisplayFamily(font),
    font,
  };
}