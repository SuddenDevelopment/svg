# SVG Workbench Plan

## Product Goal

- [ ] Build a standalone JavaScript web client for inspecting, repairing, transforming, and exporting SVG files.
- [ ] Support general-purpose SVG analysis and editing first, with Blender-safe export as one important helper workflow rather than the only purpose of the product.
- [ ] Support two first-class outcomes from the same tool:
  1. General clean SVG export for editing, reuse, and self-contained delivery.
  2. Blender-safe SVG export for import reliability when that workflow is needed.
- [ ] Keep all processing local in the browser with no server components.
- [ ] Preserve the original SVG, show live previews as changes are made, and allow export of both current state and step-by-step variants.

## Runtime Constraints

- [ ] Build the app as a client-only web application with no server runtime.
- [ ] Assume deployment as static files only: HTML, CSS, JavaScript, WASM, fonts, and other browser-delivered assets.
- [ ] Keep parsing, geometry processing, styling, animation authoring, preview rendering, persistence, and export entirely in the browser.
- [ ] Allow local development tooling such as a dev server, but do not require any backend service in production.
- [ ] Avoid features that depend on server-side rendering, server-side queues, remote storage, or background workers outside the browser environment.
- [ ] Use browser APIs such as File API, IndexedDB, Web Workers, Blob URLs, and WASM where needed instead of adding server responsibilities.

## Product Modes

- [ ] Add a `Clean And Edit` mode focused on general SVG cleanup, normalization, and authoring.
- [ ] Add a `Repair For Blender` mode focused on geometry normalization, cleanup, and strict export.
- [ ] Add an `Enhance SVG` mode focused on self-contained styling, palette work, animation, and interaction.
- [ ] Add a `Compare` mode that shows original, working draft, and exported result side by side.
- [ ] Add a `Batch` mode for processing many files with the same recipe.

## Design Principles

- [ ] Treat the product as an SVG workbench first and a Blender helper second.
- [ ] Treat Blender import success as a geometry-first problem: paths, closed contours, baked transforms, simple fills, clean winding, and predictable units.
- [ ] Treat self-contained SVG enhancement as a native-SVG problem: embedded `<style>`, `<animate>`, `<animateTransform>`, `<set>`, `<a>`, `<title>`, `<desc>`, and `viewBox`-driven composition, not external runtimes.
- [ ] Prefer native SVG output features over external JavaScript when the goal is a portable SVG file.
- [ ] Keep editing non-destructive and reversible with preview-first UX.
- [ ] Separate authoring convenience from export strictness: the app can use rich browser tooling internally while serializing conservative output profiles.

## Build Strategy

- [ ] Build as a static SPA with a browser-only state model and file-based workflow.
- [ ] Use client-side routing only if it improves UX, not because the app needs multiple server routes.
- [ ] Push heavy parsing, booleans, tracing, and snapshot generation into Web Workers where possible to keep the UI responsive.
- [ ] Ship any heavy rendering or geometry engines as browser-compatible dependencies or WASM assets bundled with the client.
- [ ] Store sessions, presets, and recent files locally using IndexedDB or browser storage instead of remote persistence.
- [ ] Keep export generation local by using Blob downloads, zip generation, and in-memory pipelines.

## Recommended Stack

- [ ] Use `svgson` for SVG AST parsing, tree traversal, node editing, and serialization.
- [ ] Use `paper` as the primary geometry engine for SVG import/export, path editing, booleans, simplify, flatten, smooth, split, joins, bounds, and intersections.
- [ ] Use `svg-path-commander` for shape-to-path conversion, path validation, transform baking, path metrics, reversing, normalization, and raw `d` editing.
- [ ] Add `svg-pathdata` as the low-level path command toolkit for streaming transforms, collinear-point removal, path reversal, arc annotation, and command-wise sanitation.
- [ ] Use `svgo` as the cleanup and structural normalization pass, not as the main repair engine.
- [ ] Use `polygon-clipping` for robust polygon booleans after flattening or when fill geometry must be repaired at polygon level.
- [ ] Use `clipper-lib` for polygon offsetting, stroke expansion, outline generation, gap closing, and join-style-sensitive offsets.
- [ ] Use `opentype.js` for text-to-path conversion and glyph-aware path generation.
- [ ] Use `bezier-js` for curve diagnostics, curvature inspection, and advanced Bézier analysis.
- [ ] Keep `imagetracerjs` as the optional raster-to-vector engine.
- [ ] Add `@svgdotjs/svg.js` as the high-level authoring layer for SVG-native animation, event wiring, and visual editing of self-contained SVG features.
- [ ] Add `css-tree` for parsing, validating, rewriting, and serializing embedded SVG CSS.
- [ ] Add `culori` for palette extraction, color matching, palette remapping, interpolation, contrast checks, and perceptual color transforms.
- [ ] Add `@resvg/resvg-wasm` for deterministic raster previews, snapshots, and visual diffing in the browser.
- [ ] Add `@panzoom/panzoom` for a responsive pan/zoom preview workspace.
- [ ] Use `JSZip` for batch exports and step bundles.
- [ ] Use `file-saver` for local downloads.

## Library Decisions

- [ ] Keep `paper` as the main geometry workhorse. It is still the best fit for interactive path repair and boolean editing in a browser SVG tool.
- [ ] Keep `svg-path-commander` for shape-to-path, transform baking, validation, normalization, and path metrics.
- [ ] Add `svg-pathdata` instead of treating `svg-path-commander` as the only raw-path utility. `svg-pathdata` is stronger for low-level command transforms and sanitation.
- [ ] Add `@svgdotjs/svg.js` instead of trying to force `paper` to also be the animation and interaction authoring layer. `svg.js` is better suited to SVG-native manipulation and animation tooling.
- [ ] Add `css-tree` instead of relying on regex or ad hoc CSS parsing for embedded `<style>` blocks.
- [ ] Add `culori` as the main color engine instead of using lightweight color helpers. Its modern color-space support is better for palette work and theme remapping.
- [ ] Add `@resvg/resvg-wasm` for export snapshots and preview parity checks; browser-native SVG rendering remains the primary live preview, but `resvg` is valuable for deterministic raster outputs and diffs.
- [ ] Keep `clipper-lib` and `polygon-clipping` together. They solve different hard cases: offsetting versus robust polygon booleans.
- [ ] Keep `imagetracerjs` as optional rather than core.

## Alternatives Considered

- [ ] `svg-pathdata` can replace some low-level `svg-path-commander` work, but not its higher-level shape conversion and metrics conveniences.
- [ ] `@svgdotjs/svg.js` is better than using a generic animation runtime when the goal is authoring SVG-native behavior, but exported files should prefer native SVG animation and style elements over runtime dependencies.
- [ ] Browser SVG rendering is enough for editing, but `@resvg/resvg-wasm` is better for deterministic export snapshots and image diffs.
- [ ] Simple color libraries are smaller, but `culori` is the better long-term choice for palette extraction and perceptual remapping.

## Simplified Product Design

- [ ] Build a three-column workbench layout.
- [ ] Left column: `File`, `Inspect`, `Repair`, `Style`, `Animate`, `Interact`, `Export` tool groups.
- [ ] Center column: large live preview with pan/zoom, overlay diff, and target-node highlighting.
- [ ] Right column: contextual inspector for selection details, warnings, parameters, and export presets.
- [ ] Add a top bar with mode switcher, file actions, undo/redo, preset selector, and export actions.
- [ ] Add a bottom activity rail for warnings, applied fixes, and step history.

## Preview Design

- [ ] Show `Original`, `Current`, and `Export` tabs in the preview area.
- [ ] Add split view and onion-skin diff view.
- [ ] Support click-to-select in preview and sync that selection to the layer tree and inspector.
- [ ] Support hover highlight for risky nodes and changed nodes.
- [ ] Add live re-render after every tool change with debounced updates.
- [ ] Add pan, zoom, fit, reset, pixel-grid toggle, transparent-background toggle, and checkerboard backdrop.
- [ ] Use browser-native SVG rendering for instant feedback.
- [ ] Use `@resvg/resvg-wasm` to generate raster snapshots for export previews and pixel diffs.
- [ ] Add preview camera tools for `fit to art`, `fit to bounds`, `center`, `normalize viewBox`, and `save view preset`.

## Tool Organization

### File

- [ ] Drag and drop SVG files.
- [ ] Open from file picker.
- [ ] Paste raw SVG text.
- [ ] Import standalone raster files for tracing.
- [ ] Save session locally.
- [ ] Load saved session locally.

### Inspect

- [ ] Show XML source, pretty source, and parse errors.
- [ ] Build an inventory of elements, defs, styles, animations, links, and external references.
- [ ] Show document metrics: width, height, viewBox, units, path count, segment count, total path length, decimal precision spread, and estimated complexity.
- [ ] Show a Blender import readiness score.
- [ ] Show a self-contained SVG readiness score.
- [ ] Show a risk report for text, strokes, transforms, CSS, filters, masks, clip paths, gradients, patterns, images, symbols/use, malformed path data, open paths, self-intersections, and degenerate geometry.

### Repair

- [ ] Convert shapes to paths.
- [ ] Convert text to paths.
- [ ] Expand `<use>` to concrete geometry.
- [ ] Inline computed styles.
- [ ] Bake transforms into geometry.
- [ ] Close nearly-closed paths.
- [ ] Join nearby path fragments.
- [ ] Remove duplicates, zero-area paths, zero-length segments, and tiny orphan geometry.
- [ ] Reorient winding and repair holes.
- [ ] Detect and repair self-intersections.
- [ ] Merge overlapping fills.
- [ ] Flatten unsupported appearance into geometry or warn when flattening is not possible.
- [ ] Add one-click `Make Blender Safe` preset.

### Style

- [ ] Extract all used colors from attributes, gradients, and embedded CSS.
- [ ] Group colors by similarity.
- [ ] Swap one color across the entire SVG.
- [ ] Remap multiple colors to a new palette.
- [ ] Convert colors between hex, rgb, hsl, lab, lch, and OKLCH-oriented workflows.
- [ ] Normalize alpha and opacity usage.
- [ ] Inline fills and strokes from CSS into attributes when needed.
- [ ] Move repeated inline style back into embedded `<style>` when producing enhanced self-contained SVG.
- [ ] Add theme presets such as `monochrome`, `duotone`, `high contrast`, `dark on light`, `light on dark`, and `brand palette`.
- [ ] Add gradient cleanup and stop editing tools.

### Animate

- [ ] Author native `<animate>` elements for fill, opacity, stroke, size, and attribute changes.
- [ ] Author native `<animateTransform>` elements for translate, rotate, scale, and skew.
- [ ] Author native `<set>` elements for click or hover state toggles that switch class or attribute values.
- [ ] Add animation templates for pulse, reveal, spin, wobble, blink, draw-on, fade, and transform loops.
- [ ] Add timeline controls for duration, delay, repeat count, easing strategy, and begin conditions.
- [ ] Add a reduced-motion export option that disables or simplifies motion.
- [ ] Validate whether authored animation remains self-contained in the exported SVG.

### Interact

- [ ] Add hyperlink authoring using native SVG `<a>`.
- [ ] Add hover and focus styles using embedded `<style>`.
- [ ] Add click-triggered class toggles using native `<set>` timing triggers.
- [ ] Add accessible labels with `<title>` and `<desc>`.
- [ ] Add hotspot regions for click targets.
- [ ] Add layer visibility toggles that stay self-contained.
- [ ] Add internal anchor navigation or alternate view states where practical.
- [ ] Keep a `no embedded script` export profile as the default for portability.
- [ ] Allow an advanced `script-enabled SVG` profile only as an explicit opt-in.

### Export

- [ ] Export `Blender Safe SVG`.
- [ ] Export `Enhanced Self-Contained SVG`.
- [ ] Export `Editable Clean SVG`.
- [ ] Export PNG snapshots.
- [ ] Export step bundles as zip.
- [ ] Export JSON repair and transform report.

## Core Feature Set

### Intake And Parsing

- [ ] Parse SVG into both DOM and AST forms.
  Library / API: native `DOMParser`, `svgson`
- [ ] Parse embedded CSS into a real CSS AST.
  Library / API: `css-tree`
- [ ] Maintain a normalized internal scene graph with references preserved.
  Library / API: `svgson`, custom model layer

### Structure And Compatibility

- [ ] Detect invalid XML, missing namespaces, duplicate IDs, broken references, malformed `d` attributes, and bad URL refs.
  Library / API: native DOM APIs, `svg-path-commander`, `svg-pathdata`
- [ ] Detect text, stroke-only art, external dependencies, style blocks, unsupported effects, embedded rasters, and unresolved defs.
  Library / API: `svgson`, `css-tree`
- [ ] Detect existing animations and interactions already embedded in the SVG.
  Library / API: `svgson`

### Geometry Canonicalization

- [ ] Convert basic shapes to paths.
  Library / API: `svg-path-commander`
- [ ] Normalize path commands to absolute and longhand where needed.
  Library / API: `svg-path-commander`, `svg-pathdata`
- [ ] Bake transforms into coordinates.
  Library / API: `svg-path-commander`, native `DOMMatrix`
- [ ] Normalize coordinate precision.
  Library / API: `svgo`, `svg-path-commander`, `svg-pathdata`
- [ ] Normalize viewBox and coordinate framing.
  Library / API: native DOM APIs, `paper`

### Path Repair

- [ ] Close, join, simplify, flatten, smooth, and deduplicate paths.
  Library / API: `paper`, `svg-pathdata`
- [ ] Repair self-intersections and fill-rule ambiguity.
  Library / API: `paper`, `polygon-clipping`, `bezier-js`
- [ ] Merge or subtract shapes during cleanup.
  Library / API: `paper`, `polygon-clipping`
- [ ] Offset polygons and expand strokes.
  Library / API: `clipper-lib`

### Text And Stroke Conversion

- [ ] Convert text to paths with font-aware geometry.
  Library / API: `opentype.js`
- [ ] Convert strokes and dashed strokes into outline geometry where required.
  Library / API: `clipper-lib`, `paper`

### Color And Style Tooling

- [ ] Parse colors from attributes, gradients, and CSS.
  Library / API: `svgson`, `css-tree`, `culori`
- [ ] Extract palettes and cluster similar colors.
  Library / API: `culori`
- [ ] Perform global color swap, palette replacement, and perceptual interpolation.
  Library / API: `culori`
- [ ] Validate and rewrite embedded CSS.
  Library / API: `css-tree`

### Native SVG Animation And Interaction

- [ ] Create and edit `<animate>`, `<animateTransform>`, and `<set>` elements.
  Library / API: `@svgdotjs/svg.js`, `svgson`
- [ ] Create and edit embedded `<style>` blocks for hover, focus, and state-driven visuals.
  Library / API: `css-tree`, `@svgdotjs/svg.js`
- [ ] Create and edit native SVG links and descriptive nodes.
  Library / API: `svgson`, `@svgdotjs/svg.js`

### Preview And Comparison

- [ ] Pan and zoom SVG previews smoothly.
  Library / API: `@panzoom/panzoom`
- [ ] Generate deterministic raster snapshots.
  Library / API: `@resvg/resvg-wasm`
- [ ] Show pixel and geometry diffs.
  Library / API: `@resvg/resvg-wasm`, `paper`

## Export Profiles

### Clean SVG

- [ ] Normalize formatting and structure for broad SVG reuse.
- [ ] Preserve self-contained styling when useful.
- [ ] Remove obvious hazards and dead content without over-specializing for any one downstream tool.

### Blender Safe

- [ ] Paths only where possible.
- [ ] No live text.
- [ ] No shape primitives unless explicitly allowed.
- [ ] No live transforms.
- [ ] No stylesheet dependency unless user allows it.
- [ ] No filters, masks, clip paths, markers, patterns, or unsupported effects.
- [ ] Optional curve flattening and precision reduction.

### Enhanced Self-Contained SVG

- [ ] Allow embedded `<style>`.
- [ ] Allow native `<animate>`, `<animateTransform>`, and `<set>`.
- [ ] Allow native SVG links.
- [ ] Preserve `title`, `desc`, and accessibility metadata.
- [ ] Preserve gradients and patterns when kept self-contained.
- [ ] Default to no embedded script.

### Editable Clean SVG

- [ ] Keep more original structure.
- [ ] Clean obvious hazards and normalize formatting.
- [ ] Preserve authoring friendliness over strict import safety.

## Suggested Implementation Order

- [ ] Milestone 1: client-only app shell, import, parse, inspect, and live preview.
- [ ] Milestone 2: clean SVG normalization, shape-to-path, transform baking, CSS inlining, and general clean export.
- [ ] Milestone 3: path repair, stroke expansion, text-to-path, and one-click repair presets.
- [ ] Milestone 4: color extraction, color swap, palette remap, embedded CSS editing.
- [ ] Milestone 5: native SVG animation and interaction authoring with self-contained export.
- [ ] Milestone 6: deterministic snapshots, batch mode, step bundles, and session persistence.

## Priority Order

- [ ] Priority 1: file intake, AST parsing, live preview, risk scanner, shape-to-path, transform baking, and general clean export.
- [ ] Priority 1: path validation, open-path detection, text-to-path, stroke-to-outline, self-intersection detection, one-click Blender-safe preset.
- [ ] Priority 2: palette extraction, color swapping, CSS parsing, gradient editing, preview diff, export reports.
- [ ] Priority 2: native animation authoring, hover/focus states, click toggles, links, accessibility metadata.
- [ ] Priority 3: raster tracing, batch workflows, step bundles, script-enabled advanced SVG profile.

## Definition Of Done For V1

- [ ] A user can load an arbitrary SVG and immediately see a clear inspection report and live preview.
- [ ] A user can normalize and export a clean self-contained SVG without needing any backend service.
- [ ] A user can run a one-click Blender-safe cleanup pass and export the result.
- [ ] A user can swap colors, generate a palette variant, and export a self-contained styled SVG.
- [ ] A user can add at least basic native SVG animation and hover/click state changes without relying on an external runtime.
- [ ] The tool shows before/after previews and a machine-readable report of applied fixes.
- [ ] All processing runs locally in the browser.