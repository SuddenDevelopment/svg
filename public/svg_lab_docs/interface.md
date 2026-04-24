# The SVG Sidebar

All SpecIO controls live in the 3D Viewport's N-panel sidebar, under the `SVG` tab. Press `N` in the 3D Viewport to toggle it.

![SpecIO sidebar overview](images/sidebar-overview.png)

The tab contains a single root panel whose title shows the addon version (e.g. **SpecIO v2.2.0**). Inside it are two boxed action sections — **IMPORT** and **EXPORT** — drawn in the main panel itself, plus three collapsible sub-panels below:

| Section | Where | Purpose |
|---|---|---|
| IMPORT | Boxed section in the main panel | Import-time settings + the `Import SVG` action |
| EXPORT | Boxed section in the main panel | Export-time settings + the `Export Selected` action |
| Tools | Sub-panel | Curve utilities: `Copy Active Curve Settings`, `Split Selected Path` |
| Gradient Material | Sub-panel | Assign and edit SpecIO-managed SVG gradients on the active curve |
| Addon | Sub-panel | Open addon preferences and reset per-scene settings |

The `Tools`, `Gradient Material`, and `Addon` sub-panels are collapsed by default. Click a sub-panel header to expand or collapse it.

The sidebar is only visible in **Object Mode**. It does not appear in Edit, Sculpt, or Pose modes.

## IMPORT section

A boxed section at the top of the main panel. Top-to-bottom controls:

- **Scale** — multiplier applied to imported geometry
- **Resolution** — curve resolution hint (passed through; not currently used by the active importer for spline subdivision but reserved for future use)
- **Height** — Z-stacking mode for imported objects (`Flat`, `Per Object`, `Per Layer`)
- **Height Step Ratio** — Z spacing between stacked objects, as a fraction of the SVG document size
- **Stroke Overlay Ratio** — Z clearance between a fill object and its synthetic stroke helper
- **Create Stroke Objects** — when on, shapes that have both `fill` and `stroke` import as two objects (a fill curve and a separate stroke helper)
- **Intelligent Split Paths** — when on, complex `evenodd` filled paths may be split into contour families to better match SVG rendering

> Note: `Height Step Ratio` and `Stroke Overlay Ratio` default to `0.001` but display as `0.00` in the panel because Blender's `FloatProperty` widget rounds to two decimals. The underlying value is what the importer uses.

At the bottom: the `Import SVG` button. Clicking it opens a file browser. See [Importing SVG](importing.md) for full details.

## EXPORT section

A boxed section below IMPORT. Top-to-bottom controls:

- **Scale** — multiplier applied to exported geometry
- **Precision** — decimal places written for SVG numbers (0–10)
- **Default Fill** — fallback fill color when an object has no preserved SVG fill or material color
- **Apply Stroke** — when on, exported objects without an explicit stroke get a default stroke
  - **Stroke Color** — color used by Apply Stroke (only active when Apply Stroke is on)
  - **Stroke Width** — width used by Apply Stroke
- **Images** — `Embed` (base64 inline) or `Link` (relative file path) for raster image export
- **Cull to Camera** — drop geometry that is entirely outside the camera viewport during camera export
- **Mesh Color** — `Material Heuristic` (use Base Color directly) or `Sample Final Camera Color` (render Eevee and sample the lit color per face)
  - When `Sample Final Camera Color` is selected, an info box appears warning that camera sampling keeps only visible front faces.

At the bottom: the **Export Selected** button (operator id `specio.export_svg`). See [Exporting SVG](exporting.md) for selection rules and behavior.

## Tools sub-panel

Contains:

- **Copy Active Curve Settings** — copies curve datablock settings (2D/3D mode, extrude, bevel, fill) from the active curve to the other selected curves.
- **Split Selected Path** — splits the active multi-spline curve into separate Blender objects in a new collection.

Hint labels appear under the buttons depending on the current selection:

- "Select target curves, then make the source active" — no curve is active
- "Select at least two curves to copy settings" — fewer than two curves are selected
- "Selected path has one spline" — `Split Selected Path` would be a no-op

See [Tools](tools.md) for both operators in depth.

## Gradient Material sub-panel

Contains:

- **Assign SpecIO Gradient** — creates and assigns a managed gradient material to all selected curve objects.
- A material name label (e.g. `SpecIO_Display_DA030DFF...`) showing which material is currently being edited.
- The full per-material editor for the active curve's first material slot, including `Managed Gradient` toggle, paint target (fill or stroke), gradient id, type (linear/radial), spread method, two color stops, and gradient geometry (X1/Y1/X2/Y2 for linear, center / radius / focal point for radial).

If no curve is selected, the panel shows only the `Assign SpecIO Gradient` button and a hint to select a curve. If a managed gradient material is assigned but `Managed Gradient` is off, the editor is collapsed with the hint `Assign or enable to edit`. See [Managed Gradient Workflow](gradients.md).

## Addon sub-panel

Two buttons:

- **Open Preferences** — jumps to SpecIO's section of the Blender addon preferences window.
- **Reset Scene Defaults** — re-applies addon preference defaults to the current scene's SpecIO settings, overwriting any per-scene changes.
