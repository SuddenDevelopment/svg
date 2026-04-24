# Exporting SVG

The `Export Selected` action (operator id `specio.export_svg`) writes selected Blender objects to a `.svg` file. SpecIO supports four kinds of source content in a single export:

1. **Curve objects** — exported as SVG `<path>` data (one path per spline group).
2. **Text objects** — exported as SVG paths derived from the text geometry.
3. **Image planes** — exported as SVG `<image>` elements (embedded base64 or linked file).
4. **Mesh objects** — exported as **2D camera-projected silhouettes** when the viewport is in camera view.

You can mix all four in one export. Selection ordering is preserved through the original SVG sibling order metadata where available, then by collection path, so a re-export of an imported SVG produces stable output.

## Running the export

1. Select the objects you want to export. Selection rules differ by mode (see below).
2. Open the `SVG` sidebar tab. The **EXPORT** boxed section is below **IMPORT**.
3. Review the export settings.
4. Click `Export Selected`.
5. Pick an output path. The file extension must be `.svg`.

On success the status bar shows `Successfully exported SVG to: <path>`. On failure it shows `Failed to export SVG: <reason>`.

`Export Selected` is registered with `REGISTER, UNDO`.

## What can be exported

| Selected object | Exported as | Notes |
|---|---|---|
| Curve (`type == 'CURVE'`) with at least one spline | One `<path>` per resolved style group | Synthetic stroke helpers (`specio_svg_stroke_helper`) are skipped — their styling rejoins the fill object on export |
| Text (`type == 'FONT'`) | `<path>` | Position, transform, font size, and `text-anchor` alignment are converted back |
| Image plane (created by SpecIO import) | `<image>` | Mode controlled by the `Images` setting (`Embed` or `Link`) |
| Mesh (`type == 'MESH'`) | 2D camera silhouette `<path>`s | **Requires** an active scene camera and the 3D viewport in camera perspective; one path per visible polygon (or per material/visibility group depending on settings) |

If you select only meshes without a camera-view viewport, the operator reports an error before opening the file browser:

- `Active scene camera required for SVG export` — set a camera in the scene.
- `SVG export requires the active 3D viewport to be in camera perspective` — press `Numpad 0` in the viewport you are exporting from.

If you select objects but none of them match an exportable type, you get:

- `Select at least one curve, text, or image object to export, or select mesh objects with an active scene camera for camera-view export`

## Camera-projected export

Whenever the viewport is in camera perspective and a scene camera is set, **all** selected geometry is projected through the camera into 2D SVG space:

- Curve and text objects are projected using their world coordinates through the camera matrix.
- Mesh objects are silhouetted face-by-face (front-facing polygons only) and written as filled paths.
- Image planes are projected too.

If the viewport is **not** in camera perspective (or there is no scene camera), curves/text/images export using their XY world coordinates directly, and meshes are not exportable.

The exported SVG document size matches the camera's render resolution (multiplied by the export `Scale`). If the render is set to 1920×1080 and Scale is `1.0`, the SVG `viewBox` will be 1920×1080.

### Cull to Camera

When **on** (default), geometry whose projected bounding box falls entirely outside the camera viewport is dropped from output. This keeps off-screen content out of large camera-export files.

When **off**, off-screen content is exported as-is and may produce SVG paths outside the document bounds.

### Mesh Color Mode

Two options for how mesh face fills are colored in the SVG:

- **Material Heuristic** (default) — read the assigned material's Base Color (or first node color) directly. Fast, deterministic, ignores lighting. Best when you want flat editorial-style fills.
- **Sample Final Camera Color** — render the scene with Eevee from the active camera, then sample the lit color at each face's projected centroid. Produces shaded-looking output. Slower; only front-facing polygons whose centroid is visible to the camera are kept.

When `Sample Final Camera Color` is selected, the panel shows an info banner reminding you of these tradeoffs.

## Selection persistence across the file browser

When you click `Export Selected`, SpecIO snapshots the names of currently selected objects into a hidden operator property and uses those names if the file-browser context loses the original selection. This means you can click the button, navigate the file dialog, and the export will still target the objects you had highlighted in the viewport.

## Export settings

All settings live under `scene.specio` and are editable in the **EXPORT** boxed section of the SVG sidebar. Their defaults come from addon preferences.

### Scale

Multiplier from Blender units to SVG user units. Default `1.0`. Range `0.001` to `1000.0`.

### Precision

Decimal places written for SVG numbers. Default `3`. Range `0` to `10`.

Lower numbers produce smaller files at the cost of geometric precision. `3` is a good balance for most use cases. `0` rounds to integers.

### Default Fill

Fallback fill color used when an exported object has neither a preserved SVG fill (from import) nor a Blender material color to derive from. Default `(0.5, 0.5, 0.5)` (medium gray).

### Apply Stroke

When **on**, exported objects without an explicit SVG stroke get a default stroke applied. Off by default.

When on, the `Stroke Color` and `Stroke Width` fields below it become editable.

### Stroke Color

Default stroke color used by `Apply Stroke`. Default black.

### Stroke Width

Default stroke width used by `Apply Stroke`. Default `1.0`. Range `0.001` to `1000.0` (in SVG units after scale).

### Images

How to write `<image>` elements:

- **Embed** (default) — base64-encode the image bytes inline in the SVG file. Self-contained file; larger size.
- **Link** — write a relative file path reference. Smaller SVG; requires the linked image to stay alongside the SVG.

### Cull to Camera

See "Camera-projected export" above. Default **on**.

### Mesh Color

See "Camera-projected export" above. Default `Material Heuristic`.

## Roundtrip behavior

When you export objects that were originally imported by SpecIO:

- SVG ids are preserved where stored.
- Sibling order from the original document is respected via `specio_svg_order_path`.
- Group hierarchy is reconstructed from collection nesting.
- Imported gradient payloads are written back into a `<defs>` block as `linearGradient` / `radialGradient`.
- Imported stroke helper objects automatically rejoin their fill on export — you do not need to deselect them.
- Image elements written by `Link` mode use a relative path computed against the SVG output path.

When you export objects you created in Blender (no SpecIO import history):

- Object names become SVG ids.
- Collections become `<g>` groups.
- Material colors (or the `Default Fill`) become SVG fills.
- Output is deterministic — re-exporting the same scene produces the same SVG bytes when scene data is unchanged.

## What does not export

- Modifiers (Subsurf, Bevel, etc. on curves) are not evaluated for export. The exported path uses the source spline geometry.
- Animation, drivers, and constraints do not export.
- Shape keys and grease pencil are not supported.
- Mesh exports do not write 3D depth information; they are flat 2D silhouettes only.
