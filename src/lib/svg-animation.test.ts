import { describe, expect, it } from 'vitest';
import {
  applyAnimationDraftsToSource,
  applyAnimationPresetToSource,
  createAnimationDraft,
  inferAnimationDraftForPath,
  listAnimationsForPath,
  removeWorkbenchAnimationsFromSource,
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
});