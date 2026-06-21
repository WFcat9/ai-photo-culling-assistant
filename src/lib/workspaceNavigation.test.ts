import { describe, expect, it } from 'vitest';
import { getWorkspaceShortcutPlan } from './workspaceNavigation';

describe('getWorkspaceShortcutPlan', () => {
  it('routes the colour shortcut to the colour workspace panel', () => {
    expect(getWorkspaceShortcutPlan('color')).toEqual({
      assetViewMode: 'processed',
      detailSection: 'color',
      target: 'detail',
    });
  });

  it('routes the watermark shortcut to the watermark workspace panel', () => {
    expect(getWorkspaceShortcutPlan('watermark')).toEqual({
      assetViewMode: 'watermarked',
      detailSection: 'watermark',
      target: 'detail',
    });
  });
});
