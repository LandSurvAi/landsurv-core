// services/geoAiService.ts
// Dual-mode Geospatial AI Client (SamGeo & SAM-Road)
// Supports both a Local Desktop Worker ($0 cloud cost) and Cloud Run on-demand ($0 idle cost).

import axios from 'axios';
import { withOptionalUserApiKeyHeaders } from './apiAuth';
import { segmentDrivewaysFromCanvas } from '../utils/geoRasterSegmentation';

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GeoFeatureSegmentRequest {
  featureType?: string;
  prompt?: string;
  targetLayer?: string;
  bbox?: BoundingBox;
  confidenceThreshold?: number;
  imageBase64?: string;
  imageUrls?: string[];
  imageSource?: string;
  canvas?: HTMLCanvasElement;
  controlPoints?: Array<{ easting: number; northing: number; description?: string }>;
}

export interface GeoExtractedPolygon {
  id: string;
  label: string;
  layer: string;
  confidence: number;
  coordinates: Array<{ x: number; y: number; z?: number }>;
  isClosed: boolean;
}

export interface GeoFeatureSegmentResponse {
  success: boolean;
  featureCount: number;
  targetLayer: string;
  features: GeoExtractedPolygon[];
  engine: 'local' | 'cloud' | 'cv-client';
  warnings?: string[];
}

export interface GeoRoadNetworkRequest {
  targetLayer?: string;
  bbox?: BoundingBox;
  simplifyTolerance?: number;
  imageBase64?: string;
  imageUrls?: string[];
  canvas?: HTMLCanvasElement;
}

export interface GeoExtractedRoad {
  id: string;
  layer: string;
  coordinates: Array<{ x: number; y: number; z?: number }>;
}

export interface GeoRoadNetworkResponse {
  success: boolean;
  roadSegmentCount: number;
  intersectionCount: number;
  targetLayer: string;
  roads: GeoExtractedRoad[];
  engine: 'local' | 'cloud' | 'cv-client';
  warnings?: string[];
}

export class GeoAiService {
  /**
   * Probes health of the selected engine.
   */
  async checkHealth(
    mode: 'local' | 'cloud' = 'local',
    localEndpoint = 'http://127.0.0.1:8765'
  ): Promise<{ healthy: boolean; engine: string; details?: string }> {
    if (mode === 'local') {
      try {
        const clean = localEndpoint.trim().replace(/\/+$/, '');
        const res = await axios.get(`${clean}/readyz`, { timeout: 3500 });
        return {
          healthy: res.status === 200,
          engine: res.data?.engine || 'Local SamGeo / SAM-Road Daemon',
        };
      } catch (err: any) {
        return {
          healthy: false,
          engine: 'Local Desktop Worker',
          details: err.message,
        };
      }
    } else {
      try {
        const res = await axios.get('/api/geo-ai/readyz', {
          headers: withOptionalUserApiKeyHeaders(),
          timeout: 5000,
        });
        return {
          healthy: res.status === 200,
          engine: res.data?.engine || 'Cloud Run Scale-to-Zero',
        };
      } catch (err: any) {
        return {
          healthy: false,
          engine: 'Cloud Run Engine',
          details: err.message,
        };
      }
    }
  }

  /**
   * Segments aerial imagery into vector polygon features using SamGeo.
   */
  async extractFeatures(
    req: GeoFeatureSegmentRequest,
    options: {
      mode?: 'local' | 'cloud';
      localEndpoint?: string;
      fallbackBbox?: BoundingBox;
    } = {}
  ): Promise<GeoFeatureSegmentResponse> {
    const mode = options.mode ?? 'local';
    const localEndpoint = (options.localEndpoint || 'http://127.0.0.1:8765').trim().replace(/\/+$/, '');
    const targetLayer = req.targetLayer || (req.featureType === 'building' ? 'L-BLD-AI' : 'L-DRIVEWAY');
    const prompt = req.prompt || (req.featureType === 'driveway' ? 'paved driveway, asphalt, entrance apron' : req.featureType || 'driveway');

    const bbox = req.bbox || options.fallbackBbox;
    const payload = {
      feature_type: req.featureType || 'driveway',
      prompt,
      target_layer: targetLayer,
      bbox,
      confidence_threshold: req.confidenceThreshold ?? 0.35,
      image_base64: req.imageBase64,
      image_urls: req.imageUrls,
    };

    if (mode === 'local') {
      try {
        const res = await axios.post(`${localEndpoint}/api/v1/geo-ai/segment`, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
        });
        if (res.data?.success && Array.isArray(res.data?.features) && res.data.features.length > 0) {
          return {
            success: true,
            featureCount: res.data.features.length,
            targetLayer,
            features: res.data.features,
            engine: 'local',
          };
        }
      } catch (err: any) {
        console.warn('[GeoAiService] Local daemon call failed, falling back to client-side CV:', err.message);
      }
    } else {
      try {
        const res = await axios.post('/api/geo-ai/segment', payload, {
          headers: withOptionalUserApiKeyHeaders({ 'Content-Type': 'application/json' }),
          timeout: 45000,
        });
        if (res.data?.success && Array.isArray(res.data?.features) && res.data.features.length > 0) {
          return {
            success: true,
            featureCount: res.data.features.length,
            targetLayer,
            features: res.data.features,
            engine: 'cloud',
          };
        }
      } catch (err: any) {
        console.warn('[GeoAiService] Cloud gateway call failed, falling back to client-side CV:', err.message);
      }
    }

    // Client-side computer vision fallback directly on the canvas image pixels
    if (req.canvas && bbox) {
      const cvFeatures = segmentDrivewaysFromCanvas(
        req.canvas,
        { minE: bbox.minX, maxE: bbox.maxX, minN: bbox.minY, maxN: bbox.maxY },
        { featureType: req.featureType, targetLayer, controlPoints: req.controlPoints }
      );
      if (cvFeatures.length > 0) {
        return {
          success: true,
          featureCount: cvFeatures.length,
          targetLayer,
          features: cvFeatures,
          engine: 'cv-client',
        };
      }
    }

    throw new Error(
      mode === 'local'
        ? `Local SamGeo worker is not reachable at ${localEndpoint}. Start your local daemon (python -m uvicorn ...) or check your aerial imagery.`
        : 'Cloud Geospatial AI service (Cloud Run) is currently unavailable. Please deploy the container or check your aerial imagery.'
    );
  }

  /**
   * Extracts road centerlines and intersection nodes using SAM-Road.
   */
  async extractRoadNetwork(
    req: GeoRoadNetworkRequest,
    options: {
      mode?: 'local' | 'cloud';
      localEndpoint?: string;
      fallbackBbox?: BoundingBox;
    } = {}
  ): Promise<GeoRoadNetworkResponse> {
    const mode = options.mode ?? 'local';
    const localEndpoint = (options.localEndpoint || 'http://127.0.0.1:8765').trim().replace(/\/+$/, '');
    const targetLayer = req.targetLayer || 'C-ROAD-CNTR';
    const bbox = req.bbox || options.fallbackBbox;

    const payload = {
      target_layer: targetLayer,
      bbox,
      simplify_tolerance: req.simplifyTolerance ?? 1.0,
      image_base64: req.imageBase64,
      image_urls: req.imageUrls,
    };

    if (mode === 'local') {
      try {
        const res = await axios.post(`${localEndpoint}/api/v1/geo-ai/road-network`, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
        });
        if (res.data?.success && Array.isArray(res.data?.roads) && res.data.roads.length > 0) {
          return {
            success: true,
            roadSegmentCount: res.data.roads.length,
            intersectionCount: res.data.intersectionCount ?? 1,
            targetLayer,
            roads: res.data.roads,
            engine: 'local',
          };
        }
      } catch (err: any) {
        console.warn('[GeoAiService] Local SAM-Road call failed, falling back to client-side CV:', err.message);
      }
    } else {
      try {
        const res = await axios.post('/api/geo-ai/road-network', payload, {
          headers: withOptionalUserApiKeyHeaders({ 'Content-Type': 'application/json' }),
          timeout: 45000,
        });
        if (res.data?.success && Array.isArray(res.data?.roads) && res.data.roads.length > 0) {
          return {
            success: true,
            roadSegmentCount: res.data.roads.length,
            intersectionCount: res.data.intersectionCount ?? 1,
            targetLayer,
            roads: res.data.roads,
            engine: 'cloud',
          };
        }
      } catch (err: any) {
        console.warn('[GeoAiService] Cloud SAM-Road call failed, falling back to client-side CV:', err.message);
      }
    }

    // Client-side computer vision fallback directly on the canvas image pixels
    if (req.canvas && bbox) {
      const cvFeatures = segmentDrivewaysFromCanvas(
        req.canvas,
        { minE: bbox.minX, maxE: bbox.maxX, minN: bbox.minY, maxN: bbox.maxY },
        { featureType: 'road', targetLayer }
      );
      if (cvFeatures.length > 0) {
        return {
          success: true,
          roadSegmentCount: cvFeatures.length,
          intersectionCount: 1,
          targetLayer,
          roads: cvFeatures.map((f, i) => ({
            id: `road-cl-${i + 1}`,
            layer: targetLayer,
            coordinates: f.coordinates,
          })),
          engine: 'cv-client',
        };
      }
    }

    throw new Error(
      mode === 'local'
        ? `Local SAM-Road worker is not reachable at ${localEndpoint}. Run "start-geo-ai-worker.bat" (or python -m uvicorn main:app --port 8765 inside geo-ai-service) to start your local daemon, or check your aerial imagery.`
        : 'Cloud SAM-Road service (Cloud Run) is currently unavailable. Please deploy the container or check your aerial imagery.'
    );
  }
}

export const geoAiService = new GeoAiService();
