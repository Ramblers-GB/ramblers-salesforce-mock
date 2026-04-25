FROM node:20-alpine AS build
WORKDIR /app
# git is needed at build time so `npm run build:release-notes` can snapshot
# git log into dist/build-info.json. The runtime image does not need git.
RUN apk add --no-cache git
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
# .git is required only by the release-notes build step. If a CI build doesn't
# include it, the script falls back to an empty entries array.
COPY .git ./.git
RUN npm run build

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
