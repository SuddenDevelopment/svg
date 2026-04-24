# Annotation Log

## Step 1: Gather Information
- **Time:** 2026-04-23
- **Status:** Complete
- **Project type:** Pre-captured images only (Blender MCP not available)
- **Doc target:** `D:/GitHub/SpecIO/docs/SpecIO-User-Manual.md`
- **Source image:** `docs/images/sidebar-overview.png` (231 × 1066)
- **User instruction:** Keep full-size sidebar; also crop into per-feature pieces and annotate each
- **Issues:** None

## Step 2: Create Image Folder
- **Folder ID:** `59af528a`
- **Path:** `D:/GitHub/SpecIO/docs/images/59af528a/`
- **Status:** Created

## Step 3: Read Target Documentation
- **Doc:** `docs/SpecIO-User-Manual.md`
- **Sections needing images:** §2 The SVG Sidebar (IMPORT, EXPORT, Tools, Gradient Material, Addon)
- **Strategy:** Add per-section annotated crops within §2 alongside existing full-sidebar image

## Step 4: Capture Screenshots
- **Path:** Pre-captured (no capture needed)
- **Source:** `docs/images/sidebar-overview.png` (231 × 1066)

## Step 5: Crop into per-section pieces
- **import_crop.png** — y=0–300 (231×300) — SpecIO header + IMPORT box + Import SVG button
- **export_crop.png** — y=300–740 (231×440) — EXPORT box from header to Export Selected
- **tools_crop.png** — y=740–843 (231×103) — Tools sub-panel header + 2 buttons + hint
- **gradient_crop.png** — y=843–963 (231×120) — Gradient Material header + Assign + material + toggle + hint
- **addon_crop.png** — y=963–1066 (231×103) — Addon header + Open Preferences + Reset Scene Defaults
- **Iterations:** 3 boundary refinements (initial guesses bled across sections; finalized via diagnostic strips)
- **Status:** Complete, all crops verified visually

## Step 6: Annotate Screenshots
- **import.svg** — 8 callouts (Scale, Resolution, Height, Height Step Ratio, Stroke Overlay Ratio, Create Stroke Objects, Intelligent Split Paths, Import SVG button). 1 attempt, passed review.
- **export.svg** — 10 callouts (Scale, Precision, Default Fill, Apply Stroke, Stroke Color, Stroke Width, Images, Cull to Camera, Mesh Color, Export Selected button). 1 attempt, passed review.
- **tools.svg** — 3 callouts (Copy Active Curve Settings, Split Selected Path, hint label). 1 attempt, passed review.
- **gradient.svg** — Initial 4 callouts overlapped because crop is short and y-spacing was tight; reduced to 3 (Assign SpecIO Gradient, Material name, Managed Gradient checkbox). 2 attempts, passed review.
- **addon.svg** — 2 callouts (Open Preferences, Reset Scene Defaults). 1 attempt, passed review.
- **Visual review:** All 5 SVGs rendered via headless Chrome and inspected. Arrows point at right edges, no clipping, no overlaps after gradient.svg fix.

## Step 7: Embed in Documentation
- **File modified:** `docs/SpecIO-User-Manual.md`
- **Sections updated (in §2 The SVG Sidebar):**
  - IMPORT section — added import.svg + 8-item numbered legend
  - EXPORT section — added export.svg + 10-item numbered legend
  - Tools sub-panel — added tools.svg + 3-item numbered legend
  - Gradient Material sub-panel — added gradient.svg + 3-item numbered legend
  - Addon sub-panel — added addon.svg + 2-item numbered legend
- Bullet lists converted to numbered lists matching callout numbers in each annotated SVG.

## Step 7b: Verify Image Paths
- **Image references found in doc:** 7 (1 user-added logo + 1 sidebar overview + 5 annotated SVGs)
- **All paths verified:** OK on disk (relative paths resolve from docs/ folder)
- **SVGs in image folder:** 5 (import, export, tools, gradient, addon) — all referenced
- **Stale references:** none

## Step 8: Summary
- **Created:** 5 PNG crops, 5 annotated SVGs in `docs/images/59af528a/`
- **Modified:** `docs/SpecIO-User-Manual.md` (section §2 entirely rebuilt with annotated images + legends)
- **Image folder:** `D:/GitHub/SpecIO/docs/images/59af528a/`
- **Log:** `D:/GitHub/SpecIO/docs/annotation_log.md`
- **Total callouts placed:** 26 across 5 SVGs
- **Total review iterations:** 6 (5 first-attempt passes + 1 retry on gradient.svg for callout overlap)
