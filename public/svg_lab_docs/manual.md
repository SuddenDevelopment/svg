# SpecIO User Manual

SpecIO is a Blender 5.1+ extension for importing and exporting SVG files. It supports a practical subset of SVG (vector geometry, raster images, text, gradients) and adds a roundtrip workflow that lets you bring SVGs into Blender, edit them as curves/text/images, and write them back out — including 2D camera-projected exports of 3D scenes.

This manual covers everything exposed in the UI: every operator, every setting, every panel, and what to expect from import and export.

![SpecIO sidebar overview](images/sidebar-overview.png)

## Pages

1. [Installation](installation.md) — install, enable, build the extension package
2. [The SVG Sidebar](interface.md) — N-panel walkthrough, where every control lives
3. [Importing SVG](importing.md) — file picker behavior, options, what gets created
4. [Exporting SVG](exporting.md) — selection rules, supported source objects, output behavior
5. [Managed Gradient Workflow](gradients.md) — assign, edit, and round-trip linear/radial SVG gradients
6. [Tools](tools.md) — `Copy Active Curve Settings` and `Split Selected Path`
7. [Settings Reference](settings-reference.md) — every scene setting and addon preference
8. [SVG Support Matrix](svg-support.md) — what is supported, partially supported, or not supported
9. [Troubleshooting](troubleshooting.md) — common errors and how to resolve them

## Quick Start

1. Install and enable SpecIO from `Edit > Preferences > Extensions` (see [Installation](installation.md)).
2. Open the 3D Viewport and press `N` to open the sidebar. Click the `SVG` tab. The panel header reads `SpecIO v<version>`.
3. In the **IMPORT** boxed section, click `Import SVG` and choose a `.svg` file. Imported geometry appears as Blender curves, text objects, and image planes inside a collection named `<filename>_SVG`.
4. To export, select one or more curve, text, or image objects and click `Export Selected` in the **EXPORT** boxed section.
5. To export 2D silhouettes of 3D meshes, switch the viewport to camera view (`Numpad 0`), select the meshes, and click `Export Selected`.
