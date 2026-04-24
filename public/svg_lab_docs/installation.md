# Installation

SpecIO is a Blender 5.1+ extension. It does not install in older Blender versions.

## Requirements

- Blender 5.1.0 or newer
- Operating system: Windows, macOS, or Linux (Windows is the primary validated platform)

## Install from a built `.zip`

1. Obtain a built extension `.zip` (release artifact or the output of `blender --command extension build`).
2. In Blender, open `Edit > Preferences > Extensions`.
3. Click the dropdown at the top right and choose `Install from Disk...`.
4. Select the SpecIO `.zip` file.
5. Tick the checkbox next to `SpecIO` in the extensions list to enable it.

## Install from the source tree (development)

If you cloned the repository directly:

1. Open `Edit > Preferences > Extensions` in Blender 5.1+.
2. Use `Install from Disk...` and pick the repo folder, or follow the local-development extension workflow for your Blender install.
3. Enable `SpecIO` in the list.

## Building the extension yourself

From the repository root, with Blender on `PATH` (or using the full `blender.exe` path):

```powershell
blender --command extension validate
blender --command extension build
```

`build` produces a versioned `.zip` in the `artifacts/` directory ready to install on another machine.

## Verifying the install

1. Open the 3D Viewport.
2. Press `N` to open the sidebar.
3. You should see an `SVG` tab containing a `SpecIO` panel with sub-panels for `Import`, `Export`, `Tools`, `Gradient Material`, and `Addon`.

If the `SVG` tab is missing, return to `Edit > Preferences > Extensions`, search for "SpecIO", and confirm the checkbox is enabled.

## Uninstalling

1. In `Edit > Preferences > Extensions`, find `SpecIO`.
2. Untick the checkbox to disable, or use the dropdown menu next to it to remove the extension entirely.

Disabling does not delete imported curves, text, image planes, or assigned gradient materials from any saved `.blend` file. Re-enabling SpecIO restores the panel and operators; previously imported objects keep their custom SpecIO metadata properties so they remain exportable.

## Optional: SVGElements library

There is an `Addon Preferences > Library Settings > Use SVGElements Library` toggle. SpecIO's importer currently uses its own pure-Python SVG parser; the SVGElements toggle is a forward-looking optional dependency switch. Leaving it enabled is safe.
