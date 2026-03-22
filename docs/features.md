# SVG Workbench Roadmap

Prioritized roadmap for the current product direction.

## How To Read This

- `Now`: highest-value work that strengthens the existing workbench and closes known gaps in current workflows.
- `Next`: features that should follow once the current editing, inspection, and export loop is stronger.
- `Later`: broader expansion areas that matter, but should not outrank the core workbench.
- `Completed foundation`: features already implemented and worth preserving as the baseline.

## Now

### Inspection And Readiness


### Repair And Cleanup


### Preview And Core UX


### Export And Derived Outputs

- Add Data URI export with copyable minified output.
- Add JSON machine-readable repair/export report.
- Add React JSX export tab that converts SVG into React-friendly component code.
- Add React Native JSX export tab using `react-native-svg` primitives.

## Next

### Inspection Depth

- Add XML tree and pretty-source inspection with parse-error navigation.
- Add document complexity metrics such as segment count, total path length, decimal precision spread, and estimated complexity.
- Add readiness scorecards for Blender-safe and self-contained SVG workflows.
- Add dedicated animation inspection tools for begin, duration, fill, repeat, and transform timing analysis.

### Repair And Normalization Expansion

- Add gradient and defs deduplication for cleaner exported markup.
- Add a dedicated `Editor Cleanup` preset that focuses on structural cleanup without changing visual output.
- Add flattening guidance or repair paths for unsupported appearance features when possible.
- Add stronger external dependency detection and reporting beyond current media/link blockers.

### Style And Color Tooling

- Add palette extraction from attributes, gradients, and CSS.
- Add global color swap and palette remapping.
- Add opacity normalization and richer color-space conversions.
- Add gradient editing and cleanup tools.

### Preview And Comparison

- Add split-view comparison between original, current, and exported output.
- Add deterministic raster snapshots and visual diffs.
- Add persistent zoom percentage and richer preview camera tools.

### Sharing And Reuse

- Add shareable URLs for loaded SVGs or saved work states.
- Add download actions for generated artifacts directly from output tabs.
- Add sample-gallery or preset-driven testing workflows.

## Later

### Animate

- Author native `<animate>` elements.
- Author native `<animateTransform>` elements.
- Author native `<set>` toggles and state changes.
- Add animation templates for pulse, reveal, spin, wobble, blink, draw-on, fade, and transform loops.
- Add timeline controls for duration, delay, repeat, easing, and begin conditions.
- Add reduced-motion export options.

### Interact

- Author native SVG links with `<a>`.
- Add hover and focus styles using embedded `<style>`.
- Add click-triggered state toggles.
- Add `<title>` and `<desc>` authoring for accessibility.
- Add hotspot regions, internal navigation, and alternate view states where practical.
- Add explicit export profiles for `no embedded script` and opt-in `script-enabled SVG`.

### Batch, Compare, And Packaging

- Add original/current/export comparison modes as a first-class workflow.
- Add batch processing recipes for multiple files.
- Add zip export with original/current/normalized/report bundles.
- Add session save/load and local workflow persistence.

### Mode Expansion

- Add dedicated `Clean And Edit`, `Repair For Blender`, `Enhance SVG`, `Compare`, and `Batch` modes.

## Completed Foundation

### File Intake And Editing

- Open SVG from file picker.
- Drag and drop SVG files into the preview area.
- Edit raw SVG source directly in the app.
- Quick source actions for `Optimize`, `Prettify`, and `Clear`.
- Editor cursor location and inline parse/editing feedback.

### Preview And Selection

- Live SVG preview with sanitization before rendering.
- Preview/source tab switching.
- Pan and zoom controls for large or detailed SVGs.
- Hover highlight for risky or changed nodes.
- Grouped upload, download, and share actions near the preview workspace.
- Click an element in the preview to inspect it.
- Highlight the selected SVG node in the preview.

### Inspection

- Document stats: root, size, viewBox, element count, and source length.
- Top-element and featured-tag summaries.
- Selection inspector with attributes and text preview.
- Risk scan for text, images, transforms, styles, effects, animation, media, and stroke-driven geometry.
- Export-readiness summary with auto-fix versus blocker lists.
- Workflow readiness scorecards that separate geometry-safe export from browser/runtime SVG workflows.
- Runtime-features inspection card for animation, media, links, and external dependencies.
- Defs, gradients, references, and defs-heavy inventory metrics in the inspector.
- Authoring-metadata inventory for Inkscape, Sodipodi, Illustrator-style namespace usage.
- Namespace-safe handling for serialized SVG roots such as `svg:svg`.
- Real-world fixture coverage for Inkscape-authored art and SVG Tiny media/animation files.

### Repair And Normalization

- Convert primitive shapes to paths.
- Convert supported stroke-only geometry into filled outlines.
- Clean near-open paths, join open fragments, repair simple polygon winding, stabilize self-intersections, and remove duplicate or tiny path geometry.
- Clean broken local `href` targets, invalid chained `href`/`xlink:href` references, and non-link external dependency refs while preserving normal external `<a>` links.
- Convert text to paths when embedded or mapped fonts are available.
- Bake direct transforms into geometry.
- Bake safe container transforms into descendant geometry.
- Expand supported local `<use>` references.
- Inline simple embedded CSS rules.
- Strip authoring metadata and editor namespace noise with an editor-cleanup preset.
- Run a one-click safe repair pass that chains the current safe normalization steps.
- Preserve gradient references during safe normalization.
- Preserve `<video>`, `<animate>`, and `<animateTransform>` nodes while still normalizing supported geometry.

### Export

- Download current SVG.
- Copy current SVG to clipboard.
- Download PNG snapshots from the selected export preset.
- Download browser/runtime SVG with runtime-preserving cleanup.
- Copy browser/runtime SVG to clipboard with runtime-preserving cleanup.
- Download geometry-safe SVG.
- Copy geometry-safe SVG to clipboard.
- Download Blender-friendly preset SVG.
- Show an export report with applied repairs and remaining blockers.
- Show clearer export guidance for runtime/media-preserving SVG versus geometry-safe export.
- Split export presets clearly between current, browser/runtime, geometry-safe, and Blender-friendly outputs.
- Show explicit blocker messaging for media-bearing SVG Tiny content.

## Real-World Drivers

### AJ_Digital_Camera.svg

- Confirms the need for metadata cleanup and defs-heavy inspection.
- Confirms the need for namespace-safe parsing and serialization handling.
- Confirms that safe repairs must preserve gradients and linked defs.

### video1.svg

- Confirms the need for runtime/media dependency reporting.
- Confirms the need to distinguish browser/runtime SVG from geometry-safe export.
- Confirms that animation and media should be visible in inspection even when not repairable.
