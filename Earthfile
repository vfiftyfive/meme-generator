VERSION 0.7

# Common base for all targets
base:
    FROM alpine:latest
    WORKDIR /app

# Backend build
backend-build:
    FROM rust:1.76-slim
    WORKDIR /app
    
    # Copy Cargo files
    COPY services/backend/Cargo.toml services/backend/Cargo.lock ./
    
    # Create a dummy src/main.rs to cache dependencies
    RUN mkdir -p src && \
        echo "fn main() {}" > src/main.rs && \
        cargo build --release && \
        rm -rf src
    
    # Copy actual source code
    COPY services/backend/src ./src
    
    # Build the actual application
    RUN cargo build --release
    
    # Save the binary
    SAVE ARTIFACT target/release/meme-generator /meme-generator

# Backend Docker image
backend-docker:
    FROM debian:bullseye-slim
    WORKDIR /app
    
    # Install dependencies
    RUN apt-get update && \
        apt-get install -y --no-install-recommends ca-certificates && \
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
    FROM nginx:alpine
    WORKDIR /usr/share/nginx/html
    
    # Copy the build output from the build stage
    COPY +frontend-build/dist ./
    
    # Copy nginx configuration
    COPY services/frontend/nginx.conf /etc/nginx/conf.d/default.conf
    
    # Expose port
    EXPOSE 80
    
    # Run nginx
    CMD ["nginx", "-g", "daemon off;"]
    
    # Save the Docker image
    SAVE IMAGE meme-generator-frontend:latest
    SAVE IMAGE --push ${DOCKER_REGISTRY}/meme-generator-frontend:latest

# Build all images
all:
    BUILD +backend-docker
    BUILD +frontend-docker

# Build multi-platform images
multi:
    BUILD --platform=linux/amd64 --platform=linux/arm64 +backend-docker
    BUILD --platform=linux/amd64 --platform=linux/arm64 +frontend-docker
