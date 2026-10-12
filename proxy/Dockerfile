FROM nginxinc/nginx-unprivileged:1.27.4-alpine

ARG APP_VERSION=local

COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN sed -i "s/__APP_VERSION__/${APP_VERSION}/g" /etc/nginx/conf.d/default.conf

EXPOSE 8080
