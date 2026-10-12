FROM node:22.14.0-alpine3.21

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node server.js ./

USER node

EXPOSE 4001
CMD ["npm", "start"]
