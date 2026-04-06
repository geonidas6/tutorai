FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install qwen-code CLI globally
RUN npm install -g @qwen-code/qwen-code@latest

# Prepare app directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install app dependencies
RUN npm install

# Copy app source
COPY . .

# Ensure .qwen directory exists for volume mounting
RUN mkdir -p /root/.qwen

# Expose the app port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the server
CMD ["npm", "start"]
