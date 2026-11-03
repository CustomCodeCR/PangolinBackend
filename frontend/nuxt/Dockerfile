FROM node:22-alpine AS build
WORKDIR /workspace
COPY ./seo ./seo
COPY ./public ./public
COPY ./nuxt ./nuxt
WORKDIR /workspace/nuxt
RUN npm install --no-audit --no-fund
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000
WORKDIR /app
COPY --from=build /workspace/nuxt/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
