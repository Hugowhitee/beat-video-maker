FROM node:22-alpine AS build
WORKDIR /app

# Vite+ runs git-aware setup during npm prepare.
RUN apk add --no-cache git

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run check
RUN npm run check:boundaries
RUN npm run check:deps-contracts
RUN npx vp test run \
  src/shared/beatvideo/beat-reactive.test.ts \
  src/features/timeline/utils/beatvideo-timeline-grid.test.ts \
  src/features/editor/utils/producer-tag.test.ts \
  src/features/effects/utils/audio-reactive-presets.test.ts \
  src/features/effects/components/effects-section.test.tsx \
  src/features/timeline/stores/actions/effect-actions.test.ts \
  src/features/timeline/components/clip-waveform/visible-waveform-canvas.test.ts \
  src/features/timeline/components/track-header.test.tsx \
  src/features/timeline/components/timeline-header.test.tsx \
  src/shared/utils/mastering.test.ts
RUN npm run build

FROM nginx:alpine AS runtime

COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

ENV PORT=8080
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
