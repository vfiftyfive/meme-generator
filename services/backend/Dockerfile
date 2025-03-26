FROM rust:1.76 as builder

WORKDIR /usr/src/app
COPY . .

# Build with release optimizations
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /usr/src/app/target/release/meme-generator /app/meme-generator

# Run as non-root user
RUN useradd -m appuser
USER appuser

# Expose metrics port
EXPOSE 9090

# Command to run
CMD ["./meme-generator"]
