FROM node:22-alpine AS build
ARG VITE_CMS_RESPONSIVE_WEBP_ENABLED=false
ENV VITE_CMS_RESPONSIVE_WEBP_ENABLED=${VITE_CMS_RESPONSIVE_WEBP_ENABLED}
WORKDIR /workspace
COPY ./seo ./seo
COPY ./src ./src
COPY ./public ./public
COPY ./nuxt ./nuxt
WORKDIR /workspace/nuxt
RUN npm ci --no-audit --no-fund
# Log the exact resolved Nuxt/Nitro/Rollup dependency versions inside Alpine.
# Diagnostic snapshot stays in the builder, never copied to the runtime image.
RUN node scripts/report-build-deps.mjs
RUN npm run build

FROM node:22-alpine
# The built server launches Node directly. Package managers are build-only.
# Remove the global npm installation (including its vulnerable transitive
# packages) from the final filesystem, without touching Nitro's .output.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000
WORKDIR /app
COPY --from=build /workspace/nuxt/.output ./.output
EXPOSE 3000
USER node
CMD ["node", ".output/server/index.mjs"]
