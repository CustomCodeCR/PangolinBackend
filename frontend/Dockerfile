FROM node:22-alpine AS build
ARG VITE_OFFICIAL_QUOTES_ENABLED=false
ARG VITE_CMS_RESPONSIVE_WEBP_ENABLED=false
ENV VITE_OFFICIAL_QUOTES_ENABLED=${VITE_OFFICIAL_QUOTES_ENABLED}
ENV VITE_CMS_RESPONSIVE_WEBP_ENABLED=${VITE_CMS_RESPONSIVE_WEBP_ENABLED}
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
