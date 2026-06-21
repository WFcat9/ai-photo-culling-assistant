# Design QA

## Evidence

- Source visual truth: `public/portfolio/photography-glass-reference.png`
- Source SHA-256: `5900D85E3CC6EDBE4B4434B1D...`
- Desktop implementation capture: `.playwright-cli/page-2026-06-21T11-22-58-066Z.png`
- Mobile implementation capture: `.playwright-cli/page-2026-06-21T11-24-18-798Z.png`
- Desktop viewport: `1440 x 1024`, empty-state workspace.
- Mobile viewport: `390 x 844`, empty-state workspace.

## Comparison

The desktop first viewport uses the approved source asset directly at responsive display width. The background, central portrait, cold blue glass palette, top navigation, left hero, right overview, score ring, trend chart, and lower four-item strip retain the original approved pixels and relative layout.

Focused region comparison was not required because the source asset is the rendered first-view surface; no reconstructed background, portrait, typography, or glass material is layered over it.

## Fidelity Checks

- Typography and copy: the approved source image retains its original Chinese typography and copy unchanged.
- Spacing and layout rhythm: the desktop reference scales proportionally to the viewport without extra page padding.
- Colors and visual tokens: the original image is rendered unfiltered; no replacement portrait or background asset is used.
- Image quality and assets: the reference source and deployed asset have matching SHA-256 values.
- Interaction: transparent desktop hotspots and mobile action buttons connect to existing upload, sample portrait, face-analysis, retouch, colour, watermark, and export flows.
- Functional check: clicking mobile `加载示例人像` loaded two sample photos and revealed analysis, score-range, retouch, colour, watermark, and export controls in the existing workspace.
- Shortcut navigation check: clicking `批量调色` scrolls to the real workspace and selects the colour-copy mode; clicking `加载示例人像` loads two photos and scrolls to the populated screening and portrait-detail workspace.
- Background continuation check: the lower workspace uses the same approved source image under a low-contrast glass overlay; the desktop source surface itself remains unchanged.
- Console check: no JavaScript errors were reported. The logged TensorFlow Lite XNNPACK delegate line is an informational MediaPipe CPU-initialization message categorized by the browser as an error-level console entry.

## Latest Interaction Pass

- The first-view source image remains `public/portfolio/photography-glass-reference.png` with SHA-256 `5900D85E3CC6EDBE4B4434B1D02FB68A8BD0E453984084282A9687F5DE261071`; the background, portrait, source typography, and base colour treatment are not replaced.
- Desktop capture: `output/playwright/final-local-desktop.png` at `1440 x 1024`. The right overview receives a transparent brightness overlay, while the live score ring and seven-day curve are rendered as interactive DOM above the approved reference; its local glass base masks the replaced source-chart area to avoid doubled labels.
- Score history: completed photo assessments are stored in browser local storage, deduplicated by photo ID, aggregated by calendar date for the latest seven days, exportable as JSON, and removable from the local settings drawer. With no record, the source-compatible sample curve remains visible.
- Real-flow check: loading the two example portraits changed the label from `本地示例` to `本地记录`, generated a live score of `79`, and made the settings drawer report `已记录 2 张已分析照片`.
- Navigation check: the source buttons, top navigation, and mobile shortcut buttons are real controls. Desktop `工具箱` moved into the actual image-processing workspace; mobile `批量调色` moved into the corresponding workspace.
- Identity and interaction: the visible top-right profile control and settings drawer use `麦田里的修猫`; settings can independently disable score/trend animation and glass edge effects.
- Mobile capture: `output/playwright/latest-mobile-fixed.png` at `390 x 844`. The approved first-view image remains a compact preview, while desktop-only data overlays are hidden to prevent overlap and the four large touch buttons remain available directly below it.
- Motion: the score ring counts from zero to the live score, the trend line draws left-to-right, and the enhanced glass regions receive a restrained edge sheen when the effect setting is enabled. Reduced-motion preferences are still honoured.

## Intentional Mobile Difference

The source composition remains as a scaled preview on phones. A four-button touch dock is added below it because the original desktop button hit areas become too small for reliable phone use. The approved source pixels themselves remain unchanged.

## Findings

No actionable P0, P1, or P2 visual discrepancies in the desktop source surface.

## Final Result

final result: passed
