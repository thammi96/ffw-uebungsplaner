FROM node:20-slim

# Install system dependencies needed for compiling better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency configs
COPY package*.json ./

# Install only production dependencies
# This runs npm ci for robust build caching
RUN npm ci --only=production

# Copy application sources
COPY . .

# Ensure data folder exists for volume mounting
RUN mkdir -p /app/data

# Environment configuration defaults
ENV PORT=3001
ENV NODE_ENV=production
ENV DB_PATH=/app/data/database.sqlite

# Open listening port
EXPOSE 3001

# Start app
CMD ["node", "src/server.js"]
