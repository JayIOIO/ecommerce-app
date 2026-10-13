# Use a fixed Node/Alpine base for a repeatable runtime.
FROM node:22.14.0-alpine3.21

# Keep application files together in the container.
WORKDIR /app

# Copy lockfiles first so dependency installation can use Docker layer caching.
COPY package*.json ./
# Runtime image needs production dependencies only.
RUN npm ci --omit=dev

# Copy the service entry point and give it to the unprivileged Node user.
COPY --chown=node:node server.js ./

# Avoid running the API process as root.
USER node

# Document the internal API port; Compose controls host publishing separately.
EXPOSE 4003
# Start the order service using its package.json start script.
CMD ["npm", "start"]
