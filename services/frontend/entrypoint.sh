#!/bin/sh

# Generate dynamic config.js with environment variables
cat > /usr/share/nginx/html/config.js << EOF
window.RUNTIME_CONFIG = {
  NATS_URL: "${VITE_NATS_URL}",
  REQUEST_SUBJECT: "${VITE_REQUEST_SUBJECT}",
  RESPONSE_SUBJECT: "${VITE_RESPONSE_SUBJECT}"
};
EOF

# Start nginx
nginx -g "daemon off;"
