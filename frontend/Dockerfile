# Stage 1: use Node to install dependencies, lint, and compile the React/Vite app.
FROM node:22.14.0-alpine3.21 AS build

WORKDIR /app

# Copy manifests first to reuse the dependency layer when only source changes.
COPY package*.json ./
RUN npm ci

# Copy frontend source and create production static files.
COPY . .
RUN npm run lint && npm run build

# Stage 2: serve only the compiled site with a small unprivileged NGINX image.
FROM nginxinc/nginx-unprivileged:1.27.4-alpine

# Configure static-file serving and copy the output from the build stage.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Internal web port used by the proxy; this instruction alone does not publish it.
EXPOSE 8080
