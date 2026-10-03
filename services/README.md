# GNSS/RINEX Processing Services

Complete microservice architecture for GNSS post-processing with RINEX file support.

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Start all services
docker-compose -f docker-compose.gnss.yml up -d

# View logs
docker-compose -f docker-compose.gnss.yml logs -f

# Stop services
docker-compose -f docker-compose.gnss.yml down
```

Services will be available at:
- **API Gateway**: http://localhost:3000
- **Worker**: http://localhost:3001
- **Redis**: localhost:6379
- **Redis Commander**: http://localhost:8081 (debug, use `--profile debug`)

### Local Development

**API Gateway:**
```bash
cd services/gnss-api
npm install
npm run dev
```

**Worker:**
```bash
cd services/gnss-worker
pip install -r requirements.txt
python app.py
```

**Frontend:**
```bash
npm install
npm run dev
```

## Services Overview

### API Gateway (Node.js)
REST API server handling job submissions and result retrieval.

**Location**: `services/gnss-api/`  
**Port**: 3000  
**Language**: TypeScript + Node.js + Express  

**Key Endpoints**:
- `POST /api/v1/gnss/jobs` - Submit RINEX job
- `GET /api/v1/gnss/jobs/:jobId` - Get job status
- `GET /api/v1/gnss/jobs/:jobId/results` - Retrieve results
- `DELETE /api/v1/gnss/jobs/:jobId` - Cancel job
- `GET /api/v1/gnss/health` - Health check

**Environment Variables**:
```
PORT=3000
REDIS_URL=redis://redis:6379
WORKER_URL=http://gnss-worker:3001
UPLOAD_DIR=/data/uploads
RESULTS_DIR=/data/results
NODE_ENV=production
```

### GNSS Worker (Python)
Processing service for RINEX file parsing and positioning calculations.

**Location**: `services/gnss-worker/`  
**Port**: 3001  
**Language**: Python 3.11 + Flask  

**Key Endpoints**:
- `POST /api/process` - Process a job
- `GET /api/health` - Health check
- `POST /api/validate-rinex` - Validate RINEX file

**Environment Variables**:
```
PORT=3001
DATA_PATH=/data
RTKLIB_PATH=/usr/local/rtklib
FLASK_ENV=production
PYTHONUNBUFFERED=1
```

### Redis
In-memory data store for job queue and state management.

**Location**: Containerized  
**Port**: 6379  
**Image**: redis:7-alpine  

**Purpose**:
- Job queue management
- Job status tracking
- Results caching
- Session storage

## API Specification

### Submit Job

```bash
curl -X POST http://localhost:3000/api/v1/gnss/jobs \
  -F "rinexFile=@observation.20o" \
  -F "referenceFile=@reference.20o" \
  -F 'processingConfig={
    "mode": "rtk",
    "constellations": ["gps", "galileo"],
    "outputFormat": "llh",
    "ionosphereModel": "broadcast",
    "troposphereModel": "saastammoinen"
  }'
```

**Response** (202 Accepted):
```json
{
  "jobId": "job_20251114_abc123xyz",
  "status": "pending",
  "createdAt": "2025-11-14T23:15:30Z",
  "estimatedDuration": 180,
  "statusUrl": "/api/v1/gnss/jobs/job_20251114_abc123xyz"
}
```

### Check Status

```bash
curl http://localhost:3000/api/v1/gnss/jobs/job_20251114_abc123xyz
```

**Response** (200 OK):
```json
{
  "jobId": "job_20251114_abc123xyz",
  "status": "processing",
  "progress": 45,
  "currentStep": "Signal processing",
  "createdAt": "2025-11-14T23:15:30Z",
  "startedAt": "2025-11-14T23:15:35Z"
}
```

### Get Results

```bash
curl "http://localhost:3000/api/v1/gnss/jobs/job_20251114_abc123xyz/results?format=geojson"
```

**Response** (200 OK):
```json
{
  "jobId": "job_20251114_abc123xyz",
  "completedAt": "2025-11-14T23:17:30Z",
  "processingDuration": 235,
  "statistics": {
    "pointsProcessed": 1240,
    "pdop": 2.5,
    "horizontalRMS": 0.045,
    "verticalRMS": 0.067
  },
  "results": [
    {
      "type": "Feature",
      "geometry": {"type": "Point", "coordinates": [-120.345678, 38.123456]},
      "properties": {...}
    }
  ]
}
```

## Frontend Integration

The React frontend uses `services/gnssProcessingService.ts` to interact with the backend:

```typescript
import gnssService from '../services/gnssProcessingService.ts';

// Submit job
const response = await gnssService.submitGNSSJob({
  rinexFile: file,
  config: processingConfig
}, onProgress);

// Poll for results
const status = await gnssService.pollJobStatus(
  response.jobId,
  onProgress
);

// Get results
const results = await gnssService.getJobResults(response.jobId, 'geojson');
```

## Configuration

### Docker Compose Variables

Edit `docker-compose.gnss.yml` to customize:

```yaml
services:
  gnss-api:
    environment:
      NODE_ENV: production
      # Customize as needed
```

### Docker Resource Limits

```yaml
services:
  gnss-api:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

## Monitoring

### Health Checks

Each service includes health check endpoints:

```bash
# API Gateway
curl http://localhost:3000/api/v1/gnss/health

# Worker
curl http://localhost:3001/api/health
```

### Redis Commander

For debugging Redis, start with debug profile:

```bash
docker-compose -f docker-compose.gnss.yml --profile debug up
```

Then visit http://localhost:8081

### Logs

View service logs:

```bash
# All services
docker-compose -f docker-compose.gnss.yml logs

# Specific service
docker-compose -f docker-compose.gnss.yml logs gnss-api
docker-compose -f docker-compose.gnss.yml logs gnss-worker

# Follow logs
docker-compose -f docker-compose.gnss.yml logs -f
```

## Development

### Building Images Locally

```bash
# Build API Gateway
docker build -t gnss-api:latest ./services/gnss-api

# Build Worker
docker build -t gnss-worker:latest ./services/gnss-worker

# Push to registry
docker tag gnss-api:latest your-registry/gnss-api:latest
docker push your-registry/gnss-api:latest
```

### Running Tests

**API Gateway:**
```bash
cd services/gnss-api
npm test
```

**Worker:**
```bash
cd services/gnss-worker
pytest tests/
```

### Code Formatting

**API Gateway:**
```bash
cd services/gnss-api
npm run lint
npm run lint:fix
```

## Troubleshooting

### API Gateway not responding

1. Check if service is running: `docker-compose logs gnss-api`
2. Verify Redis connection: `docker-compose logs gnss-api | grep -i redis`
3. Check port 3000 is available: `lsof -i :3000`

### Worker not processing jobs

1. Check worker logs: `docker-compose logs gnss-worker`
2. Verify Redis connection: `redis-cli ping`
3. Check file permissions: `ls -la /data/uploads`

### Jobs stuck in "processing"

1. Check worker status: `curl http://localhost:3001/api/health`
2. Restart worker: `docker-compose restart gnss-worker`
3. Check Redis: `redis-cli KEYS "job:*"`

### "Cannot connect to Redis"

1. Verify Redis container is running: `docker-compose ps`
2. Check Redis logs: `docker-compose logs redis`
3. Test Redis connection: `redis-cli -h 127.0.0.1 ping`

## Production Deployment

### Prerequisites

- Docker and Docker Compose
- PostgreSQL (for job persistence)
- SSL certificates
- DNS configured

### Deployment Steps

1. **Prepare Environment**
```bash
cp docker-compose.gnss.yml docker-compose.prod.yml
# Edit docker-compose.prod.yml for production settings
```

2. **Build and Push Images**
```bash
docker build -t your-registry/gnss-api:v1.0 ./services/gnss-api
docker build -t your-registry/gnss-worker:v1.0 ./services/gnss-worker
docker push your-registry/gnss-api:v1.0
docker push your-registry/gnss-worker:v1.0
```

3. **Configure Secrets**
```bash
# Create .env.prod
echo "REDIS_PASSWORD=secure-password" > .env.prod
echo "API_KEY=secret-key" >> .env.prod
```

4. **Deploy**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Monitoring

- Set up Prometheus for metrics
- Configure Grafana dashboards
- Enable centralized logging (ELK stack)
- Set up alerting for critical issues

## Performance Tuning

### Redis Configuration

```bash
# Increase max memory
docker exec gnss-redis redis-cli CONFIG SET maxmemory 2gb
docker exec gnss-redis redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### Worker Optimization

```dockerfile
# In Dockerfile, optimize Python
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONOPTIMIZE=2
```

### API Gateway Tuning

```javascript
// In app.ts
const cluster = require('cluster');
if (cluster.isMaster) {
  // Spawn workers = CPU count
}
```

## Support

For issues or questions:

1. Check logs: `docker-compose logs`
2. Review documentation: See [BACKEND_SERVICES_ARCHITECTURE.md](../BACKEND_SERVICES_ARCHITECTURE.md)
3. Check status: Visit http://localhost:3000/api/v1/gnss/health

## License

Same as LandSurv.ai main project
