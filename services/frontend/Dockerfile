# Build stage
FROM node:18-alpine as build

WORKDIR /app

# Copy package.json and package-lock.json
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY frontend/ ./

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Install gettext package (for envsubst command)
RUN apk add --no-cache gettext

# Copy the build output to nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the template for the runtime config
COPY frontend/public/config.js /usr/share/nginx/html/config.js.template

# Copy the entrypoint script from the host
COPY entrypoint.sh /entrypoint.sh

# Make the entrypoint script executable
RUN chmod +x /entrypoint.sh

# Expose port
EXPOSE 80

# Command to run
CMD ["/entrypoint.sh"]
