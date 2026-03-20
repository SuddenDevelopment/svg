import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as opentype from 'opentype.js';
import App from './App';

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

function createEmbeddedFontDataUrl() {
  const path = new opentype.Path();
  path.moveTo(0, 0);
  path.lineTo(500, 0);
  path.lineTo(500, 700);
  path.lineTo(0, 700);
  path.close();

  const font = new opentype.Font({
    familyName: 'Workbench Font',
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

  const bytes = new Uint8Array(font.toArrayBuffer());
  const binary = Array.from(bytes, (value) => String.fromCharCode(value)).join('');
  return `data:font/ttf;base64,${btoa(binary)}`;
}

describe('App', () => {
  it('renders initial sample analysis', () => {
    render(<App />);

    expect(screen.getAllByText('sample.svg').length).toBeGreaterThan(0);
    expect(screen.getByText('Structure analysis')).toBeInTheDocument();
    expect(screen.getByText('Export readiness')).toBeInTheDocument();
    expect(screen.getByText('Text elements found. Geometry-only exports may need text-to-path conversion.')).toBeInTheDocument();
  });

  it('shows blocked export readiness details for text-based SVGs', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="10">Hello</text></svg>',
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Blocked', { selector: '.readiness-badge' })).toBeInTheDocument();
    });

    expect(screen.getByText('1 text element still need conversion support or embedded fonts for geometry-only export.')).toBeInTheDocument();
  });

  it('shows parse error feedback when the source is invalid', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: { value: '<svg><g></svg>' },
    });

    await waitFor(() => {
      expect(screen.getByText('Parse error')).toBeInTheDocument();
    });
  });

  it('applies shape normalization from the repair panel', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Convert 2 shape primitives to paths' }));

    await waitFor(() => {
      expect(screen.getByText('Converted 2 shape primitives into path elements.')).toBeInTheDocument();
    });
  });

  it('applies container transform baking from the repair panel', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(5 7)"><rect x="0" y="0" width="10" height="10" /></g></svg>',
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Bake 1 container transforms' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Bake 1 container transforms' }));

    await waitFor(() => {
      expect(screen.getByText('Baked 1 container transform into descendant geometry.')).toBeInTheDocument();
    });
  });

  it('expands use references from the repair panel', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><defs><rect id="shape" width="10" height="10" /></defs><use href="#shape" x="5" y="7" /></svg>',
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Expand 1 use references' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Expand 1 use references' }));

    await waitFor(() => {
      expect(screen.getByText('Expanded 1 <use> reference into concrete geometry.')).toBeInTheDocument();
    });
  });

  it('inlines simple style rules from the repair panel', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><style>.shape { fill: red; }</style><rect class="shape" width="10" height="10" /></svg>',
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Inline 1 simple style rules' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Inline 1 simple style rules' }));

    await waitFor(() => {
      expect(screen.getByText('Inlined 1 simple style rule into element styles.')).toBeInTheDocument();
    });
  });

  it('converts embedded-font text from the repair panel', async () => {
    const fontDataUrl = createEmbeddedFontDataUrl();
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: `<svg xmlns="http://www.w3.org/2000/svg"><style>@font-face { font-family: 'Workbench Font'; src: url(${fontDataUrl}); }</style><text font-family="Workbench Font" font-size="32" x="0" y="40">A</text></svg>`,
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Convert 1 text elements to paths' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Convert 1 text elements to paths' }));

    await waitFor(() => {
      expect(screen.getByText('Converted 1 text element to paths.')).toBeInTheDocument();
    });
  });

  it('uploads a font and maps it to a missing SVG family before converting text', async () => {
    const fontBuffer = createFontArrayBuffer('Uploaded Workbench');
    const uploadedFontFile = new File([fontBuffer], 'uploaded-workbench.otf', { type: 'font/otf' });
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Missing Font" font-size="32" x="0" y="40">A</text></svg>',
      },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Map Missing Font font family')).toBeInTheDocument();
    });

    const fontInput = document.querySelector('input[type="file"][accept*=".ttf"]') as HTMLInputElement | null;
    expect(fontInput).not.toBeNull();

    fireEvent.change(fontInput!, {
      target: {
        files: [uploadedFontFile],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Uploaded Workbench')).toBeInTheDocument();
    });

    const mappingSelect = screen.getByLabelText('Map Missing Font font family') as HTMLSelectElement;
    fireEvent.change(mappingSelect, {
      target: {
        value: mappingSelect.options[1]?.value,
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Convert 1 text elements to paths' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Convert 1 text elements to paths' }));

    await waitFor(() => {
      expect(screen.getByText('Converted 1 text element to paths.')).toBeInTheDocument();
    });
  });

  it('applies the safe repair pass from the repair panel', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('SVG source'), {
      target: {
        value: '<svg xmlns="http://www.w3.org/2000/svg"><style>.shape { fill: red; }</style><defs><rect id="shape" class="shape" width="10" height="10" transform="translate(1 2)" /></defs><g transform="translate(3 4)"><rect x="0" y="0" width="5" height="6" /></g><use href="#shape" x="5" y="7" /></svg>',
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Normalize all safe repairs (6)' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Normalize all safe repairs (6)' }));

    await waitFor(() => {
      expect(screen.getByText('Applied 1 style rules, 2 shapes, 1 direct transforms, 1 container transforms, 1 use references.')).toBeInTheDocument();
    });
  });

  it('downloads the normalized export from the export panel', async () => {
    const createObjectURL = vi.fn(() => 'blob:test-url');
    const revokeObjectURL = vi.fn();
    const click = vi.fn();

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    HTMLAnchorElement.prototype.click = click;

    try {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Download Normalized SVG' }));

      await waitFor(() => {
        expect(screen.getByText(/Downloaded sample\.normalized\.svg/)).toBeInTheDocument();
      });

      expect(screen.getByText('Last export')).toBeInTheDocument();
      expect(screen.getByText('Normalized SVG')).toBeInTheDocument();
      expect(screen.getByText('2 shapes converted to paths')).toBeInTheDocument();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      HTMLAnchorElement.prototype.click = originalClick;
    }

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });

  it('downloads the blender-friendly preset from the export panel', async () => {
    const createObjectURL = vi.fn(() => 'blob:test-url');
    const revokeObjectURL = vi.fn();
    const click = vi.fn();

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    HTMLAnchorElement.prototype.click = click;

    try {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: /Blender-friendly/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Download Blender-friendly SVG' }));

      await waitFor(() => {
        expect(screen.getByText(/Downloaded sample\.blender\.svg/)).toBeInTheDocument();
      });

      expect(screen.getByText('Blender-friendly SVG')).toBeInTheDocument();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      HTMLAnchorElement.prototype.click = originalClick;
    }
  });

  it('records a report for current exports', async () => {
    const createObjectURL = vi.fn(() => 'blob:test-url');
    const revokeObjectURL = vi.fn();
    const click = vi.fn();

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;

    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    HTMLAnchorElement.prototype.click = click;

    try {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Download current SVG' }));

      await waitFor(() => {
        expect(screen.getByText('Current SVG')).toBeInTheDocument();
      });

      expect(screen.getByText('No automatic repairs applied.')).toBeInTheDocument();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      HTMLAnchorElement.prototype.click = originalClick;
    }
  });

  it('copies the normalized preset to the clipboard', async () => {
    const writeText = vi.fn(async () => undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    try {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy Normalized SVG' }));

      await waitFor(() => {
        expect(screen.getByText('Last copy')).toBeInTheDocument();
      });

      expect(screen.getByText('Normalized SVG')).toBeInTheDocument();
      expect(writeText).toHaveBeenCalledTimes(1);
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', originalClipboard);
      }
    }
  });
});
