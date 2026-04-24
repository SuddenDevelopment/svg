# SpecIO Roadmap

This document turns the current feature analysis into an implementation roadmap for SpecIO.

It is intentionally focused on:

- what is already strong in the addon
- which missing features are most valuable next
- how hard they are likely to be
- the general approach that fits the current architecture

SpecIO already has a strong foundation for:

- shape and path import
- style-aware roundtrip for common fill and stroke cases
- gradients and managed gradient authoring
- raster image roundtrip for local and embedded images
- text import and path-oriented text export
- camera-projected SVG export for meshes, curves, and text
- hierarchy preservation, ordering, and automated regression coverage

The roadmap below therefore prioritizes SVG fidelity and workflow gaps that are still common in real-world Illustrator and Inkscape files.

## Difficulty Scale

- `S`: small change, localized logic, low architectural risk
- `M`: moderate feature, touches multiple modules, straightforward test plan
- `L`: substantial feature, new data flow or broader import/export model changes
- `XL`: major feature, high SVG-spec complexity or broad Blender integration impact

## Prioritization Principles

Features are prioritized using these criteria:

1. Frequency in real SVG files
2. Roundtrip fidelity impact
3. Fit with SpecIO's current architecture
4. Testability and release risk
5. User-visible value relative to implementation cost

## Recommended Delivery Phases

### Phase 1: Fidelity Foundation

Focus on document layout correctness and common referenced-content workflows.

### Phase 2: Real-World Artwork Support

Focus on clipping, masking, richer text, and stroke semantics used in authored SVGs.

### Phase 3: Workflow and UX Maturity

Focus on diagnostics, discoverability, and authoring/export polish.

### Phase 4: Advanced SVG Coverage

Focus on expensive or more speculative features that increase compatibility but should come after the core fidelity gaps are closed.

## Priority List

## 1. Full Document Units, viewBox, and preserveAspectRatio

- Priority: `P0`
- Difficulty: `L`
- Value: Very high

### Why this matters

This is the highest-value gap in the current addon. Many SVG import failures are not path-parser failures; they are document layout failures. If document size, units, viewBox transforms, or aspect-ratio behavior are off, the imported geometry may be scaled or positioned incorrectly even when the element parser is correct.

This also affects export quality. The current exporter writes a tight bounds-based SVG document, which is useful, but it is not the same as preserving or authoring an explicit document canvas or artboard.

### General approach

- Introduce a dedicated document-layout helper in `io_svg/` for width, height, unit parsing, viewBox resolution, and preserveAspectRatio handling.
- Separate document-space transforms from element-local transforms so the importer can apply them in a predictable order.
- Expand export settings to optionally choose between:
  - tight content bounds
  - original imported document bounds when available
  - user-specified export page size
- Store imported document metadata on the synthetic root collection or scene-level export state so export can reuse it.

### Expected work areas

- `io_svg/importer.py`
- `io_svg/document.py`
- `io_svg/transform.py`
- `properties/svg_properties.py`
- `operators/svg_operators.py`
- `tests/test_svg_document.py`
- `tests/blender_smoke.py`

### Key risks

- Subtle coordinate-system regressions
- Backward compatibility for currently working sample files
- Ambiguity around percentage-based dimensions and missing width and height cases

### Validation approach

- Add pure Python tests for unit parsing and preserveAspectRatio cases.
- Add Blender smoke scenarios for mismatched width and height plus viewBox inputs.
- Add at least one roundtrip sample with non-default page bounds.

## 2. Support for `use` and `symbol`

- Priority: `P0`
- Difficulty: `L`
- Value: High

### Why this matters

Referenced geometry is common in authored SVGs. Without `use` and `symbol`, a large class of otherwise simple files imports incompletely or silently loses reusable content.

This is also a good architectural fit for SpecIO because the addon already preserves group hierarchy and has a reasonable collection-based structure that can host resolved instances.

### General approach

- Add a defs/reference pass that indexes elements by id before geometry creation.
- Resolve `use` references into imported geometry with explicit transform composition and inherited style handling.
- Treat `symbol` as reusable container content with its own local coordinate context.
- Prefer deterministic duplication first rather than trying to preserve live instancing semantics in Blender.

### Expected work areas

- `io_svg/importer.py`
- possibly a new `io_svg/references.py`
- `io_svg/style.py`
- `io_svg/transform.py`
- `tests/blender_smoke.py`

### Key risks

- Cycles and invalid references
- Interaction between referenced content and inherited transforms or styles
- Naming collisions for duplicated referenced content

### Validation approach

- Add import tests for defs-contained paths and groups.
- Add nested `use` coverage and invalid-reference behavior.
- Add collection and ordering assertions in Blender smoke tests.

## 3. `clipPath` Support

- Priority: `P1`
- Difficulty: `XL`
- Value: High

### Why this matters

Clipping is one of the most common reasons complex design SVGs fail to match their source artwork. Logos, icons, UI illustrations, and exported design-tool assets frequently rely on clip paths.

### General approach

- Start with import support only.
- Restrict the first version to path-based clip content and supported shape primitives.
- Resolve the clip path into curve geometry, then apply a Blender-side approximation strategy for visibility or geometry trimming.
- If exact destructive trimming is too risky at first, begin with a documented approximation layer and clear user warnings when fidelity is partial.

### Expected work areas

- new clip-path helper module in `io_svg/`
- `io_svg/importer.py`
- path and curve utilities
- import diagnostics and reporting

### Key risks

- Blender does not map directly to SVG clipping semantics for all cases.
- Boolean or trimming workflows can become brittle.
- Export parity is harder than import parity.

### Validation approach

- Add isolated clip fixtures with one object, one clip, and nested groups.
- Add malformed clip references and unsupported-clip summaries.

## 4. `mask` Support

- Priority: `P1`
- Difficulty: `XL`
- Value: Medium-high

### Why this matters

Masking is less universal than clipping but still common in authored SVGs. It is especially important for soft transitions, luminance-based visibility, and artwork exported from modern design tools.

### General approach

- Treat this as a separate feature from clip paths.
- Begin with a narrow supported subset rather than broad spec coverage.
- Prefer alpha-mask import handling only at first, with clear documentation that luminance and advanced mask behavior may be deferred.

### Expected work areas

- importer-side mask parsing and diagnostics
- possible interaction with image and gradient content
- tests with limited supported fixtures

### Key risks

- Mask semantics are substantially more complex than clip paths.
- High chance of partial support if attempted too early.

### Recommendation

Do not start this until clip paths and document layout are on stable footing.

## 5. Richer Text Support: `tspan`, multiline text, and `textPath`

- Priority: `P1`
- Difficulty: `L` for `tspan` and multiline, `XL` for `textPath`
- Value: High

### Why this matters

SpecIO already supports basic `text`, which is useful, but many real SVGs use nested `tspan` blocks, explicit line control, or text on curves. Current support is good enough for labels, not for broader SVG text fidelity.

### General approach

- Split the work into two milestones:
  - milestone A: `tspan`, multiline layout, inherited text styling
  - milestone B: `textPath`
- Build a text extraction helper that produces a normalized text-run model before Blender object creation.
- For `textPath`, start with import only and convert to curves when necessary.
- Keep editable Blender text when possible for plain text runs; degrade to curve output only when the source construct cannot map cleanly.

### Expected work areas

- `io_svg/importer.py`
- possibly a new `io_svg/text.py`
- `tests/test_svg_text_import.py`
- Blender smoke coverage for multiline and path-bound text

### Key risks

- Blender text objects do not match SVG text layout semantics exactly.
- Font availability and glyph metrics can introduce platform differences.
- `textPath` may require fallback-to-curve behavior to stay predictable.

### Validation approach

- Add pure tests for text-run extraction.
- Add Blender smoke tests for multiline layout and anchor behavior.
- Treat `textPath` as an explicitly bounded feature with documented fallback behavior.

## 6. Stroke Dashes and Marker Support

- Priority: `P1`
- Difficulty: `M` for dash metadata, `L` for visual approximation and export parity
- Value: High

### Why this matters

Dashed strokes and markers are standard drawing features. Their absence is very visible in diagrams, technical drawings, maps, and annotation-heavy artwork.

### General approach

- Extend supported style properties to include:
  - `stroke-dasharray`
  - `stroke-dashoffset`
  - `marker-start`
  - `marker-mid`
  - `marker-end`
  - `stroke-miterlimit`
- Preserve metadata first.
- Add Blender display approximations second if they can be done predictably.
- For markers, begin with import diagnostics and export preservation where possible before promising editable Blender-native marker authoring.

### Expected work areas

- `io_svg/style.py`
- importer/exporter style metadata mapping
- UI docs and supported-subset docs

### Key risks

- Blender does not have a native one-to-one model for SVG stroke dashes and markers.
- Full viewport fidelity may not be practical without geometry expansion.

### Validation approach

- Add roundtrip tests that preserve dash metadata.
- Add explicit unsupported-summary coverage for markers not yet reconstructed visually.

## 7. Pattern Fill Support

- Priority: `P2`
- Difficulty: `XL`
- Value: Medium-high

### Why this matters

Patterns are common in authored artwork and maps, but they are less universal than gradients, clipping, or referenced geometry. This is a natural next step after the current gradient system, but it is not the next best step.

### General approach

- Reuse the existing paint-server direction already established for gradients.
- Build a pattern payload model that can preserve ids, transforms, units, and tile bounds.
- Start with import and metadata preservation before attempting Blender-native editable pattern authoring.

### Recommendation

Keep this behind the higher-priority layout, reference, text, and clipping work.

## 8. User-Facing Import and Export Diagnostics for Unsupported Content

- Priority: `P2`
- Difficulty: `M`
- Value: High

### Why this matters

This feature is less glamorous than parser work, but it has strong product value. Right now, unsupported content can be skipped without a complete structured summary. A serious SVG pipeline tool should tell the user what was skipped, simplified, or approximated.

### General approach

- Introduce a structured import/export diagnostics collector.
- Track unsupported tags, invalid references, approximations, and skipped external resources.
- Surface a concise summary in `self.report()` and a more detailed optional log or text block.
- Ensure the UI remains compact and does not become noisy for successful simple files.

### Expected work areas

- `io_svg/importer.py`
- `io_svg/exporter.py`
- `operators/svg_operators.py`
- Blender smoke tests for warning summaries

### Key risks

- Too much noise in normal workflows
- Inconsistent summary wording if not centralized

### Validation approach

- Add malformed and partially supported fixtures.
- Assert warning counts and key summary phrases in smoke tests.

## 9. File Menu Integration and Import-Export Workflow Polish

- Priority: `P2`
- Difficulty: `S`
- Value: Medium

### Why this matters

SpecIO is currently exposed through the N-panel workflow. That is functional, but many Blender users expect importers and exporters to appear in File > Import and File > Export. This is mainly a usability and discoverability improvement.

### General approach

- Register import and export menu entries in addition to the current sidebar panel.
- Keep the current N-panel workflow because it exposes scene settings and utility tools.
- Ensure both entry points share the same settings and operator behavior.

### Recommendation

This is worth doing early if you want lower-effort UX wins, but it should not displace the higher-value fidelity work.

## 10. Export Canvas Controls and Artboard-Oriented Workflows

- Priority: `P2`
- Difficulty: `M`
- Value: Medium-high

### Why this matters

The exporter currently focuses on content bounds and camera projection. Many users will also want explicit control over SVG output dimensions, margins, origin placement, and whether to preserve imported document size versus export a fresh tight frame.

### General approach

- Add export options for:
  - tight bounds
  - imported document bounds
  - custom width and height
  - optional margin or padding
- Keep this feature closely tied to item 1 so document-layout logic is not duplicated.

## 11. Safer and More Complete Raster Image Workflow

- Priority: `P3`
- Difficulty: `M`
- Value: Medium

### Why this matters

Current raster support is already useful for local and embedded images. The next improvements are less about basic support and more about robustness, diagnostics, and export control.

### General approach

- Improve missing-image handling and export diagnostics.
- Make linked-path export behavior more explicit and deterministic.
- Keep remote URL import disabled by default for security.
- If remote loading is ever considered, make it opt-in and clearly permission-gated.

## 12. Optional Advanced Parsing Backend Integration

- Priority: `P3`
- Difficulty: `L`
- Value: Medium

### Why this matters

This is a strategic option, not an immediate product need. A more advanced parsing backend could accelerate support for edge cases, but it also increases packaging and maintenance complexity.

### General approach

- Only revisit this after the core fidelity roadmap is stable.
- Treat any external parser as optional and verify Blender 5.1+ packaging compatibility first.
- Keep SpecIO's own supported-subset behavior explicit even if an optional backend is enabled.

## Recommended Implementation Order

If work is done incrementally, this is the recommended order:

1. Document units, viewBox, preserveAspectRatio, and export canvas controls
2. `use` and `symbol`
3. Richer text support with `tspan` and multiline layout
4. Stroke dashes and metadata-preserving marker support
5. User-facing unsupported-content diagnostics
6. `clipPath`
7. File menu integration and workflow polish
8. `mask`
9. Pattern fills
10. Optional advanced parser backend work

This ordering favors correctness and compatibility for common SVG files before pursuing broader spec coverage.

## Suggested Milestones

### Milestone A

- document units and viewBox correctness
- export canvas controls
- smoke and unit coverage for layout fixtures

### Milestone B

- `use` and `symbol`
- unsupported-content reporting framework

### Milestone C

- `tspan` and multiline text
- dash metadata preservation and export

### Milestone D

- `clipPath`
- workflow polish and menu integration

### Milestone E

- `mask`
- patterns
- any optional backend exploration

## What Not To Prioritize Yet

These items are lower priority for now:

- animation and script content
- remote image fetching by default
- full SVG filter coverage
- exact preservation of original path command syntax when normalized output is already reliable
- speculative feature work that weakens the addon's current reliability bar

## Standard of Completion

A roadmap item should only be treated as done when:

- the behavior is implemented for the documented supported subset
- README support notes are updated
- unsupported cases are documented clearly
- pure Python tests are added where applicable
- Blender smoke coverage is added where applicable
- `python scripts/test_quick.py` passes
- `python scripts/test_full.py` is run for packaging, registration, or extension-workflow changes