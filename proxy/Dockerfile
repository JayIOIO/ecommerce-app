# Use NGINX's unprivileged image as the public reverse-proxy runtime.
FROM nginxinc/nginx-unprivileged:1.27.4-alpine

# Compose/Jenkins supplies the release tag that the proxy reports at /version.
ARG APP_VERSION=local

# Install proxy routes, replacing the version placeholder during image build.
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN sed -i "s/__APP_VERSION__/${APP_VERSION}/g" /etc/nginx/conf.d/default.conf

# Internal listening port; Compose maps the host port to this port.
EXPOSE 8080
