import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * URL of the svgedit bridge page served from public/svgedit/.
 * Vite copies public/ to the dist root, so the path is relative to index.html.
 */
const SVGEDIT_BRIDGE_URL = './svgedit/bridge.html';

interface SvgEditEmbedProps {
  /** SVG source to load when the editor becomes ready or when this value changes. */
  svgSource: string;
  /** Called when the user saves inside the editor (Ctrl+S or File → Save). */
  onSave?: (svg: string) => void;
  /** Called whenever the canvas content is modified. */
  onChange?: () => void;
  /** Whether the editor panel is visible. The iframe is kept mounted for speed but hidden when inactive. */
  visible: boolean;
}

/**
 * Embeds the full SVG-Edit visual editor in an iframe and communicates via
 * `postMessage`.  The component keeps the iframe mounted while visible to
 * avoid repeated initialisation delays.
 */
export function SvgEditEmbed({ svgSource, onSave, onChange, visible }: SvgEditEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const pendingSvgRef = useRef<string | null>(null);
  const lastLoadedRef = useRef<string>('');
  // Lazy-mount: only create the iframe once the panel has been visible at
  // least once.  This avoids the Editor computing NaN dimensions from a
  // zero-sized hidden container.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible && !mounted) setMounted(true);
  }, [visible, mounted]);
  // Send SVG into the editor once it's ready
  const loadSvg = useCallback((svg: string) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !isReady) {
      pendingSvgRef.current = svg;
      return;
    }
    if (svg === lastLoadedRef.current) return;
    lastLoadedRef.current = svg;
    iframe.contentWindow.postMessage({ type: 'svgedit:load', svg }, '*');
  }, [isReady]);

  // Request current SVG from the editor
  const requestSvg = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !isReady) return;
    iframe.contentWindow.postMessage({ type: 'svgedit:get' }, '*');
  }, [isReady]);

  // Listen for messages from the iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!event.data || typeof event.data.type !== 'string') return;

      switch (event.data.type) {
        case 'svgedit:ready':
          setIsReady(true);
          break;
        case 'svgedit:save':
          if (typeof event.data.svg === 'string') {
            onSave?.(event.data.svg);
          }
          break;
        case 'svgedit:svg':
          if (typeof event.data.svg === 'string') {
            onSave?.(event.data.svg);
          }
          break;
        case 'svgedit:changed':
          onChange?.();
          break;
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSave, onChange]);

  // When the editor becomes ready, send any pending SVG
  useEffect(() => {
    if (isReady && pendingSvgRef.current) {
      loadSvg(pendingSvgRef.current);
      pendingSvgRef.current = null;
    }
  }, [isReady, loadSvg]);

  // Load SVG when source prop changes
  useEffect(() => {
    loadSvg(svgSource);
  }, [svgSource, loadSvg]);

  return (
    <div
      className="svgedit-embed-container"
      style={{
        visibility: visible ? 'visible' : 'hidden',
        position: visible ? undefined : 'absolute',
        width: '100%',
        height: '100%',
      }}
    >
      <div className="svgedit-embed-toolbar">
        <button
          type="button"
          className="ghost-button svgedit-apply-button"
          onClick={requestSvg}
          disabled={!isReady}
        >
          Apply changes
        </button>
        {!isReady && mounted && <span className="svgedit-loading-label">Loading editor…</span>}
      </div>
      {mounted && (
        <iframe
          ref={iframeRef}
          className="svgedit-iframe"
          src={SVGEDIT_BRIDGE_URL}
          title="SVG-Edit visual editor"
        />
      )}
    </div>
  );
}

export default SvgEditEmbed;
