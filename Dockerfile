FROM node:20-slim

# Install system dependencies needed for compiling better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency configs and set ownership
COPY --chown=node:node package*.json ./

# Install only production dependencies (runs under root for system build tools access, then we chown)
RUN npm ci --only=production

# Copy application sources with node ownership
COPY --chown=node:node . .

# Ensure data folder exists and the whole app dir is owned by node user
RUN mkdir -p /app/data && chown -R node:node /app

# Switch to non-root 'node' user
USER node

# Environment configuration defaults
ENV PORT=3001
ENV NODE_ENV=production
ENV DB_PATH=/app/data/database.sqlite

# Open listening port
EXPOSE 3001

# Start app
CMD ["node", "src/server.js"]
