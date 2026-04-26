FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json eslint.config.mjs ./
COPY src ./src
COPY scripts ./scripts
COPY schema ./schema
# public/ carries static assets (admin.html/css/brand); `npm run build:client`
# adds admin.js/.map. The runtime stage picks up the populated directory via
# `COPY --from=build`.
COPY public ./public
RUN npm run build
# Release notes are baked on the host by `npm run predeploy` (full git
# history) and shipped in via the build context. Fly's remote builder
# receives a shallow .git, so generating them inside this stage would
# yield only the latest commit.
COPY dist/build-info.json ./dist/build-info.json

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/schema ./schema
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 8080
CMD ["node", "dist/server.js"]
