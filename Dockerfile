FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json eslint.config.mjs ./
COPY src ./src
COPY scripts ./scripts
COPY schema ./schema
# `public/` is created by `npm run build:client` (esbuild writes to public/admin.js).
# The runtime stage picks up the populated directory via `COPY --from=build`.
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
