# SVG Support Matrix

A practical, per-feature summary of what SpecIO supports today. This matches the validated test scenarios and observed importer/exporter behavior.

## Containers and structure

| Element | Import | Export | Notes |
|---|---|---|---|
| `<svg>` | ✓ | ✓ | Root document; `viewBox` honored for sizing |
| `<g>` | ✓ | ✓ | Becomes a Blender collection; sibling order preserved via metadata |
| `<defs>` | ✓ (indexed) | ✓ | Used for gradients and `<use>` lookups |
| `<symbol>` | ✓ (indexed) | — | Resolved when referenced by `<use>` |
| `<use href="#id">` | ✓ | — | Local references only; expanded inline at import time |
| `<style>` (CSS block) | ✓ | — | Selectors parsed and applied to matching elements at import |

## Vector geometry

| Element | Import | Export source |
|---|---|---|
| `<rect>` (incl. `rx`/`ry` rounded) | ✓ | Curves |
| `<circle>` | ✓ | Curves |
| `<ellipse>` | ✓ | Curves |
| `<line>` | ✓ | Curves |
| `<polyline>` | ✓ | Curves |
| `<polygon>` | ✓ | Curves |
| `<path>` | ✓ | Curves and Text |

Exported geometry is always written as `<path>` for curves and text, regardless of the source SVG primitive.

## Path commands

Supported on both import and export. Lowercase variants (relative coordinates) are equivalent to their uppercase counterparts.

| Command | Meaning |
|---|---|
| `M` / `m` | Move to |
| `L` / `l` | Line to |
| `H` / `h` | Horizontal line |
| `V` / `v` | Vertical line |
| `C` / `c` | Cubic Bezier |
| `S` / `s` | Smooth cubic Bezier |
| `Q` / `q` | Quadratic Bezier |
| `T` / `t` | Smooth quadratic — *normalized to cubic* on import |
| `A` / `a` | Arc — *normalized to cubic* on import |
| `Z` / `z` | Close path |

Round-trip note: an SVG that uses `T` or `A` will export as cubic curves, not as the original `T`/`A` commands. The geometry is preserved; the textual command form is not.

## Text

| Feature | Import | Export | Notes |
|---|---|---|---|
| `<text>` content | ✓ | ✓ | Becomes Blender FontCurve; exports as `<path>` |
| `x` / `y` position | ✓ | ✓ | |
| `transform` | ✓ | ✓ | Applied as Blender object transform |
| `font-size` | ✓ | ✓ | Pixels assumed if no unit given |
| `text-anchor` | ✓ (`start`/`middle`/`end` → `LEFT`/`CENTER`/`RIGHT`) | ✓ | |
| `<tspan>` | ✗ | ✗ | Not supported |
| `<textPath>` | ✗ | ✗ | Not supported |
| Multi-line / wrapping | Limited | Limited | Single-line `<text>` content only |

Text objects extruded or beveled in Blender export as path silhouettes when in camera-projected mode.

## Raster images

| Source | Import | Export |
|---|---|---|
| Local file path (relative or absolute) | ✓ | ✓ (Embed or Link mode) |
| `data:image/...;base64,...` URIs | ✓ | ✓ |
| `http://`, `https://`, `ftp://`, `//` | ✗ rejected (security) | — |

Supported image MIME types: `image/png`, `image/jpeg` (incl. `image/jpg`), `image/webp`, `image/gif`, `image/bmp`, `image/tiff`.

## Paint and presentation

| Attribute / style | Import | Export |
|---|---|---|
| `fill` (named, hex, rgb, currentColor, none) | ✓ | ✓ |
| `stroke` | ✓ | ✓ |
| `stroke-width` | ✓ | ✓ |
| `stroke-linecap` | ✓ | ✓ |
| `stroke-linejoin` | ✓ | ✓ |
| `fill="none"`, `stroke="none"` | ✓ | ✓ |
| `display="none"`, `visibility="hidden"` | ✓ (skipped) | — |
| Inline `style="..."` | ✓ | — (style attributes written as discrete attributes) |
| Inherited styles from parent elements | ✓ | — |
| CSS `<style>` rules | ✓ | — |
| `fill-rule` (`evenodd`) | ✓ (informs splitting) | Partially preserved |
| `opacity`, `fill-opacity`, `stroke-opacity` | ✓ | ✓ |

## Gradients

| Feature | Import | Export |
|---|---|---|
| `<linearGradient>` | ✓ | ✓ (managed gradients written to `<defs>`) |
| `<radialGradient>` | ✓ | ✓ |
| `gradientTransform` | ✓ preserved | ✓ written back |
| `spreadMethod` (`pad`/`repeat`/`reflect`) | ✓ | ✓ |
| Multi-stop gradients | ✓ | ✓ (UI edits 2 stops; payload preserves more) |
| `fill="url(#id)"` / `stroke="url(#id)"` | ✓ | ✓ |
| Simultaneous fill+stroke gradients on the same element | Partial | Partial |

See [Managed Gradient Workflow](gradients.md) for authoring details.

## Transforms

| Transform | Import | Export |
|---|---|---|
| `translate(...)` | ✓ | ✓ |
| `scale(...)` | ✓ | ✓ |
| `rotate(...)` | ✓ | ✓ |
| `matrix(...)` | ✓ | ✓ |
| `skewX(...)`, `skewY(...)` | ✓ | ✓ |
| Nested transforms in `<g>` chains | ✓ | ✓ |

## Units

| Source | Behavior |
|---|---|
| Unitless coordinates | ✓ treated as user units |
| `viewBox` | ✓ honored for sizing |
| `width` / `height` with units (`px`, `mm`, `pt`, `in`) | Partial — full unit conversion not implemented |
| `%` values | ✗ not supported |

For predictable results, ensure your source SVG uses explicit `viewBox` and unitless or pixel coordinates.

## Camera-view export (Blender → SVG)

| Source object | Supported |
|---|---|
| Curves | ✓ (always; projected when in camera view) |
| Text (FontCurve) | ✓ (projected when in camera view) |
| Image planes | ✓ (projected when in camera view) |
| Meshes | ✓ — front-facing polygons silhouetted as filled paths |
| Grease Pencil | ✗ |
| Volumes / particles | ✗ |
| Modifiers (Subsurf, Bevel, etc.) | ✗ — not evaluated for export |

## Explicitly NOT supported

These elements/features are recognized but ignored, or actively unsupported:

- `<tspan>`, `<textPath>` (text styling/path-following beyond simple `<text>`)
- `<clipPath>`, `<mask>` (clipping and masking)
- SVG filters (`<filter>` and friends)
- SVG animation (`<animate>`, `<animateTransform>`, SMIL)
- `<script>` content (intentionally not executed)
- Remote raster images (`http://`, `https://`, `ftp://`, protocol-relative `//`)
- Full CSS unit conversion (`mm`, `pt`, `in`, `%`)
- Multi-line text wrapping inside a single `<text>` element
- External stylesheet references (`<link rel="stylesheet">`)

If your SVG depends on any of these, expect missing or simplified geometry on import. The importer will skip unsupported elements rather than fail.

## Roundtrip determinism

When exporting an unmodified SpecIO-imported scene:

- Group hierarchy and sibling order match the source
- SVG ids are preserved
- Numeric output is stable (deterministic byte-for-byte for the same precision setting)

Path commands may normalize (`T`→cubic, `A`→cubic), so the exported file is geometrically equivalent but not byte-identical to the source.
