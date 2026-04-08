/**
 * Copies the svgedit editor dist files into public/svgedit/ so Vite can
 * serve them as static assets.  Run automatically via `npm run setup:svgedit`
 * or via the postinstall hook.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'node_modules/svgedit/dist/editor');
const dest = resolve(root, 'public/svgedit');

if (!existsSync(src)) {
  console.warn('[setup-svgedit] svgedit package not found – skipping copy.');
  process.exit(0);
}

// Clean previous copy
if (existsSync(dest)) {
  rmSync(dest, { recursive: true, force: true });
}
mkdirSync(dest, { recursive: true });

// Copy essential runtime files (skip .map files and tests/)
cpSync(src, dest, {
  recursive: true,
  filter(source) {
    if (source.endsWith('.map')) return false;
    if (source.includes('tests')) return false;
    return true;
  },
});

// Write the bridge HTML page that adds postMessage integration
const bridgeHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="./svgedit.css" rel="stylesheet" media="all" />
  <title>SVG-Edit</title>
  <style>
    body { margin: 0; overflow: hidden; }
    /* Hide the storage prompt dialog that appears on first load */
    se-storage-dialog { display: none !important; }
  </style>
</head>
<body>
  <div id="container" style="width:100%;height:100vh"></div>
</body>
<script type="module">
  import Editor from './Editor.js';

  const svgEditor = new Editor(document.getElementById('container'));
  svgEditor.setConfig({
    allowInitialUserOverride: false,
    extensions: [],
    noDefaultExtensions: true,
    userExtensions: [],
    noStorageOnLoad: true,
    forceStorage: false,
  });
  svgEditor.init();

  svgEditor.ready(() => {
    // Notify parent that the editor is ready
    window.parent.postMessage({ type: 'svgedit:ready' }, '*');

    // Listen for messages from the parent window
    window.addEventListener('message', (event) => {
      if (!event.data || typeof event.data.type !== 'string') return;

      switch (event.data.type) {
        case 'svgedit:load': {
          // Load SVG string into the editor
          const svgString = event.data.svg;
          if (typeof svgString === 'string' && svgString.trim()) {
            try {
              svgEditor.loadSvgString(svgString, { noAlert: true });
            } catch (e) {
              console.warn('[svgedit-bridge] Failed to load SVG:', e);
            }
          }
          break;
        }
        case 'svgedit:get': {
          // Return the current SVG string to the parent
          const svg = svgEditor.svgCanvas.getSvgString();
          window.parent.postMessage({ type: 'svgedit:svg', svg }, '*');
          break;
        }
      }
    });

    // Forward the 'changed' event so the parent knows edits happened
    svgEditor.svgCanvas.bind('changed', () => {
      window.parent.postMessage({ type: 'svgedit:changed' }, '*');
    });

    // Intercept save to send SVG to parent instead of downloading
    svgEditor.setCustomHandlers({
      save(_win, data) {
        const svg = svgEditor.svgCanvas.getSvgString();
        window.parent.postMessage({ type: 'svgedit:save', svg }, '*');
      },
    });
  });
</script>
</html>`;

writeFileSync(resolve(dest, 'bridge.html'), bridgeHtml, 'utf-8');

console.log('[setup-svgedit] Copied svgedit editor to public/svgedit/');
