# Third-party notices

Beatvideo Maker currently relies on the following direct runtime libraries.

- React and React DOM — MIT License.
- Radix Icons — MIT License. Beatvideo Maker adapts a small set of Radix SVG paths for neutral editor controls and the in-app mark. Radix branding and trademarks are not used as Beatvideo Maker identity.
- Mediabunny — Mozilla Public License 2.0.
- @mediabunny/aac-encoder — Mozilla Public License 2.0. The package contains its documented FFmpeg-based AAC WebAssembly encoder.
- web-audio-beat-detector — MIT License.
- TransNetV2 — MIT License, Copyright (c) 2020 Tomáš Souček. Beatvideo Maker lazily downloads a pinned TransNetV2 ONNX model for local shot-boundary analysis and verifies its SHA-256 hash before caching it.
- ONNX Runtime Web — MIT License. The browser runtime is loaded lazily from a pinned CDN version for local model inference.
- FreeCut — MIT License, Copyright (c) 2025 FreeCut. Beatvideo Maker adapts its effect-instance/registry concepts and analytic pulse/modifier approach for a smaller beat-video effect stack; the full FreeCut NLE or GPU pipeline is not vendored here.
- vite-plugin-pwa / Workbox runtime and build tooling — MIT License.

Development tooling includes Vite, TypeScript and Playwright under their respective upstream licenses.

This file is a notice, not a replacement for the license texts distributed with installed npm packages.
