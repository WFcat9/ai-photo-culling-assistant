export type WorkspaceShortcut = 'face' | 'retouch' | 'color' | 'watermark' | 'export';
export type WorkspaceTarget = 'results' | 'detail' | 'export';
export type WorkspaceDetailSection = 'portrait' | 'color' | 'watermark' | 'summary';
export type WorkspaceAssetViewMode = 'original' | 'processed' | 'watermarked';

export type WorkspaceShortcutPlan = {
  target: WorkspaceTarget;
  filter?: 'expression-review' | 'retouch-ready';
  assetViewMode?: WorkspaceAssetViewMode;
  detailSection?: WorkspaceDetailSection;
};

export function getWorkspaceShortcutPlan(shortcut: WorkspaceShortcut): WorkspaceShortcutPlan {
  switch (shortcut) {
    case 'face':
      return { filter: 'expression-review', detailSection: 'portrait', target: 'detail' };
    case 'retouch':
      return { filter: 'retouch-ready', detailSection: 'summary', target: 'detail' };
    case 'color':
      return { assetViewMode: 'processed', detailSection: 'color', target: 'detail' };
    case 'watermark':
      return { assetViewMode: 'watermarked', detailSection: 'watermark', target: 'detail' };
    case 'export':
      return { detailSection: 'summary', target: 'export' };
  }
}
