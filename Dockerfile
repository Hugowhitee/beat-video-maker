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
  src/features/editor/utils/beat-grid-focus.test.ts \
  src/features/timeline/components/timeline-content.test.tsx \
  src/features/auto-edit/beat-grid-fit.test.ts \
  src/features/timeline/utils/beatvideo-timeline-grid.test.ts
RUN npm run build

FROM nginx:alpine AS runtime

COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

ENV PORT=8080
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
