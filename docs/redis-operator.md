# Redis Operator Configuration

This document explains how Redis is deployed in the Meme Battle Royale demo using the ot-container-kit Redis Operator.

## Overview

The demo uses the [ot-container-kit Redis Operator](https://github.com/OT-CONTAINER-KIT/redis-operator) to deploy and manage Redis. This operator provides a Kubernetes-native way to deploy and manage Redis instances with features like:

- Standalone Redis instances
- Redis metrics export for Prometheus
- Custom Redis configuration via ConfigMaps
- Persistent storage for Redis data

## Configuration Details

### Redis Operator Installation

The Redis Operator is installed via Helm with custom values optimized for the demo environment:

```yaml
# Redis Operator values for Meme Battle Royale demo
redisOperator:
  name: redis-operator
  imagePullPolicy: IfNotPresent
  watchNamespace: cache
  webhook: false
  
# Resource limits suitable for minikube demo
resources:
  limits:
    cpu: 200m
    memory: 256Mi
  requests:
    cpu: 100m
    memory: 128Mi

# Single replica is sufficient for demo
replicas: 1

# Enable RBAC for operator
rbac:
  enabled: true

serviceAccount:
  automountServiceAccountToken: true
```

### Redis Instance Configuration

The Redis instance is configured using a two-part approach:

1. **ConfigMap for Redis Configuration**:
   ```yaml
   apiVersion: v1
   kind: ConfigMap
   metadata:
     name: redis-external-config
     namespace: cache
   data:
     redis-external-config: |
       maxmemory 512mb
       maxmemory-policy allkeys-lru
   ```

2. **Redis Custom Resource**:
   ```yaml
   apiVersion: redis.redis.opstreelabs.in/v1beta2
   kind: Redis
   metadata:
     name: redis
     namespace: cache
   spec:
     kubernetesConfig:
       image: redis:7.2.4-alpine
       imagePullPolicy: IfNotPresent
       resources:
         requests:
           cpu: 100m
           memory: 128Mi
         limits:
           memory: 256Mi
     storage:
       volumeClaimTemplate:
         spec:
           accessModes:
             - ReadWriteOnce
           resources:
             requests:
               storage: 1Gi
     redisExporter:
       enabled: true
       image: quay.io/opstree/redis-exporter:v1.44.0
       imagePullPolicy: IfNotPresent
       resources:
         requests:
           cpu: 50m
           memory: 64Mi
         limits:
           memory: 128Mi
     redisConfig:
       additionalRedisConfig: redis-external-config
   ```

## Important Notes

1. **ConfigMap Reference**: The Redis CR references the ConfigMap by name (`redis-external-config`) in the `redisConfig.additionalRedisConfig` field. The ConfigMap must be created before the Redis CR.

2. **API Version**: The Redis CR uses `v1beta2` API version which is the latest supported version by the operator.

3. **Resource Limits**: The Redis instance and exporter have resource limits configured to work well in a minikube environment.

4. **Metrics Export**: The Redis exporter is enabled to provide metrics for Prometheus, which can be used for monitoring and potentially for KEDA scaling.

## Accessing Redis

The Redis instance will be available at:
- Service: `redis.cache.svc.cluster.local`
- Port: `6379`

For monitoring, Redis metrics are exposed via the Redis exporter and can be accessed through Prometheus.
