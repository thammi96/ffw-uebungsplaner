FROM node:20-slim

# Install system dependencies needed for compiling better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Give the node user ownership of the working directory upfront
RUN chown node:node /app

# Switch to non-root user BEFORE installing dependencies
# → npm ci runs as node, so all node_modules files are already owned by node
#   No expensive "chown -R" pass needed afterwards!
USER node

# Copy dependency configs (already owned by node via --chown)
COPY --chown=node:node package*.json ./

# Install production dependencies as the node user
RUN npm ci --omit=dev

# Copy application sources
COPY --chown=node:node . .

# Create data directory (already running as node, no chown needed)
RUN mkdir -p /app/data

# Environment configuration defaults
ENV PORT=3001
ENV NODE_ENV=production
ENV DB_PATH=/app/data/database.sqlite

# Open listening port
EXPOSE 3001

# Start app
CMD ["node", "src/server.js"]
