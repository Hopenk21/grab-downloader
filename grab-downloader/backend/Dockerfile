FROM node:20-slim

# Install system deps: ffmpeg, python3, pip
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    --no-install-recommends \
  && pip3 install yt-dlp --break-system-packages \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node deps
COPY package*.json ./
RUN npm install --omit=dev

# Copy source
COPY server.js ./

# Downloads folder
RUN mkdir -p downloads

EXPOSE 3001

CMD ["node", "server.js"]
