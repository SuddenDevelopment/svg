# Settings Reference

SpecIO has two layers of settings:

1. **Addon preferences** — global defaults applied to new scenes. Edited in `Edit > Preferences > Add-ons > SpecIO` (or via the `Open Preferences` button in the `Addon` sub-panel).
2. **Scene properties** — per-scene values used by the import and export operators. Edited in the `Import` and `Export` sub-panels of the SVG sidebar.

Each scene's first interaction with SpecIO copies the addon-preference defaults into the scene. After that, scene values are independent and editable. The `Reset Scene Defaults` button (in the `Addon` sub-panel) re-syncs the active scene from preferences, overwriting any per-scene changes.

## Addon Preferences

`Edit > Preferences > Extensions > SpecIO`. The window has three sections:

### Import Settings

| Field | Default | Range | Description |
|---|---|---|---|
| Default Import Scale | `1.0` | `0.001`–`1000.0` | Default scale factor for imported SVG files |
| Default Resolution | `64` | `1`–`512` | Default curve resolution hint (currently reserved) |
| Default Height Mode | `Per Object` | `Flat` / `Per Object` / `Per Layer` | Default Z-stacking mode for imported objects |
| Default Height Step Ratio | `0.001` | `0.0`–`100.0` | Default Z step as a fraction of SVG document size |
| Default Stroke Clearance Ratio | `0.001` | `0.0`–`100.0` | Default Z clearance between fill and stroke helper |
| Default Create Stroke Objects | `On` | bool | Default for creating synthetic stroke helper objects |
| Default Intelligent Split Paths | `On` | bool | Default for splitting evenodd paths into contour families |

### Export Settings

| Field | Default | Range | Description |
|---|---|---|---|
| Default Export Scale | `1.0` | `0.001`–`1000.0` | Default scale factor for exported SVG files |
| Precision | `3` | `0`–`10` | Decimal precision for exported SVG numbers |
| Default Fill Color | `(0.5, 0.5, 0.5)` | RGB | Fallback fill when an exported object has no preserved or material color |
| Apply Stroke On Export | `Off` | bool | Default for adding a stroke to exported objects without one |
| Default Stroke Color | `(0.0, 0.0, 0.0)` | RGB | Stroke color used when Apply Stroke is on |
| Default Stroke Width | `1.0` | `0.001`–`1000.0` | Stroke width used when Apply Stroke is on |
| Cull to Camera on Export | `On` | bool | Default for dropping off-screen geometry during camera export |
| Default Mesh Color Mode | `Material Heuristic` | enum | Default for how mesh face fills are colored |

### Library Settings

| Field | Default | Description |
|---|---|---|
| Use SVGElements Library | `On` | Reserved toggle for an optional bundled SVGElements parser; the current importer uses pure-Python parsing regardless |

## Scene Properties (`scene.specio`)

These are the values the operators actually read. Each appears in the `Import` or `Export` sub-panel. The defaults shown match the property defaults used when no addon preferences override exists.

### Import properties

| Property | Field name | Default | Range | Description |
|---|---|---|---|---|
| `import_scale` | Scale | `1.0` | `0.001`–`1000.0` | Scale factor for imported SVG |
| `import_resolution` | Resolution | `64` | `1`–`512` | Curve resolution hint (reserved) |
| `import_height_mode` | Height | `Per Object` | enum | Z-stacking mode (`FLAT`, `PER_OBJECT`, `PER_LAYER`) |
| `import_height_step` | Height Step Ratio | `0.001` | `0.0`–`100.0` | Z step as fraction of SVG size |
| `import_stroke_overlay_offset` | Stroke Overlay Ratio | `0.001` | `0.0`–`100.0` | Clearance between fill and stroke helper |
| `import_create_stroke_objects` | Create Stroke Objects | `On` | bool | Create stroke helpers for fills+strokes |
| `import_intelligent_split_paths` | Intelligent Split Paths | `On` | bool | Split evenodd paths into contour families |

### Export properties

| Property | Field name | Default | Range | Description |
|---|---|---|---|---|
| `export_scale` | Scale | `1.0` | `0.001`–`1000.0` | Scale factor for exported SVG |
| `export_precision` | Precision | `3` | `0`–`10` | Decimal precision |
| `export_default_fill_color` | Default Fill | `(0.5, 0.5, 0.5)` | RGB | Fallback fill color |
| `export_default_stroke_color` | Stroke Color | `(0, 0, 0)` | RGB | Default stroke color when Apply Stroke is on |
| `export_apply_stroke` | Apply Stroke | `Off` | bool | Add a default stroke to objects without one |
| `export_stroke_width` | Stroke Width | `1.0` | `0.001`–`1000.0` | Default stroke width |
| `image_export_mode` | Images | `Embed` | `EMBED` / `LINK` | How raster images are written |
| `export_cull_to_camera` | Cull to Camera | `On` | bool | Drop off-screen geometry in camera export |
| `export_mesh_color_mode` | Mesh Color | `Material Heuristic` | `MATERIAL_HEURISTIC` / `CAMERA_SAMPLE` | How mesh face fills are colored |

### Internal scene state

| Property | Description |
|---|---|
| `defaults_initialized` | Hidden flag — `True` once preferences have been copied into this scene. Cleared by `Reset Scene Defaults` so a fresh sync runs |

## Material Properties (`material.specio_gradient`)

Stored on each Blender material. Edited in the `Gradient Material` sub-panel when the active object's first material slot holds a managed gradient.

| Property | Default | Range / Type | Description |
|---|---|---|---|
| `enabled` | `Off` | bool | Treat this material as a SpecIO managed SVG gradient |
| `paint_target` | `Fill` | `FILL` / `STROKE` | Whether this gradient exports as fill or stroke paint |
| `gradient_id` | `""` | string | Optional explicit SVG gradient id (blank = derive from material name) |
| `gradient_type` | `Linear` | `LINEAR` / `RADIAL` | Linear or radial gradient |
| `spread_method` | `pad` | `pad` / `repeat` / `reflect` | Behavior outside the stop range |
| `start_color` | `(1, 1, 1)` | RGB | First stop color |
| `start_alpha` | `1.0` | `0.0`–`1.0` | First stop opacity |
| `start_offset` | `0.0` | `0.0`–`1.0` | First stop position |
| `end_color` | `(0.1, 0.1, 0.1)` | RGB | Last stop color |
| `end_alpha` | `1.0` | `0.0`–`1.0` | Last stop opacity |
| `end_offset` | `1.0` | `0.0`–`1.0` | Last stop position |
| `linear_x1` | `0.0` | `-4.0`–`4.0` | Linear gradient start X (object space) |
| `linear_y1` | `0.0` | `-4.0`–`4.0` | Linear gradient start Y |
| `linear_x2` | `1.0` | `-4.0`–`4.0` | Linear gradient end X |
| `linear_y2` | `0.0` | `-4.0`–`4.0` | Linear gradient end Y |
| `radial_cx` | `0.5` | `-4.0`–`4.0` | Radial gradient center X |
| `radial_cy` | `0.5` | `-4.0`–`4.0` | Radial gradient center Y |
| `radial_r` | `0.5` | `0.001`–`4.0` | Radial gradient radius |
| `radial_fx` | `0.5` | `-4.0`–`4.0` | Radial gradient focal X |
| `radial_fy` | `0.5` | `-4.0`–`4.0` | Radial gradient focal Y |

## Custom property keys (advanced)

These are written by the importer and read by the exporter to support roundtrip fidelity. You normally do not interact with them directly.

### On objects and collections

| Key | Where | Purpose |
|---|---|---|
| `specio_svg_order_path` | Object, Collection | Original SVG sibling order path (`"1.3.2"`) |
| `specio_svg_group_id` | Collection | Original SVG `<g>` id |
| `specio_svg_synthetic_root` | Collection | Marks the top-level `<filename>_SVG` collection (filtered out on export) |
| `specio_svg_stroke_helper` | Object | `True` on synthetic stroke helper objects |
| `specio_svg_stroke_source` | Object | Name of the fill object this helper belongs to |
| `specio_svg_split_collection` | Object | Marks objects produced by `Split Selected Path` |

### On image planes

| Key | Purpose |
|---|---|
| `specio_svg_image` | Marks an object as a SpecIO image plane |
| `specio_svg_image_href` | Original SVG `href` (file path or data URI) |
| `specio_svg_image_x/y/w/h` | Original SVG image positioning |

### On materials (managed gradients)

| Key | Purpose |
|---|---|
| `specio_gradient_payload` | JSON payload of the full SVG gradient (stops, transform, etc.) |
| `specio_gradient_id` | SVG gradient id |
| `specio_gradient_kind` | `linearGradient` or `radialGradient` |
| `specio_gradient_units` | SVG `gradientUnits` value |
| `specio_gradient_spread` | SVG `spreadMethod` value |
| `specio_gradient_role` | `fill` or `stroke` paint role |
| `_specio_suspend_gradient_updates` | Internal flag to silence update callbacks during bulk init |
