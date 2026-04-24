# Troubleshooting

Common issues and what to do about them.

## Install / enable

### The SVG sidebar tab is missing

- Confirm Blender is **5.1 or newer**. Older versions cannot enable the extension at all.
- Open `Edit > Preferences > Extensions`, search for "SpecIO", and verify the checkbox is ticked.
- Press `N` in the 3D Viewport — the sidebar may simply be hidden.
- The sidebar only shows in **Object Mode**. Switch out of Edit/Sculpt/Pose mode.

### "Failed to register" or registration errors during enable

- Make sure no older copy of SpecIO is also installed (a leftover from manual installs alongside the extension install can collide on operator names).
- Restart Blender after uninstalling stale copies.

## Import errors

### `SVG file not found: <path>`

The file path passed to the importer does not exist. This usually means the file was moved or deleted between selection and execution. Re-pick the file in the file browser.

### `Failed to parse SVG file: <reason>`

The XML is malformed. Open the SVG in a text editor or another tool to verify it parses. Common causes:

- truncated or corrupted file
- mixed character encodings
- non-XML content saved with a `.svg` extension

### Imported SVG looks empty

- The file may use only unsupported elements (e.g. all content inside `<clipPath>`, `<mask>`, or filter chains). See [SVG Support Matrix](svg-support.md).
- Hidden elements (`display="none"`, `visibility="hidden"`) are skipped intentionally.
- The geometry may be at extreme coordinates. Frame all (`Numpad .` after `A` to select all) to find it.
- If the file uses unit values like `mm`/`in` without a `viewBox`, the imported geometry may be at an unexpected scale. Try setting `Import > Scale` to `0.01` or the reciprocal of the document size.

### Imported colors look wrong

- SVG fills are sRGB; Blender works in linear space. SpecIO converts on import. If colors still look off, check whether the source SVG used `currentColor` or relied on inherited CSS that the importer simplified.
- Materials use the imported color as Base Color. Switch Blender to **Material Preview** or **Rendered** view to see fills correctly.

### Strokes appear "below" fills, behind the geometry

That's intentional. The importer creates synthetic stroke helper objects placed slightly *below* the fill in Z, matching SVG's stroke-under-fill draw order convention. To change the spacing, adjust `Import > Stroke Overlay Ratio`. To skip stroke helpers entirely, turn off `Import > Create Stroke Objects` before re-importing.

### Compound paths render incorrectly (holes filled in)

Turn on `Import > Intelligent Split Paths` and re-import. If the SVG was already imported with this off, run `Tools > Split Selected Path` on the offending curve.

### `<image>` elements did not import

- Remote URLs (`http://`, `https://`, `ftp://`, `//`) are intentionally skipped to avoid SSRF. Download the images and re-reference them locally.
- Local file references must resolve relative to the SVG file's directory. Confirm the linked image actually exists at that relative path.

## Export errors

### `Active scene camera required for SVG export`

You selected a mesh (which only exports via camera projection) without a scene camera set. In `Properties > Scene > Scene > Camera`, assign a camera, or deselect the mesh and export only curves/text/images.

### `SVG export requires the active 3D viewport to be in camera perspective`

The viewport you are exporting from is not in camera view. Press `Numpad 0` to switch to the camera view, then click `Export Selected` again.

### `Select at least one curve, text, or image object to export...`

You either selected nothing, or selected only objects that SpecIO does not know how to export (e.g. armatures, lights, empties). Pick at least one curve, font, image plane, or — with a camera in camera view — a mesh.

### `Export path must use the .svg extension`

The chosen output path does not end in `.svg`. Add the extension.

### Exported SVG is empty or much smaller than expected

- If exporting in camera view, off-screen geometry was culled. Turn off `Export > Cull to Camera` to keep everything.
- Mesh objects only export front-facing polygons relative to the camera. Rotate the mesh, the camera, or flip face normals if needed.
- Text objects with empty `body` strings export nothing.

### Exported colors look washed out / too dark

- Mesh export defaults to `Material Heuristic`, which reads Base Color directly without lighting. If you want shaded colors, switch `Export > Mesh Color` to `Sample Final Camera Color` — but this requires Eevee to render and is slower.
- Conversely, if `Sample Final Camera Color` produces colors that don't match what you see in the viewport, check that your viewport shading mode (Solid/Material Preview/Rendered) matches what you expected; sampling always uses Eevee from the active camera.

### Exported file ignores Blender modifiers (Subsurf, Bevel, etc.)

Modifier evaluation is not currently part of export. Apply the modifier in Blender (`Object > Convert > Mesh`/`Curve`) before exporting.

## Roundtrip issues

### Path commands changed in the exported file

`T` (smooth quadratic) and `A` (arc) commands are normalized to cubic Bezier on import for editing fidelity, so they export as `C`/`S` curves. The geometry is equivalent but the textual command form is not preserved.

### `id` attribute changed

Original SVG ids are preserved when stored on the corresponding Blender object/collection. If you renamed the Blender object, the export uses the new name. Restore the original name to recover the original id.

### Synthetic stroke helpers appear in my export selection

You can leave them selected — the exporter automatically skips any object marked with `specio_svg_stroke_helper`, and rejoins the stroke style with the matching fill object.

### Exported SVG won't open in Illustrator/Inkscape

- Validate the file with an online SVG validator first to catch any malformed output.
- File a reproducible bug in the SpecIO issue tracker with the source `.blend` and the offending `.svg`.

## Gradient issues

### Assigning a managed gradient overwrote my existing material

The `Assign SpecIO Gradient` operator places the new material in **slot 0**, replacing whatever was there. To keep the original, move it to a different slot before clicking the button — or reassign it after.

### Gradient preview in Blender doesn't match the exported SVG

- Blender renders the gradient through a node tree approximation. Some SVG features (especially complex `gradientTransform` matrices and multi-stop sequences edited only via the JSON payload) may render slightly differently in Blender vs. an SVG renderer.
- Multi-stop gradients survive a roundtrip but the panel UI only edits two stops. Editing those two stops will discard intermediate stops.

### Gradient does not export

- Confirm the material has `Managed Gradient` enabled in the `Gradient Material` sub-panel.
- The exporter reads only **slot 0** of each curve. Move the gradient material into slot 0.

## Reset to defaults

If the per-scene settings have drifted into a confusing state:

1. Open the `SVG` sidebar > `Addon` sub-panel.
2. Click `Reset Scene Defaults`.

This re-syncs every per-scene SpecIO setting from the addon preferences.

## Reporting bugs

Issues, reproducible bugs, and feature requests:
<https://github.com/SuddenDevelopment/SpecIO/issues>

When reporting an import or export bug, include:

- the source `.svg` file (or a minimal reproduction)
- the Blender version (`Help > About`)
- the SpecIO version (visible in `Edit > Preferences > Extensions > SpecIO`)
- the exact settings used (screenshot of the IMPORT or EXPORT section of the sidebar)
- the message printed in Blender's status bar / console when the operator failed
