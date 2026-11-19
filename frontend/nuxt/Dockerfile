FROM node:22-alpine AS build
ARG VITE_CMS_RESPONSIVE_WEBP_ENABLED=false
ENV VITE_CMS_RESPONSIVE_WEBP_ENABLED=${VITE_CMS_RESPONSIVE_WEBP_ENABLED}
WORKDIR /workspace
COPY ./seo ./seo
COPY ./src ./src
COPY ./public ./public
COPY ./nuxt ./nuxt
WORKDIR /workspace/nuxt
RUN npm install --no-audit --no-fund
# Log the exact resolved Nuxt/Nitro/Rollup dependency versions inside Alpine.
# Diagnostic snapshot stays in the builder, never copied to the runtime image.
RUN node scripts/report-build-deps.mjs
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000
WORKDIR /app
COPY --from=build /workspace/nuxt/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
