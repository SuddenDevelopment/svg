/// <reference lib="webworker" />

import { detectNormalizationOpportunities } from './svg-normalization';
import { hydrateUploadedFontAssets } from './svg-fonts';
import type { NormalizationWorkerMessage, NormalizationWorkerRequest } from './svg-normalization-worker-types';

const workerScope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

function postMessageToMainThread(message: NormalizationWorkerMessage) {
  workerScope.postMessage(message);
}

workerScope.addEventListener('message', (event: MessageEvent<NormalizationWorkerRequest>) => {
  const request = event.data;
  if (!request || request.type !== 'analyze') {
    return;
  }

  try {
    postMessageToMainThread({
      type: 'progress',
      requestId: request.requestId,
      label: 'Preparing SVG analysis',
      progress: 0.18,
    });

    const uploadedFonts = hydrateUploadedFontAssets(request.options.uploadedFonts ?? []);

    postMessageToMainThread({
      type: 'progress',
      requestId: request.requestId,
      label: uploadedFonts.length > 0 ? 'Loading uploaded fonts for text analysis' : 'Scanning normalization opportunities',
      progress: uploadedFonts.length > 0 ? 0.42 : 0.64,
    });

    const opportunities = detectNormalizationOpportunities(request.source, {
      uploadedFonts,
      fontMappings: request.options.fontMappings,
    });

    postMessageToMainThread({
      type: 'result',
      requestId: request.requestId,
      opportunities,
    });
  } catch (error) {
    postMessageToMainThread({
      type: 'error',
      requestId: request.requestId,
      message: error instanceof Error ? error.message : 'Unable to analyze normalization opportunities in the background worker.',
    });
  }
});