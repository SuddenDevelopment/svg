import { describe, expect, it } from 'vitest';
import * as opentype from 'opentype.js';
import { parseUploadedFontFile } from './svg-fonts';

function createFontArrayBuffer(familyName = 'Uploaded Workbench') {
  const path = new opentype.Path();
  path.moveTo(0, 0);
  path.lineTo(500, 0);
  path.lineTo(500, 700);
  path.lineTo(0, 700);
  path.close();

  const font = new opentype.Font({
    familyName,
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: [
      new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
      new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 320, path: new opentype.Path() }),
      new opentype.Glyph({ name: 'A', unicode: 65, advanceWidth: 700, path }),
    ],
  });

  return font.toArrayBuffer();
}

describe('parseUploadedFontFile', () => {
  it('parses an uploaded font and exposes its family name', async () => {
    const fontBuffer = createFontArrayBuffer('Uploaded Workbench');
    const file = new File([fontBuffer], 'uploaded-workbench.otf', { type: 'font/otf' });

    const fontAsset = await parseUploadedFontFile(file);

    expect(fontAsset.fileName).toBe('uploaded-workbench.otf');
    expect(fontAsset.familyName).toBe('Uploaded Workbench');
    expect(fontAsset.id).toBeTruthy();
  });
});