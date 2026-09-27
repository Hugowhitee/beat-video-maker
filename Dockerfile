FROM node:22-alpine AS build
WORKDIR /app

RUN apk add --no-cache git

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .

RUN npx vp check \
  src/features/auto-edit/beatThis.worker.ts \
  src/features/auto-edit/beatThisCore.ts \
  src/features/auto-edit/musicAnalysis.ts \
  src/features/auto-edit/musicMap.ts \
  src/features/auto-edit/spectral-transients.test.ts \
  src/features/auto-edit/spectral-transients.ts \
  src/features/editor/components/beatvideo-master-panel.tsx \
  src/features/editor/components/beatvideo-music-panel.tsx \
  src/features/editor/components/editor.tsx \
  src/features/editor/components/media-sidebar.tsx \
  src/features/editor/components/project-settings-dialog.tsx \
  src/features/editor/components/properties-sidebar/index.tsx \
  src/features/editor/components/toolbar.tsx \
  src/features/editor/deps/beatvideo-music-contract.ts \
  src/features/editor/deps/effects-contract.ts \
  src/features/editor/deps/projects-contract.ts \
  src/features/effects/components/color-grade-section.tsx \
  src/features/effects/components/effects-section.tsx \
  src/features/effects/components/panels/audio-reactive-param-controls.tsx \
  src/features/effects/deps/beatvideo-contract.ts \
  src/features/effects/utils/audio-reactive-bindings.ts \
  src/features/effects/utils/audio-reactive-presets.test.ts \
  src/features/effects/utils/audio-reactive-presets.ts \
  src/features/export/utils/canvas-audio.ts \
  src/features/project-bundle/schemas/project-schema.beatvideo.test.ts \
  src/features/project-bundle/schemas/project-schema.ts \
  src/features/timeline/components/beatvideo-grid-overlay.tsx \
  src/features/timeline/components/clip-waveform/visible-waveform-canvas.test.ts \
  src/features/timeline/components/clip-waveform/visible-waveform-canvas.tsx \
  src/features/timeline/components/timeline-content.tsx \
  src/features/timeline/components/timeline-header.tsx \
  src/features/timeline/components/timeline.tsx \
  src/features/timeline/components/track-header.tsx \
  src/features/timeline/hooks/use-snap-calculator.ts \
  src/features/timeline/stores/timeline-settings-store.ts \
  src/features/timeline/utils/beatvideo-timeline-grid.ts \
  src/routes/editor/$projectId.tsx \
  src/runtime/composition-runtime/utils/preview-audio-graph.ts \
  src/shared/beatvideo/beat-reactive.test.ts \
  src/shared/beatvideo/beat-reactive.ts \
  src/shared/state/editor/store.ts \
  src/shared/utils/mastering.test.ts \
  src/shared/utils/mastering.ts \
  src/types/beatvideo.ts
RUN npx vp test run \
  src/features/timeline/components/clip-waveform/visible-waveform-canvas.test.ts \
  src/shared/beatvideo/beat-reactive.test.ts \
  src/features/effects/utils/audio-reactive-presets.test.ts \
  src/shared/utils/mastering.test.ts \
  src/features/project-bundle/schemas/project-schema.beatvideo.test.ts \
  src/features/auto-edit/spectral-transients.test.ts \
  src/features/timeline/utils/beatvideo-timeline-grid.test.ts \
  src/features/editor/stores/editor-store.test.ts
RUN npm run build

FROM nginx:alpine AS runtime
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV PORT=8080
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
