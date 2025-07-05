# Setup Instructions for Meme Generator

## 1. Add hosts entry (required for ingress)

Run this command:
```bash
sudo sh -c 'echo "192.168.49.2 meme-generator.local nats.meme-generator.local" >> /etc/hosts'
```

## 2. Test Options

### Option A: Use ingress URLs (recommended)
1. Open http://meme-generator.local in your browser
2. The frontend will connect to ws://nats.meme-generator.local for WebSocket

### Option B: Use localhost with manual config override
1. Open the browser console
2. Run: `window.RUNTIME_CONFIG = { NATS_URL: "ws://nats.meme-generator.local" }`
3. Refresh the page
4. The frontend will now use the ingress URL for WebSocket

### Option C: Test WebSocket directly
Open `test-ingress-websocket.html` in your browser to test both connection methods

## Current Issue
The WebSocket connection through port forwarding seems to have handshake issues. Using the ingress URL should work better.
