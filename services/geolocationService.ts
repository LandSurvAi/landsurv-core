/**
 * Geolocation Service
 * 
 * Provides location awareness for AR experience
 * Integrates with Google Maps for elevation and terrain data
 * Manages real-time position tracking and map context
 */

import * as BABYLON from '@babylonjs/core';

export interface GeoLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  heading?: number;
}

export interface TerrainData {
  elevation: number;
  terrainType: string;
  nearby: {
    latitude: number;
    longitude: number;
    elevation: number;
    distance: number;
  }[];
}

export interface MapTileData {
  url: string;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

/**
 * GeolocationService manages location awareness for AR
 */
export class GeolocationService {
  private currentLocation: GeoLocation | null = null;
  private watchId: number | null = null;
  private locationCallbacks: ((location: GeoLocation) => void)[] = [];
  private googleMapsApiKey: string;
  private terrainCache: Map<string, TerrainData> = new Map();
  private isHighAccuracyMode = false;

  constructor(googleMapsApiKey: string, highAccuracy = false) {
    this.googleMapsApiKey = googleMapsApiKey;
    this.isHighAccuracyMode = highAccuracy;
  }

  /**
   * Start tracking user's real-time location
   */
  async startTracking(): Promise<void> {
    if (!navigator.geolocation) {
      throw new Error('Geolocation API not available');
    }

    return new Promise((resolve, reject) => {
      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          this.currentLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            altitude: position.coords.altitude ?? undefined,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading ?? undefined,
          };

          // Notify all listeners
          this.locationCallbacks.forEach(callback => callback(this.currentLocation!));
        },
        (error) => {
          console.error('Geolocation error:', error);
          reject(new Error(`Geolocation error: ${error.message}`));
        },
        {
          enableHighAccuracy: this.isHighAccuracyMode,
          maximumAge: 0,
          timeout: 5000,
        }
      );

      resolve();
    });
  }

  /**
   * Stop tracking location
   */
  stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  /**
   * Get current location (one-time)
   */
  async getCurrentLocation(): Promise<GeoLocation> {
    if (!navigator.geolocation) {
      throw new Error('Geolocation API not available');
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location: GeoLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            altitude: position.coords.altitude ?? undefined,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading ?? undefined,
          };
          this.currentLocation = location;
          resolve(location);
        },
        reject,
        {
          enableHighAccuracy: this.isHighAccuracyMode,
          timeout: 5000,
          maximumAge: 0,
        }
      );
    });
  }

  /**
   * Register callback for location updates
   */
  onLocationChange(callback: (location: GeoLocation) => void): void {
    this.locationCallbacks.push(callback);
  }

  /**
   * Get current location
   */
  getLocation(): GeoLocation | null {
    return this.currentLocation;
  }

  /**
   * Get elevation data from Google Maps Elevation API
   */
  async getElevation(latitude: number, longitude: number): Promise<number> {
    const cacheKey = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;

    // Check cache first
    if (this.terrainCache.has(cacheKey)) {
      const cached = this.terrainCache.get(cacheKey)!;
      return cached.elevation;
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${latitude},${longitude}&key=${this.googleMapsApiKey}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.results && data.results.length > 0) {
        const elevation = data.results[0].elevation;
        
        // Cache the result
        this.terrainCache.set(cacheKey, {
          elevation,
          terrainType: 'google-maps',
          nearby: [],
        });

        return elevation;
      }

      throw new Error('No elevation data received');
    } catch (error) {
      console.error('Error fetching elevation:', error);
      throw error;
    }
  }

  /**
   * Get terrain data for a region
   */
  async getTerrainData(
    latitude: number,
    longitude: number,
    radiusMeters: number = 100
  ): Promise<TerrainData> {
    const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)},${radiusMeters}`;

    if (this.terrainCache.has(cacheKey)) {
      return this.terrainCache.get(cacheKey)!;
    }

    try {
      const elevation = await this.getElevation(latitude, longitude);

      // Get elevation samples around the point
      const samples = 8;
      const radiusDecimal = radiusMeters / 111320; // Convert meters to decimal degrees (approx)
      const nearby = [];

      for (let i = 0; i < samples; i++) {
        const angle = (i / samples) * Math.PI * 2;
        const sampleLat = latitude + Math.cos(angle) * radiusDecimal;
        const sampleLon = longitude + Math.sin(angle) * radiusDecimal;

        try {
          const sampleElevation = await this.getElevation(sampleLat, sampleLon);
          const distance = this.calculateDistance(
            latitude,
            longitude,
            sampleLat,
            sampleLon
          );

          nearby.push({
            latitude: sampleLat,
            longitude: sampleLon,
            elevation: sampleElevation,
            distance,
          });
        } catch (err) {
          console.warn('Error fetching sample elevation:', err);
        }
      }

      const terrainData: TerrainData = {
        elevation,
        terrainType: 'varied',
        nearby,
      };

      this.terrainCache.set(cacheKey, terrainData);
      return terrainData;
    } catch (error) {
      console.error('Error getting terrain data:', error);
      throw error;
    }
  }

  /**
   * Convert geographic coordinates to local AR coordinates
   * Relative to current user location
   */
  getLocalCoordinates(
    targetLat: number,
    targetLon: number,
    targetAlt: number = 0
  ): BABYLON.Vector3 {
    if (!this.currentLocation) {
      throw new Error('Current location not available');
    }

    const latDiff = targetLat - this.currentLocation.latitude;
    const lonDiff = targetLon - this.currentLocation.longitude;
    const altDiff = targetAlt - (this.currentLocation.altitude ?? 0);

    // Convert degrees to meters (approximate for small distances)
    const latMeters = latDiff * 111320; // 1 degree latitude ≈ 111.32 km
    const lonMeters = lonDiff * 111320 * Math.cos((this.currentLocation.latitude * Math.PI) / 180);

    // Return as Babylon.js Vector3
    // X = East-West (longitude), Z = North-South (latitude), Y = Up-Down (altitude)
    return new BABYLON.Vector3(lonMeters, altDiff, latMeters);
  }

  /**
   * Get geographic coordinates from local AR coordinates
   * Relative to current user location
   */
  getGeoCoordinates(localPos: BABYLON.Vector3): GeoLocation {
    if (!this.currentLocation) {
      throw new Error('Current location not available');
    }

    const latRad = (this.currentLocation.latitude * Math.PI) / 180;
    const latChange = localPos.z / 111320;
    const lonChange =
      localPos.x / (111320 * Math.cos(latRad));

    return {
      latitude: this.currentLocation.latitude + latChange,
      longitude: this.currentLocation.longitude + lonChange,
      altitude: (this.currentLocation.altitude ?? 0) + localPos.y,
    };
  }

  /**
   * Calculate distance between two geographic points (Haversine formula)
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Public method to calculate distance between two geographic points
   */
  getDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    return this.calculateDistance(lat1, lon1, lat2, lon2);
  }

  /**
   * Calculate bearing between two points
   */
  calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x =
      Math.cos(φ1) * Math.sin(φ2) -
      Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);

    return ((θ * 180) / Math.PI + 360) % 360;
  }

  /**
   * Get map tiles from Google Maps Static API
   */
  async getMapTile(
    latitude: number,
    longitude: number,
    zoom: number = 18,
    width: number = 256,
    height: number = 256
  ): Promise<MapTileData> {
    try {
      const url = `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=${zoom}&size=${width}x${height}&scale=2&style=feature:all|element:labels|visibility:off&key=${this.googleMapsApiKey}`;

      // Calculate bounds
      const radiusDecimal = (40075 / Math.pow(2, zoom + 8)); // Approximate bounds for tile
      const bounds = {
        north: latitude + radiusDecimal,
        south: latitude - radiusDecimal,
        east: longitude + radiusDecimal,
        west: longitude - radiusDecimal,
      };

      return {
        url,
        bounds,
      };
    } catch (error) {
      console.error('Error getting map tile:', error);
      throw error;
    }
  }

  /**
   * Check if point is within bounds
   */
  isPointInBounds(
    lat: number,
    lon: number,
    north: number,
    south: number,
    east: number,
    west: number
  ): boolean {
    return lat <= north && lat >= south && lon <= east && lon >= west;
  }

  /**
   * Destroy service and cleanup
   */
  destroy(): void {
    this.stopTracking();
    this.locationCallbacks = [];
    this.terrainCache.clear();
  }
}

export default GeolocationService;
