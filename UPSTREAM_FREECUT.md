# FreeCut upstream

Beatvideo Maker is a downstream product based on FreeCut.

- Upstream repository: https://github.com/walterlow/freecut
- Pinned initial snapshot: 4d62e8082c5eb387a96275bcbd323d28f6e41a62
- Upstream license: MIT
- Previous custom Beatvideo Maker main before migration: c9febb04a73a558d3633ed5e2f03a8aff8484df4

## Downstream rule

Keep Beatvideo-specific behavior localized where practical. Prefer
upstream FreeCut systems for timeline, preview, media, effects,
transitions, project state, keyframes and export. Port only unique
Beatvideo music-analysis, beat-reactive and Guided/Auto behavior from
the pre-migration history.

Photo and Video are product workspaces over the same FreeCut runtime,
not separate render/export engines.

Upstream GitHub Actions workflows are deliberately excluded because
this downstream repository owns its own CI/release policy.
