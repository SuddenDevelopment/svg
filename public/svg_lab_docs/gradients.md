# Managed Gradient Workflow

SpecIO can both *reconstruct* SVG gradients on import and *author* them in Blender for export. The authoring side is called the **managed gradient workflow**: you assign a SpecIO-managed material to a curve, edit its parameters in the sidebar, and on export the material is written back as a real SVG `<linearGradient>` or `<radialGradient>`.

The managed material also previews in Blender (Material Preview / Eevee), so you can visually iterate before exporting.

## When to use it

- You want to draw a gradient-filled shape in Blender for SVG output.
- An imported SVG gradient needs editing — re-running `Assign SpecIO Gradient` (or editing the existing managed material) lets you change stops, geometry, or spread method.
- You want round-trip control over gradient ids written into the SVG `<defs>` block.

## Assigning a managed gradient

1. Select one or more curve objects in the 3D Viewport.
2. Open the `SVG` sidebar tab and expand the `Gradient Material` sub-panel.
3. Click `Assign SpecIO Gradient`.

Each selected curve gets a new material named `SpecIOGradient_<object_name>` placed in slot 0 (replacing whatever was in slot 0). Defaults: linear gradient, fill paint target, white-to-dark-gray, full opacity, pad spread, anchored at `(0,0)`–`(1,0)` in normalized object space.

If you select no curves and click the button, the operator reports `Select at least one curve object`.

The status bar reports `Assigned SpecIO gradient material to <N> object(s)` on success.

## Editing the managed gradient

With a curve selected whose first material slot holds a managed gradient, the `Gradient Material` sub-panel shows the editor:

### Top row

- **Material:** *(label only — shows the name of the active material being edited)*
- **Managed Gradient** (`enabled`) — toggle SpecIO gradient management on this material. When off, the material is treated as a regular Blender material at export time.

### Identification and behavior

- **Paint Target** — `Fill` or `Stroke`. Determines whether this material exports as the SVG fill or stroke paint. Default `Fill`.
- **Gradient ID** — optional override for the SVG gradient id. Leave blank to derive automatically from the material name.
- **Type** — `Linear` or `Radial`.
- **Spread** — `Pad` (clamp at the ends), `Repeat` (tile the pattern), or `Reflect` (mirror-tile). Default `Pad`.

### Color stops

SpecIO's managed gradient uses **two stops** (start and end). Each has color, alpha, and offset (0..1) inside the gradient range.

- **Start Color**, **Start Alpha**, **Start Offset** (default `0.0`)
- **End Color**, **End Alpha**, **End Offset** (default `1.0`)

For multi-stop gradients beyond two, edit the underlying SVG payload data directly (`material["specio_gradient_payload"]`) — there is no UI for additional stops yet.

### Linear gradient geometry

When `Type = Linear`:

- **X1**, **Y1** — start point of the gradient line, in normalized 0..1 object space
- **X2**, **Y2** — end point

Range for each coordinate: `-4.0` to `4.0`. Defaults are `(0,0)` to `(1,0)` (left-to-right horizontal).

### Radial gradient geometry

When `Type = Radial`:

- **Center X**, **Center Y** — center of the gradient circle (default `0.5, 0.5`)
- **Radius** — radius of the gradient circle (default `0.5`, range `0.001`–`4.0`)
- **Focal X**, **Focal Y** — focal point inside the circle, where 0% offset begins (default `0.5, 0.5`)

Range for the position fields: `-4.0` to `4.0`.

## How edits propagate

Every property in the managed gradient editor has an attached update callback. When you change any value:

1. The change is committed to the property group.
2. SpecIO re-syncs the underlying material's node tree to reflect the new gradient (you see the preview update).
3. The serialized gradient payload stored on the material (`specio_gradient_payload`) is updated, ready for the next export.

This happens live; there is no separate "Apply" step.

The internal flag `_specio_suspend_gradient_updates` on the material temporarily blocks these callbacks while `Assign SpecIO Gradient` is initializing properties in bulk — it is reset automatically when initialization finishes.

## Importing existing gradients

When SpecIO imports an SVG that contains `<linearGradient>` or `<radialGradient>` definitions referenced by `fill="url(#id)"` or `stroke="url(#id)"`:

- The gradient is parsed and its full payload (stops, transform, spread method, geometry) is stored on the assigned Blender material.
- A node tree is built so the gradient previews in Blender.
- Custom properties on the material (`specio_gradient_id`, `specio_gradient_kind`, `specio_gradient_units`, `specio_gradient_spread`, `specio_gradient_role`) record the SVG-side metadata.

On export, the original gradient payload is written back to the SVG `<defs>` block — multi-stop gradients survive a roundtrip even though the panel UI only edits two stops directly.

## Limits

- One material slot per curve is read on export (slot 0).
- The panel exposes two color stops; multi-stop gradients survive roundtrip but are not editable in the UI.
- Gradient transforms (`gradientTransform`) are preserved on roundtrip but not editable in the UI.
- Mesh objects and text objects do not currently use managed gradient materials for export — they fall back to `Material Heuristic` color sampling.
