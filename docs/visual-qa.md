# Visual QA

UI work is reviewed from deterministic Chromium screenshots at fixed desktop viewports. Screenshot generation is evidence collection, not the visual review itself.

## Run

    npx playwright install chromium
    npm run visual:qa

Output is written to ignored `artifacts/visual-qa/` files. CI uploads the folder as the `Beatvideo-Visual-QA` artifact.

## Matrix

- 1024×768 — minimum supported desktop review;
- 1440×900 — normal working layout;
- 1920×1080 — wide layout.

The fixture route `/?fixture=1` supplies a synthetic portrait cover plus representative title and wordmark. It exists only to make layout/compositor screenshots deterministic; it is not user media and it does not prove media decoding.

## Human review contract

For material UI changes, inspect all current screenshots and check:

1. no horizontal escape, clipped controls or hidden primary actions;
2. preview remains 16:9 and visually dominant;
3. portrait cover is not stretched and background fill stays subordinate;
4. title is readable without overwhelming the cover;
5. watermark is visibly secondary and inside the safe area;
6. minimum/normal/wide layouts preserve hierarchy and reasonable density;
7. controls have consistent spacing, focus states and usable labels;
8. capability/error states are understandable and do not look successful when blocked;
9. safe guides are preview-only;
10. no accidental timeline/layer-editor complexity has entered the main flow.

Generated PNGs, reports and media fixtures are workflow artifacts. Do not commit screenshot dumps or export samples to source.
