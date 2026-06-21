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
- Console check: no JavaScript errors were reported. The logged TensorFlow Lite XNNPACK delegate line is an informational MediaPipe CPU-initialization message categorized by the browser as an error-level console entry.

## Intentional Mobile Difference

The source composition remains as a scaled preview on phones. A four-button touch dock is added below it because the original desktop button hit areas become too small for reliable phone use. The approved source pixels themselves remain unchanged.

## Findings

No actionable P0, P1, or P2 visual discrepancies in the desktop source surface.

## Final Result

final result: passed
