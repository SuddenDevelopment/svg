# Importing SVG

The `Import SVG` action reads a `.svg` file and creates Blender objects in a new collection named `<filename>_SVG`. The collection is added under the active scene collection.

## Running the import

1. Open the `SVG` sidebar tab.
2. Expand `Import` and review the import settings (see below).
3. Click `Import SVG`.
4. Choose a `.svg` file in the file browser. Click `Import SVG` to confirm.

When the import succeeds, the newly created objects are selected and the first one becomes the active object. A success message reading `Successfully imported SVG from: <path>` appears in the status bar. On failure, an error message starting with `Failed to import SVG:` is reported and the operator returns `CANCELLED` — no partial objects remain selected.

`Import SVG` is registered with `REGISTER, UNDO`, so a single `Ctrl+Z` after import removes everything the import created.

## What gets created

| SVG element | Becomes |
|---|---|
| `svg`, `g` | Blender collections (group hierarchy is preserved) |
| `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path` | Blender curve objects |
| `text` | Blender text (FontCurve) objects |
| `image` (local file or embedded data URI) | Blender mesh planes with the image as a texture |
| `linearGradient`, `radialGradient` | Blender materials with a node-based preview, payload preserved for export |
| `use` referencing local `#id` of a supported element/group/symbol | Inline-expanded clone(s) of the referenced content |
| `defs`, `symbol` (alone) | Indexed for `use` references; not directly imported |
| `display:none`, `visibility:hidden` (or attribute equivalents) | Skipped entirely |

Element groups become Blender collections; SVG `id` attributes are preserved as collection and object names where valid. When an `id` is missing, SpecIO assigns a deterministic fallback name (e.g. `path_1`, `group_2`) so re-imports remain stable.

### Supported path commands

`M`, `L`, `H`, `V`, `C`, `S`, `Q`, `T`, `A`, `Z`, including their lowercase relative variants. Smooth-quadratic (`T`/`t`) and arc (`A`/`a`) commands are normalized to cubic Bezier segments inside Blender for editing fidelity.

### Style attributes preserved

`fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `display`, `visibility`, plus inherited styles from parent elements, inline `style="..."` attributes, and CSS rules in `<style>` blocks. Hidden elements (via `display:none` / `visibility:hidden` / `fill:none` + `stroke:none`) are skipped.

When a shape has both a fill and a stroke, SpecIO can create **two** Blender objects for it: the fill object and a synthetic *stroke helper* object placed slightly below the fill in Z. This keeps fill and stroke independently editable in Blender. See the `Create Stroke Objects` setting below to disable this.

### Round-trip metadata

The importer writes several custom properties onto Blender objects and collections so the exporter can reconstruct sibling order, ids, and relationships:

- `specio_svg_order_path` — sibling order path inside the source SVG document tree
- `specio_svg_group_id` — original SVG group id
- `specio_svg_synthetic_root` — marks the top-level `<filename>_SVG` collection so it is filtered out of exports
- `specio_svg_stroke_helper`, `specio_svg_stroke_source` — link a stroke helper object to its fill object
- `specio_svg_split_collection` — marks objects produced by `Split Selected Path`
- `specio_svg_image`, `specio_svg_image_href`, `specio_svg_image_x/y/w/h` — image plane metadata
- Material-level keys for managed gradients (see [Managed Gradient Workflow](gradients.md))

Avoid editing these properties by hand. Deleting them will not break Blender, but it removes information the exporter uses for clean roundtrip output.

## Import settings

These are per-scene settings stored under `scene.specio` and editable both in the **IMPORT** boxed section of the SVG sidebar and in the addon preferences (where they set the per-scene defaults for new scenes).

### Scale

Multiplier from SVG user units to Blender units. Default `1.0`. Range `0.001` to `1000.0`.

A 100×100 SVG drawn at scale `1.0` becomes 100 Blender units wide. Use `0.01` to map an SVG to roughly metric centimeters in a small scene.

### Resolution

Default `64`. Range `1` to `512`. Reserved field; carried through the importer object but not currently used for spline subdivision (paths are constructed from real Bezier handles, not sampled).

### Height (Z stacking mode)

Three modes:

- **Flat** — every imported object has the same Z position (0).
- **Per Object** — each imported object is offset by `Height Step Ratio` × document size, in document order. This avoids z-fighting when SVGs contain stacked filled shapes.
- **Per Layer** — each *top-level SVG layer or group* gets one Z step; objects inside a layer share that layer's Z. Useful for multi-layer Illustrator/Inkscape files.

Default: `Per Object`.

### Height Step Ratio

The Z step used by `Per Object` and `Per Layer`, expressed as a fraction of the SVG document's largest dimension. Default `0.001` (about 0.1%). Range `0.0` to `100.0`.

Set to `0.0` to keep all objects on the same plane while still using the stacking mode field for layout intent.

### Stroke Overlay Ratio

Z clearance between a fill object and its synthetic stroke helper. Same units as `Height Step Ratio`. Default `0.001`.

This puts the stroke helper slightly *below* the fill so it shows behind the fill in viewport rendering, matching SVG's draw-order convention where stroke is drawn under the fill outline.

### Create Stroke Objects

When **on** (default), shapes with both `fill` and `stroke` import as two Blender objects: the fill curve and a stroke helper. The helper is named `<id>_stroke` and carries `specio_svg_stroke_helper = True`.

When **off**, only the fill object is created. The stroke style is dropped on the floor at import time. Turn this off if your SVG has a lot of fills+strokes and you only care about fill geometry, or if the stroke duplicates clutter your outliner.

### Intelligent Split Paths

When **on** (default), the importer analyzes complex `fill-rule="evenodd"` paths and may split them into separate Blender objects per contour family, so each closed region renders correctly as a fill instead of getting confused by hole/outer-ring nesting.

When **off**, every SVG `<path>` becomes exactly one Blender curve object containing all its splines, preserving the source structure literally. Disable this if you want the simplest possible 1:1 element mapping at the cost of evenodd fill correctness.

The same logic powers the manual `Split Selected Path` tool — see [Tools](tools.md).

## Things the importer does not do

See [SVG Support Matrix](svg-support.md) for the full list. Highlights:

- **No remote raster images.** `<image href="http://...">` (and `https://`, `ftp://`, protocol-relative `//`) are skipped to avoid SSRF. Local files and `data:` URIs work.
- **No script execution.** SVG is parsed as untrusted XML; embedded `<script>` content is ignored.
- **No `tspan`, `textPath`, `clipPath`, `mask`, filters, or animation.**
- **`<use>` only resolves local references to other supported elements/groups/symbols within the same file.**
- **General SVG unit conversion is not implemented.** SpecIO honors `viewBox` for sizing but does not convert mm/pt/in attribute values.

## Re-importing a file

Re-importing the same file creates a *new* `<filename>_SVG` collection and new objects each time. SpecIO does not deduplicate against previously imported content. To replace an import, delete the old collection (and its child objects) before re-importing.
