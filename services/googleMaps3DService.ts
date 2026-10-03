/**
 * Google Maps 3D Integration Service
 * 
 * Provides 3D map visualization using Google Maps API
 * Integrates satellite imagery, terrain, and street view data
 * Creates 3D meshes from elevation data
 */

import * as BABYLON from '@babylonjs/core';
import { GeoLocation, TerrainData } from './geolocationService';

export interface MapMeshOptions {
  resolution?: number; // 1 = 1m per vertex, 10 = 10m per vertex
  scale?: number; // Height exaggeration factor
  textureUrl?: string;
}

export interface StreetViewMeta {
  heading: number;
  pitch: number;
  zoom: number;
  fov: number;
}

/**
 * Google Maps 3D Service for AR visualization
 */
export class GoogleMaps3DService {
  private googleMapsApiKey: string;
  private scene: BABYLON.Scene;
  private meshCache: Map<string, BABYLON.Mesh> = new Map();
  private textureCache: Map<string, BABYLON.Texture> = new Map();

  constructor(scene: BABYLON.Scene, googleMapsApiKey: string) {
    this.scene = scene;
    this.googleMapsApiKey = googleMapsApiKey;
  }

  /**
   * Load satellite imagery as texture
   */
  async loadSatelliteImagery(
    latitude: number,
    longitude: number,
    zoom: number = 18
  ): Promise<BABYLON.Texture> {
    const cacheKey = `satellite_${latitude.toFixed(4)}_${longitude.toFixed(4)}_${zoom}`;

    if (this.textureCache.has(cacheKey)) {
      return this.textureCache.get(cacheKey)!;
    }

    try {
      const width = 512;
      const height = 512;
      const url = `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=${zoom}&size=${width}x${height}&scale=2&maptype=satellite&key=${this.googleMapsApiKey}`;

      const texture = new BABYLON.DynamicTexture('satelliteTexture', 512, this.scene);
      
      // Create a temporary image to load the satellite data
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          const ctx = texture.getContext();
          ctx.drawImage(img, 0, 0, 512, 512);
          texture.update();
          resolve();
        };
        img.onerror = () => reject(new Error('Failed to load satellite image'));
        img.src = url;
      });

      this.textureCache.set(cacheKey, texture);
      return texture;
    } catch (error) {
      console.error('Error loading satellite imagery:', error);
      throw error;
    }
  }

  /**
   * Load street view panorama as cube texture
   */
  async loadStreetViewPanorama(
    latitude: number,
    longitude: number,
    metadata?: StreetViewMeta
  ): Promise<BABYLON.CubeTexture | null> {
    try {
      // Get street view metadata first
      const metaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${latitude},${longitude}&key=${this.googleMapsApiKey}`;
      const metaResponse = await fetch(metaUrl);
      const metaData = await metaResponse.json();

      if (metaData.status !== 'OK') {
        console.warn('Street view not available for this location');
        return null;
      }

      // Load street view images (would need to be panorama split into 6 faces for cube texture)
      const heading = metadata?.heading ?? 0;
      const pitch = metadata?.pitch ?? 0;
      const fov = metadata?.fov ?? 90;

      // For now, return null - full implementation would need to generate cube faces
      console.log('Street view available:', { heading, pitch, fov });
      return null;
    } catch (error) {
      console.error('Error loading street view:', error);
      return null;
    }
  }

  /**
   * Create terrain mesh from elevation data
   */
  async createTerrainMesh(
    latitude: number,
    longitude: number,
    terrainData: TerrainData,
    options: MapMeshOptions = {}
  ): Promise<BABYLON.Mesh> {
    const resolution = options.resolution ?? 10; // 10m per vertex
    const scale = options.scale ?? 2; // 2x height exaggeration
    const size = 1000; // 1km x 1km area

    const cacheKey = `terrain_${latitude.toFixed(3)}_${longitude.toFixed(3)}_${resolution}`;

    if (this.meshCache.has(cacheKey)) {
      return this.meshCache.get(cacheKey)!;
    }

    try {
      // Create ground mesh using height data
      const subdivisions = Math.floor(size / resolution);
      
      const ground = BABYLON.MeshBuilder.CreateGround('terrain', {
        width: size,
        height: size,
        subdivisions: subdivisions,
      }, this.scene);

      // Apply height variation based on elevation data
      const positions = ground.getVertices();
      const data = ground.getVerticesData(BABYLON.VertexBuffer.PositionKind);

      if (data) {
        for (let i = 0; i < data.length; i += 3) {
          const x = data[i];
          const z = data[i + 2];
          
          // Calculate height using nearby terrain data
          const height = terrainData.elevation;
          
          // Add some variation based on distance from center
          const distance = Math.sqrt(x * x + z * z);
          const variation = Math.sin(distance / 100) * 10 * scale;
          
          data[i + 1] = height + variation;
        }

        ground.updateVerticesData(BABYLON.VertexBuffer.PositionKind, data);
      }

      // Apply texture
      if (options.textureUrl) {
        try {
          const texture = new BABYLON.Texture(options.textureUrl, this.scene);
          const material = new BABYLON.StandardMaterial('terrainMaterial', this.scene);
          material.diffuseTexture = texture;
          material.backFaceCulling = false;
          ground.material = material;
        } catch (err) {
          console.warn('Error applying terrain texture:', err);
        }
      } else {
        // Use satellite imagery as texture
        try {
          const satTexture = await this.loadSatelliteImagery(latitude, longitude);
          const material = new BABYLON.StandardMaterial('terrainMaterial', this.scene);
          material.diffuseTexture = satTexture;
          material.backFaceCulling = false;
          ground.material = material;
        } catch (err) {
          console.warn('Error loading satellite texture:', err);
        }
      }

      this.meshCache.set(cacheKey, ground);
      return ground;
    } catch (error) {
      console.error('Error creating terrain mesh:', error);
      throw error;
    }
  }

  /**
   * Create building outlines from map data
   */
  async createBuildingOutlines(
    latitude: number,
    longitude: number
  ): Promise<BABYLON.Mesh[]> {
    try {
      // This would use Google Maps API to get building footprints
      // For now, we create placeholder buildings
      const buildings: BABYLON.Mesh[] = [];

      // Create sample buildings around the area
      for (let i = 0; i < 3; i++) {
        const x = (Math.random() - 0.5) * 500;
        const z = (Math.random() - 0.5) * 500;
        const width = Math.random() * 50 + 20;
        const length = Math.random() * 50 + 20;
        const height = Math.random() * 30 + 15;

        const building = BABYLON.MeshBuilder.CreateBox(`building_${i}`, {
          width,
          height,
          depth: length,
        }, this.scene);

        building.position = new BABYLON.Vector3(x, height / 2, z);

        const material = new BABYLON.StandardMaterial(`buildingMat_${i}`, this.scene);
        material.diffuse = new BABYLON.Color3(0.7, 0.7, 0.8);
        material.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.12);
        building.material = material;

        buildings.push(building);
      }

      return buildings;
    } catch (error) {
      console.error('Error creating building outlines:', error);
      throw error;
    }
  }

  /**
   * Create navigation path on map
   */
  createNavigationPath(
    points: BABYLON.Vector3[],
    color: BABYLON.Color3 = BABYLON.Color3.Green()
  ): BABYLON.Tube {
    const tube = BABYLON.MeshBuilder.CreateTube('navPath', {
      path: points,
      radius: 5,
      updatable: false,
    }, this.scene);

    const material = new BABYLON.StandardMaterial('pathMaterial', this.scene);
    material.emissiveColor = color;
    material.alpha = 0.8;
    tube.material = material;

    return tube;
  }

  /**
   * Create distance/measurement visualization
   */
  createMeasurement(
    startPos: BABYLON.Vector3,
    endPos: BABYLON.Vector3,
    label?: string
  ): BABYLON.Mesh {
    const distance = BABYLON.Vector3.Distance(startPos, endPos);
    const midpoint = BABYLON.Vector3.Lerp(startPos, endPos, 0.5);

    // Create line
    const line = BABYLON.MeshBuilder.CreateTube('measurement', {
      path: [startPos, endPos],
      radius: 2,
    }, this.scene);

    const lineMaterial = new BABYLON.StandardMaterial('measurementMat', this.scene);
    lineMaterial.emissiveColor = new BABYLON.Color3(1, 0.8, 0);
    line.material = lineMaterial;

    // Store metadata
    (line as any).distance = distance;
    (line as any).label = label || `${distance.toFixed(2)}m`;

    return line;
  }

  /**
   * Load address and get coordinates
   */
  async geocodeAddress(address: string): Promise<GeoLocation> {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${this.googleMapsApiKey}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.results && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        return {
          latitude: location.lat,
          longitude: location.lng,
        };
      }

      throw new Error('Address not found');
    } catch (error) {
      console.error('Error geocoding address:', error);
      throw error;
    }
  }

  /**
   * Get reverse geocode (coordinates to address)
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<string> {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${this.googleMapsApiKey}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.results && data.results.length > 0) {
        return data.results[0].formatted_address;
      }

      throw new Error('Address not found');
    } catch (error) {
      console.error('Error reverse geocoding:', error);
      throw error;
    }
  }

  /**
   * Search nearby places
   */
  async searchNearbyPlaces(
    latitude: number,
    longitude: number,
    type: string = 'restaurant',
    radius: number = 1000
  ): Promise<any[]> {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&type=${type}&key=${this.googleMapsApiKey}`;
      const response = await fetch(url);
      const data = await response.json();

      return data.results || [];
    } catch (error) {
      console.error('Error searching nearby places:', error);
      return [];
    }
  }

  /**
   * Clear mesh cache
   */
  clearMeshCache(): void {
    this.meshCache.forEach(mesh => mesh.dispose());
    this.meshCache.clear();
  }

  /**
   * Clear texture cache
   */
  clearTextureCache(): void {
    this.textureCache.forEach(texture => texture.dispose());
    this.textureCache.clear();
  }

  /**
   * Cleanup all resources
   */
  dispose(): void {
    this.clearMeshCache();
    this.clearTextureCache();
  }
}

export default GoogleMaps3DService;
