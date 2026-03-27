import { describe, expect, it } from 'vitest';
import {
  applyAnimationDraftsToSource,
  applyAnimationPresetToSource,
  createAnimationDraft,
  inferAnimationDraftForPath,
  listAnimationsForPath,
  removeAnimationAtIndexFromSource,
  removeWorkbenchAnimationsFromSource,
  reorderAnimationInSource,
} from './svg-animation';

describe('svg-animation', () => {
  it('applies a preset to each targeted path', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><g><rect width="12" height="12" /></g><circle cx="30" cy="30" r="10" /></svg>';

    const result = applyAnimationPresetToSource(source, ['0.0', '0.1'], createAnimationDraft('pulse'));

    expect(result.appliedCount).toBe(2);
    expect(result.skippedPaths).toEqual([]);
    expect(result.source.match(/data-svg-workbench-animation="true"/g)?.length).toBe(2);
    expect(result.source).toContain('data-svg-workbench-animation-preset="pulse"');
    expect(result.source).toContain('attributeName="opacity"');
  });

  it('replaces prior workbench-authored animations on the same target', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /></svg>';
    const initial = applyAnimationPresetToSource(source, ['0.0'], createAnimationDraft('pulse'));
    const updated = applyAnimationPresetToSource(initial.source, ['0.0'], createAnimationDraft('fade-in'));

    expect(updated.appliedCount).toBe(1);
    expect(updated.removedCount).toBe(1);
    expect(updated.source.match(/data-svg-workbench-animation="true"/g)?.length).toBe(1);
    expect(updated.source).toContain('data-svg-workbench-animation-preset="fade-in"');
    expect(updated.source).not.toContain('data-svg-workbench-animation-preset="pulse"');
  });

  it('can prepend and append animations onto the same target stack', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /></svg>';
    const initial = applyAnimationPresetToSource(source, ['0.0'], createAnimationDraft('fade-in'));
    const appended = applyAnimationPresetToSource(initial.source, ['0.0'], createAnimationDraft('rotate'), {
      stackMode: 'append',
    });
    const prepended = applyAnimationPresetToSource(appended.source, ['0.0'], createAnimationDraft('drift'), {
      stackMode: 'prepend',
    });

    const summaries = listAnimationsForPath(prepended.source, '0.0');

    expect(prepended.removedCount).toBe(0);
    expect(prepended.source.match(/data-svg-workbench-animation="true"/g)?.length).toBe(3);
    expect(summaries.map((animation) => animation.label)).toEqual(['Drift', 'Fade in', 'Rotate']);
  });

  it('can replace a selected animation stack item by index', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /></svg>';
    const initial = applyAnimationPresetToSource(source, ['0.0'], createAnimationDraft('fade-in'));
    const stacked = applyAnimationPresetToSource(initial.source, ['0.0'], createAnimationDraft('rotate'), {
      stackMode: 'append',
    });
    const updated = applyAnimationPresetToSource(stacked.source, ['0.0'], createAnimationDraft('blink'), {
      stackMode: 'replace-selected',
      targetAnimationIndex: 0,
    });

    const summaries = listAnimationsForPath(updated.source, '0.0');

    expect(updated.appliedCount).toBe(1);
    expect(updated.removedCount).toBe(1);
    expect(summaries.map((animation) => animation.label)).toEqual(['Blink', 'Rotate']);
    expect(inferAnimationDraftForPath(updated.source, '0.0', 0)?.presetId).toBe('blink');
    expect(updated.source).not.toContain('data-svg-workbench-animation-preset="fade-in"');
  });

  it('can reorder a stacked animation to a new position', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /></svg>';
    const first = applyAnimationPresetToSource(source, ['0.0'], createAnimationDraft('fade-in'));
    const second = applyAnimationPresetToSource(first.source, ['0.0'], createAnimationDraft('rotate'), { stackMode: 'append' });
    const third = applyAnimationPresetToSource(second.source, ['0.0'], createAnimationDraft('drift'), { stackMode: 'append' });

    const reordered = reorderAnimationInSource(third.source, '0.0', 0, 3);

    expect(reordered.appliedCount).toBe(1);
    expect(listAnimationsForPath(reordered.source, '0.0').map((animation) => animation.label)).toEqual(['Rotate', 'Drift', 'Fade in']);
  });

  it('can delete a single animation stack item by index', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /></svg>';
    const first = applyAnimationPresetToSource(source, ['0.0'], createAnimationDraft('fade-in'));
    const second = applyAnimationPresetToSource(first.source, ['0.0'], createAnimationDraft('rotate'), { stackMode: 'append' });

    const updated = removeAnimationAtIndexFromSource(second.source, '0.0', 0);

    expect(updated.removedCount).toBe(1);
    expect(listAnimationsForPath(updated.source, '0.0').map((animation) => animation.label)).toEqual(['Rotate']);
  });

  it('removes workbench-authored animations without touching the target element', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /></svg>';
    const animated = applyAnimationPresetToSource(source, ['0.0'], createAnimationDraft('drift'));
    const cleaned = removeWorkbenchAnimationsFromSource(animated.source, ['0.0']);

    expect(cleaned.removedCount).toBe(1);
    expect(cleaned.source).toContain('<rect width="12" height="12"');
    expect(cleaned.source).not.toContain('data-svg-workbench-animation="true"');
  });

  it('skips disallowed targets like defs containers', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" /></defs><rect width="12" height="12" /></svg>';
    const result = applyAnimationPresetToSource(source, ['0.0', '0.1'], createAnimationDraft('blink'));

    expect(result.appliedCount).toBe(1);
    expect(result.skippedPaths).toEqual(['0.0']);
    expect(result.source).toContain('data-svg-workbench-animation-preset="blink"');
  });

  it('supports click-triggered orbit motion output', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" /></svg>';
    const draft = createAnimationDraft('orbit', {
      startMode: 'click',
      delaySeconds: 0.3,
      orbitRadiusX: 30,
      orbitRadiusY: 16,
    });

    const result = applyAnimationPresetToSource(source, ['0.0'], draft);

    expect(result.source).toContain('<animateMotion');
    expect(result.source).toContain('begin="click+0.3s"');
    expect(result.source).toContain('rotate="auto"');
    expect(result.source).toContain('a 30 16');
  });

  it('applies a rotation preset with configurable direction and degrees', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /></svg>';
    const draft = createAnimationDraft('rotate', {
      turnDirection: 'counterclockwise',
      turnDegrees: 270,
      durationSeconds: 2.4,
      repeatMode: 'indefinite',
    });

    const result = applyAnimationPresetToSource(source, ['0.0'], draft);

    expect(result.source).toContain('<animateTransform');
    expect(result.source).toContain('type="rotate"');
    expect(result.source).toContain('values="0; -270"');
    expect(result.source).toContain('dur="2.4s"');
    expect(result.source).toContain('repeatCount="indefinite"');
    expect(result.source).toContain('data-svg-workbench-animation-preset="rotate"');
  });

  it('applies a scale preset with configurable start, peak, and end values', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /></svg>';
    const draft = createAnimationDraft('scale', {
      startScale: 0.85,
      midScale: 1.35,
      endScale: 1.05,
      durationSeconds: 2.1,
      repeatMode: 'count',
      repeatCount: 4,
    });

    const result = applyAnimationPresetToSource(source, ['0.0'], draft);

    expect(result.source).toContain('<animateTransform');
    expect(result.source).toContain('type="scale"');
    expect(result.source).toContain('values="0.85 0.85; 1.35 1.35; 1.05 1.05"');
    expect(result.source).toContain('dur="2.1s"');
    expect(result.source).toContain('repeatCount="4"');
    expect(result.source).toContain('data-svg-workbench-animation-preset="scale"');
  });

  it('applies a random flicker preset with irregular opacity keyframes', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /></svg>';
    const draft = createAnimationDraft('random-flicker', {
      startOpacity: 1,
      midOpacity: 0.22,
      endOpacity: 0.9,
      durationSeconds: 1.4,
      repeatMode: 'count',
      repeatCount: 3,
    });

    const result = applyAnimationPresetToSource(source, ['0.0'], draft);

    expect(result.source).toContain('<animate');
    expect(result.source).toContain('attributeName="opacity"');
    expect(result.source).toContain('data-svg-workbench-animation-preset="random-flicker"');
    expect(result.source).toContain('dur="1.4s"');
    expect(result.source).toContain('repeatCount="3"');
    expect(result.source).toContain('keyTimes="0;0.07;0.16;0.28;0.41;0.55;0.69;0.83;1"');
    expect(result.source).toContain('values="1;0.47;0.22;0.8;0.32;0.69;0.26;0.84;0.9"');
  });

  it('summarizes authored animations on a target element', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /></svg>';
    const animated = applyAnimationPresetToSource(source, ['0.0'], createAnimationDraft('color-shift'));
    const summaries = listAnimationsForPath(animated.source, '0.0');

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.label).toBe('Color shift');
    expect(summaries[0]?.isWorkbenchAuthored).toBe(true);
    expect(summaries[0]?.detail).toContain('fill');
  });

  it('applies per-target overrides when multiple targets share a preset', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /><circle cx="30" cy="30" r="10" /></svg>';
    const baseDraft = createAnimationDraft('drift');

    const result = applyAnimationDraftsToSource(source, [
      { path: '0.0', draft: createAnimationDraft('drift', { ...baseDraft, delaySeconds: 0.2, motionDistance: 10 }) },
      { path: '0.1', draft: createAnimationDraft('drift', { ...baseDraft, delaySeconds: 0.8, motionDistance: 28 }) },
    ]);

    expect(result.source).toContain('begin="0.2s"');
    expect(result.source).toContain('begin="0.8s"');
    expect(result.source).toContain('values="0 0; 7.07 -7.07; 0 0"');
    expect(result.source).toContain('values="0 0; 19.8 -19.8; 0 0"');
  });

  it('infers a workbench-editable draft from native svg animation markup', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12"><animate attributeName="opacity" values="1;0;1" dur="0.6s" begin="click+0.2s" repeatCount="indefinite" /></rect></svg>';
    const draft = inferAnimationDraftForPath(source, '0.0');

    expect(draft?.presetId).toBe('blink');
    expect(draft?.startMode).toBe('click');
    expect(draft?.delaySeconds).toBe(0.2);
    expect(draft?.durationSeconds).toBe(0.6);
  });

  it('infers a random flicker draft from irregular native opacity values', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12"><animate attributeName="opacity" values="1;0.47;0.22;0.72;0.33;0.63;0.27;0.86;0.9" dur="1.4s" repeatCount="indefinite" /></rect></svg>';
    const draft = inferAnimationDraftForPath(source, '0.0');

    expect(draft?.presetId).toBe('random-flicker');
    expect(draft?.startOpacity).toBe(1);
    expect(draft?.midOpacity).toBe(0.22);
    expect(draft?.endOpacity).toBe(0.9);
    expect(draft?.durationSeconds).toBe(1.4);
    expect(draft?.repeatMode).toBe('indefinite');
  });

  it('infers a rotation draft from native rotate transform markup', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12"><animateTransform attributeName="transform" type="rotate" values="0; -135" dur="1.5s" repeatCount="2" /></rect></svg>';
    const draft = inferAnimationDraftForPath(source, '0.0');

    expect(draft?.presetId).toBe('rotate');
    expect(draft?.turnDirection).toBe('counterclockwise');
    expect(draft?.turnDegrees).toBe(135);
    expect(draft?.durationSeconds).toBe(1.5);
    expect(draft?.repeatMode).toBe('count');
    expect(draft?.repeatCount).toBe(2);
  });

  it('infers a scale draft from native scale transform markup', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12"><animateTransform attributeName="transform" type="scale" values="0.9 0.9; 1.25 1.25; 1.05 1.05" dur="1.8s" repeatCount="indefinite" /></rect></svg>';
    const draft = inferAnimationDraftForPath(source, '0.0');

    expect(draft?.presetId).toBe('scale');
    expect(draft?.startScale).toBe(0.9);
    expect(draft?.midScale).toBe(1.25);
    expect(draft?.endScale).toBe(1.05);
    expect(draft?.durationSeconds).toBe(1.8);
    expect(draft?.repeatMode).toBe('indefinite');
  });

  it('preserves workbench-authored scale values when loading a draft back from source', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /></svg>';
    const authored = applyAnimationPresetToSource(source, ['0.0'], createAnimationDraft('scale', {
      startScale: 0.92,
      midScale: 1.28,
      endScale: 1.08,
    }));

    const draft = inferAnimationDraftForPath(authored.source, '0.0');

    expect(draft?.presetId).toBe('scale');
    expect(draft?.startScale).toBe(0.92);
    expect(draft?.midScale).toBe(1.28);
    expect(draft?.endScale).toBe(1.08);
  });

  it('applies a path-morph circle preset to a path element', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M 10 50 L 90 50 L 50 10 Z" /></svg>';
    const draft = createAnimationDraft('path-morph', { morphTarget: 'circle', morphAmount: 80 });

    const result = applyAnimationPresetToSource(source, ['0.0'], draft);

    expect(result.appliedCount).toBe(1);
    expect(result.source).toContain('<animate');
    expect(result.source).toContain('attributeName="d"');
    expect(result.source).toContain('data-svg-workbench-animation-preset="path-morph"');
    expect(result.source).toContain('from=');
    expect(result.source).toContain('to=');
  });

  it('applies a path-morph jitter preset to a path element', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M 0 0 L 100 0 L 100 100 L 0 100 Z" /></svg>';
    const draft = createAnimationDraft('path-morph', { morphTarget: 'jitter', morphAmount: 12 });

    const result = applyAnimationPresetToSource(source, ['0.0'], draft);

    expect(result.appliedCount).toBe(1);
    expect(result.source).toContain('attributeName="d"');
    expect(result.source).toContain('data-svg-workbench-animation-preset="path-morph"');
    // from and to should differ because jitter offsets the points
    const fromMatch = result.source.match(/from="([^"]+)"/);
    const toMatch = result.source.match(/to="([^"]+)"/);
    expect(fromMatch).not.toBeNull();
    expect(toMatch).not.toBeNull();
    expect(fromMatch![1]).not.toBe(toMatch![1]);
  });

  it('skips path-morph when element has no d attribute', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" /></svg>';
    const draft = createAnimationDraft('path-morph');

    const result = applyAnimationPresetToSource(source, ['0.0'], draft);

    expect(result.appliedCount).toBe(0);
    expect(result.skippedPaths).toEqual(['0.0']);
  });

  it('infers a path-morph draft from a native d attribute animate', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M 10 50 L 90 50 L 50 10 Z"><animate attributeName="d" from="M 10 50 L 90 50 L 50 10 Z" to="M 50 10 L 90 90 L 10 90 Z" dur="1.5s" repeatCount="indefinite" /></path></svg>';
    const draft = inferAnimationDraftForPath(source, '0.0');

    expect(draft?.presetId).toBe('path-morph');
    expect(draft?.durationSeconds).toBe(1.5);
    expect(draft?.repeatMode).toBe('indefinite');
  });
});