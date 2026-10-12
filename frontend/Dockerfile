FROM node:22.14.0-alpine3.21 AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run lint && npm run build

FROM nginxinc/nginx-unprivileged:1.27.4-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
