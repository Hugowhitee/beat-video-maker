FROM node:22-alpine AS build
WORKDIR /app

RUN apk add --no-cache git

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .

RUN npx vp check
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
