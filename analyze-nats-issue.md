# NATS Issue Analysis

## Problem
- Frontend publishes messages via WebSocket to NATS
- Backend shows 200 pending messages in JetStream
- Consumer is not receiving any messages (only timeouts)

## Root Cause
Messages published via NATS WebSocket go to **Core NATS** by default, not JetStream. The backend consumer is listening to JetStream, which is why it's not receiving messages.

## Solution Options

### Option 1: Use Core NATS in Backend (Simpler)
Change backend to use core NATS subscriptions instead of JetStream

### Option 2: Configure JetStream Publishing (Better for production)
Frontend needs to publish to JetStream properly

## Current Flow
1. Frontend connects via WebSocket ✓
2. Frontend publishes to `meme.request` (Core NATS) ✓
3. Backend listens to JetStream consumer ✓
4. Messages never reach JetStream ❌

## Fix
The backend needs to either:
- Subscribe to Core NATS directly, OR
- The frontend needs to publish to JetStream

For immediate fix, let's use Core NATS in the backend.