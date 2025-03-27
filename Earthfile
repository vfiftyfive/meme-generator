VERSION 0.7

# Backend build
backend-build:
    FROM rust:1.85-slim
    WORKDIR /app
    
    # Install build dependencies
    RUN apt-get update && \
        apt-get install -y --no-install-recommends \
        pkg-config \
        libssl-dev \
        build-essential \
        git \
        ca-certificates && \
        rm -rf /var/lib/apt/lists/*
    
    # Use pkg-config to find OpenSSL instead of environment variables
    ENV OPENSSL_NO_VENDOR=1 \
        PKG_CONFIG_ALLOW_CROSS=1 \
        RUSTFLAGS="-C target-feature=-crt-static"
    
    # Copy source code
    COPY services/backend ./
    
    # Update dependencies and build with release profile
    RUN cargo update && \
        cargo build --release
    
    # Save the binary
    SAVE ARTIFACT target/release/meme-generator /meme-generator

# Backend Docker image
backend-docker:
    ARG DOCKER_REGISTRY
    FROM debian:bookworm-slim
    WORKDIR /app
    
    # Install runtime dependencies
    RUN apt-get update && \
        apt-get install -y --no-install-recommends \
        ca-certificates \
        libssl3 \
        curl && \
        rm -rf /var/lib/apt/lists/*
    
    # Copy the binary from the build stage
    COPY +backend-build/meme-generator ./meme-generator
    
    # Set executable permissions
    RUN chmod +x ./meme-generator
    
    # Expose metrics port
    EXPOSE 9090
    
    # Run the application
    CMD ["./meme-generator"]
    
    # Save the Docker image
    SAVE IMAGE meme-generator:latest
    SAVE IMAGE --push ${DOCKER_REGISTRY}/meme-generator:latest

# Frontend build
frontend-build:
    FROM node:18-alpine
    WORKDIR /app
    
    # Copy package files
    COPY services/frontend/frontend/package*.json ./
    
    # Install dependencies
    RUN npm ci
    
    # Copy source code
    COPY services/frontend/frontend/ ./
    
    # Build the application
    RUN npm run build
    
    # Save the build artifacts
    SAVE ARTIFACT dist /dist

# Frontend Docker image
frontend-docker:
    ARG DOCKER_REGISTRY
    FROM nginx:alpine
    WORKDIR /usr/share/nginx/html
    
    # Install gettext for envsubst
    RUN apk add --no-cache gettext
    
    # Copy the build output from the build stage
    COPY +frontend-build/dist ./
    
    # Copy nginx configuration
    COPY services/frontend/nginx.conf /etc/nginx/conf.d/default.conf
    
    # Copy config.js template and entrypoint script
    COPY services/frontend/frontend/public/config.js ./config.js.template
    COPY services/frontend/entrypoint.sh /entrypoint.sh
    RUN chmod +x /entrypoint.sh
    
    # Expose port
    EXPOSE 80
    
    # Use entrypoint script instead of direct nginx command
    CMD ["/entrypoint.sh"]
    
    # Save the Docker image
    SAVE IMAGE meme-generator-frontend:latest
    SAVE IMAGE --push ${DOCKER_REGISTRY}/meme-generator-frontend:latest

# Build all images
all:
    BUILD +backend-docker
    BUILD +frontend-docker

# Build multi-platform backend image
multi-backend:
    BUILD --platform=linux/amd64 --platform=linux/arm64 +backend-docker

# Build multi-platform frontend image
multi-frontend:
    BUILD --platform=linux/amd64 --platform=linux/arm64 +frontend-docker

# Build all multi-platform images
multi:
    BUILD +multi-backend
    BUILD +multi-frontend
