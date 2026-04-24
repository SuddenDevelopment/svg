# SpecIO-PRO Legacy Feature Evaluation

This document captures what the bundled `SpecIO-PRO` addon appears to provide today, based on the code in `SpecIO-PRO/` and its README. It is an evaluation of the legacy implementation, not a statement about current `SpecIO` behavior.

## Overall Assessment

SpecIO-PRO is a capable legacy SVG import workflow addon with three clear strengths:

- broad support for common SVG geometry primitives and group hierarchies during import
- practical post-import workflow tools for stacking, beveling, extruding, selecting, and placing objects
- style-aware material assignment for simple solid-color fills and strokes

It also has clear limitations:

- it is import-centric and does not implement a real SVG export path
- it mutates source SVG files on import to inject missing ids
- gradient handling is incomplete and falls back to white in the importer material path
- the implementation targets older Blender addon patterns and is not structured like the current Blender 5.1+ extension-era codebase

## Architecture Snapshot

The legacy addon is organized into a small Blender addon surface and a large importer library:

- `SpecIO-PRO/__init__.py`: legacy addon metadata and register/unregister entry points
- `SpecIO-PRO/props.py`: scene properties for file tracking, action parameters, style filters, materials, and geometry nodes
- `SpecIO-PRO/ops.py`: file import, selection, and action operators
- `SpecIO-PRO/ui.py`: N-panel UI for files, selections, and actions
- `SpecIO-PRO/lib/import_svg.py`: the core XML/SVG parsing, geometry conversion, style extraction, and object creation logic
- `SpecIO-PRO/lib/svg.py`: missing-id generation and collection hierarchy mapping
- `SpecIO-PRO/lib/actions.py`: curve/object post-processing helpers
- `SpecIO-PRO/lib/selections.py`: selection helpers
- `SpecIO-PRO/lib/collections.py`: collection linking helpers
- `SpecIO-PRO/lib/svg_colors.py`: named color lookup and hex parsing helpers

Evaluation:

- The feature surface is reasonably rich for a compact addon.
- The architecture is functional but heavily centered around one large importer module, which increases maintenance risk.
- The design is optimized for artist workflow convenience more than strict data safety or extension-era packaging.

## Feature Inventory

### 1. File Workflow

Implemented features:

- SVG import through a Blender file browser operator in `SpecIO-PRO/ops.py`
- scene-level tracked file list using `SPEC_files`
- per-file selected state for batch action workflows
- remove one tracked file entry
- clear all tracked file entries

Relevant sources:

- `SpecIO-PRO/ops.py`
- `SpecIO-PRO/props.py`
- `SpecIO-PRO/ui.py`

Evaluation:

- The multi-file workflow is practical for repeated imports and downstream batch actions.
- The tracked-file list is UI-facing state only; it does not appear to be a robust asset management layer.

### 2. Source SVG Preprocessing

Implemented features:

- recursive id generation for SVG nodes that do not already have an `id`
- deterministic fallback ids derived from tag name plus counter
- hierarchy pass that remaps imported Blender objects into collections based on SVG groups

Relevant sources:

- `SpecIO-PRO/lib/svg.py`
- `SpecIO-PRO/ops.py`

Evaluation:

- Deterministic ids are useful for predictable naming and hierarchy reconstruction.
- The implementation writes those generated ids back into the source SVG file during import, which is a significant safety risk for user assets and version-controlled files.

### 3. SVG Element Import Coverage

Supported geometry/container classes declared in the importer:

- `svg`
- `path`
- `defs`
- `symbol`
- `use`
- `rect`
- `ellipse`
- `circle`
- `line`
- `polyline`
- `polygon`
- `g`

Behavioral notes observed in the importer:

- `viewBox` is parsed and affects document-space transforms
- document units are handled for `cm`, `mm`, `in`, `pt`, and `pc`
- nested containers and referenced definitions are supported through the loader context

Relevant sources:

- `SpecIO-PRO/lib/import_svg.py`

Evaluation:

- This is a strong import surface for a legacy addon focused on curve geometry.
- Coverage is good for common illustration SVGs built from paths and primitive shapes.
- The implementation is still import-only and does not amount to a full roundtrip SVG pipeline.

### 4. Geometry Conversion

Implemented features:

- conversion of imported SVG geometry into Blender curve data
- filled shapes become 2D curves with fill mode enabled
- non-filled shapes become 3D curves
- polyline and polygon conversion
- line conversion
- rect conversion including rounded corners
- ellipse and circle conversion
- path parsing into curve splines
- cyclic closure for closed geometry where appropriate

Relevant sources:

- `SpecIO-PRO/lib/import_svg.py`

Evaluation:

- The importer is clearly focused on getting usable Blender curve objects from common SVG content.
- For the supported subset, this is the strongest part of the legacy addon.
- Because the path and geometry logic live in a single large module, correctness fixes would be harder to isolate and test than in the current codebase structure.

### 5. Transform and Coordinate Handling

Implemented features:

- support for SVG transform functions through a transform dispatch table
- translation
- scaling
- rotation
- matrix transforms
- skew transforms
- user coordinate handling through viewBox and local display rectangles
- import-time global transform that scales and flips SVG space into Blender space

Relevant sources:

- `SpecIO-PRO/lib/import_svg.py`

Evaluation:

- The transform coverage is substantial and necessary for practical SVG import.
- The presence of hard-coded global scaling in the loader makes the final unit behavior harder to reason about and harder to validate than an explicit, isolated conversion layer.

### 6. Style Parsing and Material Assignment

Implemented features:

- parsing of solid-color fill and stroke values
- parsing of `opacity`, `fill-opacity`, `stroke-opacity`, and `stroke-width`
- selection logic based on stored style metadata
- reuse of materials by a serialized style signature
- named CSS color lookup through the legacy color table
- `rgb(...)` color parsing
- basic node-based alpha setup when opacity is present
- assignment of imported material to curve data
- storage of selected style values on imported objects as custom properties

Relevant sources:

- `SpecIO-PRO/lib/import_svg.py`
- `SpecIO-PRO/lib/svg_colors.py`
- `SpecIO-PRO/lib/selections.py`

Evaluation:

- Solid-color style handling is a meaningful strength of the legacy addon.
- Style metadata on objects enables practical downstream selection workflows.
- Gradient support is not real feature coverage here: when the material path sees a gradient token, it falls back to white instead of preserving a gradient material model.

### 7. Collection and Hierarchy Organization

Implemented features:

- imported file gets its own top-level Blender collection
- SVG group elements can create child collections
- imported objects are relinked into the matching collection hierarchy
- selection can recurse through sub-collections
- actions can identify a top collection from selected objects

Relevant sources:

- `SpecIO-PRO/lib/svg.py`
- `SpecIO-PRO/lib/collections.py`
- `SpecIO-PRO/lib/selections.py`

Evaluation:

- Preserving hierarchy through Blender collections is useful and aligns with artist expectations.
- The implementation is serviceable, but collection relinking depends on object names and current scene state rather than a more explicit import graph.

### 8. Selection Tools

Implemented features exposed through operators:

- select by active object collection
- select by active material
- select curves
- select shapes
- random selection
- select by tracked file state
- select by stored style key

Relevant sources:

- `SpecIO-PRO/ops.py`
- `SpecIO-PRO/lib/selections.py`
- `SpecIO-PRO/ui.py`

Evaluation:

- These are practical workflow features for large imported SVG scenes.
- The style-based selection is simple and useful, but it is based on custom-property presence rather than a more robust style query model.

### 9. Post-Import Action Tools

Implemented actions:

- `stack`: place imported content across a height range by collection depth/order
- `extrude`: set curve extrusion depth
- `fatCurve`: add bevel depth to curves for visible stroke-like thickness
- `flatten`: move selected content to the minimum Z level
- `raise`: move selected content to the maximum Z level
- `place`: duplicate a chosen Blender object onto selected target shapes and align rotation
- `addGeoNodes`: add a chosen geometry node group modifier
- `addMaterial`: apply a chosen material

Relevant sources:

- `SpecIO-PRO/ops.py`
- `SpecIO-PRO/lib/actions.py`
- `SpecIO-PRO/lib/collections.py`

Evaluation:

- This is the other major strength of SpecIO-PRO besides import coverage.
- The addon is better described as an SVG import-and-postprocess workflow toolkit than a plain importer.
- Some actions assume ideal Blender state and could fail or behave inconsistently when required data is missing.

### 10. Placement and Orientation Helpers

Implemented features:

- origin repositioning after import
- object placement onto selected shapes
- bounding-box based orientation adjustment
- optional uniform scaling of placed objects to fit target geometry

Relevant sources:

- `SpecIO-PRO/ops.py`
- `SpecIO-PRO/lib/actions.py`

Evaluation:

- These helpers are useful production tools and go beyond basic import.
- They depend on mesh conversion and scene/object assumptions, which makes them powerful but less predictable than pure data transforms.

### 11. UI Surface

Exposed UI sections:

- main panel showing imported file list
- selection sub-panel
- actions sub-panel
- context-sensitive action parameter widgets

Relevant sources:

- `SpecIO-PRO/ui.py`

Evaluation:

- The UI is compact and task-oriented.
- It reflects a workflow mindset: import first, then select, then apply operations.
- It is built on older addon conventions and does not reflect the current extension-oriented property grouping used in the main codebase.

## Strengths Summary

- broad practical SVG import support for common shape-based documents
- useful collection hierarchy preservation
- solid-color style parsing and material reuse
- practical selection and batch workflow tools
- meaningful post-import actions for turning 2D imports into usable scene content

## Gaps and Limitations

### Missing or incomplete capabilities

- no implemented SVG export pipeline
- README still lists `outline to svg` as a desired feature rather than delivered functionality
- no real gradient preservation in the legacy material path
- no evidence of text import, clipping, masking, filters, or pattern support as user-facing features

### Technical risks

- source SVGs are modified in place to inject ids before import
- a large amount of behavior is concentrated in `SpecIO-PRO/lib/import_svg.py`
- legacy Blender addon metadata targets Blender 3.2-era behavior
- the code is not organized around the current repo’s separation between Blender operator glue and pure SVG helpers
- there is limited sign of defensive validation around missing materials, node groups, or object state in some actions

## Legacy-to-Current Repo Takeaways

What is worth carrying forward conceptually:

- practical multi-step artist workflow tooling after import
- hierarchy-aware import behavior
- selection by imported style metadata
- material reuse for repeated style values

What should not be carried forward as-is:

- in-place mutation of source SVG assets
- monolithic importer architecture
- legacy scene property sprawl
- older Blender registration and packaging assumptions

## Source Pointers

- `SpecIO-PRO/__init__.py`
- `SpecIO-PRO/README.md`
- `SpecIO-PRO/ops.py`
- `SpecIO-PRO/props.py`
- `SpecIO-PRO/ui.py`
- `SpecIO-PRO/lib/actions.py`
- `SpecIO-PRO/lib/collections.py`
- `SpecIO-PRO/lib/import_svg.py`
- `SpecIO-PRO/lib/selections.py`
- `SpecIO-PRO/lib/svg.py`
- `SpecIO-PRO/lib/svg_colors.py`