import * as BABYLON from '@babylonjs/core';
import { SurveyPoint } from '../types.ts';
import ARSession from '../services/xrSessionService.ts';
import { GeolocationService } from '../services/geolocationService.ts';

interface PointMarker {
  point: SurveyPoint;
  mesh: BABYLON.Mesh;
  label: BABYLON.Mesh;
  selected: boolean;
}

/**
 * ARPointRenderer manages rendering of survey points in 3D space
 * Handles point placement, selection, and visual updates
 */
class ARPointRenderer {
  private arSession: ARSession;
  private scene: BABYLON.Scene;
  private geolocationService: GeolocationService | null = null;
  private userLocation: { lat: number; lon: number } | null = null;
  private pointMarkers: Map<string, PointMarker> = new Map();
  private selectedPointId: string | null = null;
  private rayCaster: BABYLON.Mesh | null = null;
  public onPointSelected: ((point: SurveyPoint | null) => void) | null = null;

  // Visual settings
  private readonly POINT_RADIUS = 0.15; // meters
  private readonly LABEL_SIZE = 0.3; // meters
  private readonly NORMAL_COLOR = new BABYLON.Color3(0.2, 0.8, 1); // Cyan
  private readonly SELECTED_COLOR = new BABYLON.Color3(1, 1, 0); // Yellow
  private readonly ERROR_COLOR = new BABYLON.Color3(1, 0, 0); // Red

  constructor(
    arSession: ARSession,
    geolocationService?: GeolocationService | null,
    userLocation?: { lat: number; lon: number } | null
  ) {
    this.arSession = arSession;
    this.scene = arSession.getScene();
    this.geolocationService = geolocationService || null;
    this.userLocation = userLocation || null;
  }

  /**
   * Initialize renderer and create point markers
   */
  async initialize(points: SurveyPoint[]): Promise<void> {
    try {
      // Create materials
      const normalMaterial = new BABYLON.StandardMaterial(
        'normalMaterial',
        this.scene
      );
      normalMaterial.emissiveColor = this.NORMAL_COLOR;
      normalMaterial.alpha = 0.8;

      const selectedMaterial = new BABYLON.StandardMaterial(
        'selectedMaterial',
        this.scene
      );
      selectedMaterial.emissiveColor = this.SELECTED_COLOR;
      selectedMaterial.alpha = 1.0;

      // Create point markers
      for (const point of points) {
        const marker = this.createPointMarker(
          point,
          normalMaterial,
          selectedMaterial
        );
        if (marker) {
          this.pointMarkers.set(point.pointNumber, marker);
        }
      }

      // Create ray caster for hit detection
      this.createRayCaster();

      // Setup input handling
      this.setupInputHandling();

      console.log(`Rendered ${this.pointMarkers.size} point markers`);
    } catch (error) {
      console.error('Error initializing point renderer:', error);
      throw error;
    }
  }

  /**
   * Create a single point marker
   */
  private createPointMarker(
    point: SurveyPoint,
    normalMaterial: BABYLON.StandardMaterial,
    selectedMaterial: BABYLON.StandardMaterial
  ): PointMarker | null {
    try {
      // Create sphere for point marker
      const options = {
        segments: 16,
        diameter: this.POINT_RADIUS * 2,
      };
      const sphere = BABYLON.MeshBuilder.CreateSphere(
        `point_${point.pointNumber}`,
        options,
        this.scene
      );

      // Position based on point coordinates
      // If we have geolocation context, use location-aware positioning
      let posX = 0, posY = 0, posZ = 0;

      if (this.geolocationService && this.userLocation && point.latitude && point.longitude) {
        // Convert geographic coordinates to local AR coordinates
        try {
          const localPos = this.geolocationService.getLocalCoordinates(
            point.latitude,
            point.longitude,
            point.elevation || 0
          );
          posX = localPos.x;
          posY = localPos.y;
          posZ = localPos.z;
        } catch (err) {
          console.warn(`Failed to convert coordinates for point ${point.pointNumber}:`, err);
          // Fall back to survey coordinate system
          const scale = 0.01; // Convert from survey units to AR meters
          posX = point.easting * scale;
          posZ = point.northing * scale;
          posY = (point.elevation || 0) * scale;
        }
      } else {
        // Fallback to survey coordinate system
        const scale = 0.01; // Convert from survey units to AR meters
        posX = point.easting * scale;
        posZ = point.northing * scale;
        posY = (point.elevation || 0) * scale;
      }

      sphere.position.x = posX;
      sphere.position.z = posZ;
      sphere.position.y = posY;

      // Apply material
      sphere.material = normalMaterial;

      // Store point data on mesh
      (sphere as any).pointData = point;
      (sphere as any).isSelectable = true;

      // Create label (using a plane with text)
      const label = this.createTextLabel(point, sphere.position);

      return {
        point,
        mesh: sphere,
        label,
        selected: false,
      };
    } catch (error) {
      console.warn(`Failed to create marker for point ${point.pointNumber}:`, error);
      return null;
    }
  }

  /**
   * Create 3D text label for point
   */
  private createTextLabel(
    point: SurveyPoint,
    position: BABYLON.Vector3
  ): BABYLON.Mesh {
    // Create a plane to hold the label
    const labelPlane = BABYLON.MeshBuilder.CreatePlane(
      `label_${point.pointNumber}`,
      {},
      this.scene
    );

    labelPlane.position = position.add(new BABYLON.Vector3(0, this.POINT_RADIUS + 0.2, 0));

    // Create dynamic texture for text
    const textureSize = 512;
    const dynamicTexture = new BABYLON.DynamicTexture(
      `labelTexture_${point.pointNumber}`,
      textureSize
    );

    const ctx = dynamicTexture.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, textureSize, textureSize);

    ctx.fillStyle = '#00FFFF';
    ctx.font = 'bold 48px Arial';
    (ctx as any).textAlign = 'center';
    (ctx as any).textBaseline = 'middle';

    const label = point.pointNumber || point.description || 'Point';
    ctx.fillText(label, textureSize / 2, textureSize / 2);

    // Add distance info if geolocation available
    if (this.geolocationService && this.userLocation && point.latitude && point.longitude) {
      try {
        const distance = this.geolocationService.getDistance(
          this.userLocation.lat,
          this.userLocation.lon,
          point.latitude,
          point.longitude
        );
        ctx.fillStyle = '#90EE90';
        ctx.font = 'bold 32px Arial';
        ctx.fillText(`${distance.toFixed(1)}m`, textureSize / 2, textureSize / 2 + 80);
      } catch (err) {
        console.warn('Failed to calculate distance:', err);
      }
    }

    dynamicTexture.update();

    // Create material with texture
    const labelMaterial = new BABYLON.StandardMaterial(
      `labelMaterial_${point.pointNumber}`,
      this.scene
    );
    labelMaterial.emissiveTexture = dynamicTexture;
    labelMaterial.backFaceCulling = false;
    labelMaterial.alpha = 0.9;

    labelPlane.material = labelMaterial;
    labelPlane.scaling = new BABYLON.Vector3(
      this.LABEL_SIZE * 2,
      this.LABEL_SIZE,
      1
    );

    // Make label billboard (always face camera)
    labelPlane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

    return labelPlane;
  }

  /**
   * Create ray caster for controller input
   */
  private createRayCaster(): void {
    const rayCaster = BABYLON.MeshBuilder.CreateTube(
      'rayCaster',
      {
        path: [
          BABYLON.Vector3.Zero(),
          new BABYLON.Vector3(0, 0, 10),
        ],
        radius: 0.02,
      },
      this.scene
    );

    rayCaster.isVisible = false;
    (rayCaster as any).isRayCaster = true;

    this.rayCaster = rayCaster;
  }

  /**
   * Setup input handling for point selection
   */
  private setupInputHandling(): void {
    // Handle controller input (for WebXR devices)
    document.addEventListener('click', () => {
      this.selectPointAtScreenCenter();
    });

    // Handle touch (for mobile AR)
    document.addEventListener('touchend', (event) => {
      if (event.touches.length === 0) {
        // Last finger lifted - select at touch point
        const touch = event.changedTouches[0];
        this.selectPointAtScreenCoord(touch.clientX, touch.clientY);
      }
    });
  }

  /**
   * Select point at screen center (default AR reticle)
   */
  private selectPointAtScreenCenter(): void {
    this.selectPointAtScreenCoord(
      window.innerWidth / 2,
      window.innerHeight / 2
    );
  }

  /**
   * Select point at specific screen coordinates
   */
  private selectPointAtScreenCoord(screenX: number, screenY: number): void {
    // Create ray from screen coordinates
    const camera = this.scene.activeCamera;
    if (!camera) return;

    // Convert screen coordinates to normalized viewport coordinates
    const viewport = this.scene.getEngine().getRenderingCanvas();
    if (!viewport) return;

    const x = screenX / viewport.clientWidth;
    const y = screenY / viewport.clientHeight;

    // Create a ray from the camera through the screen point
    const ray = BABYLON.Ray.CreateNewFromTo(
      camera.position,
      BABYLON.Vector3.Unproject(
        new BABYLON.Vector3(x * this.scene.getEngine().getRenderWidth(), y * this.scene.getEngine().getRenderHeight(), 0),
        0,
        0,
        BABYLON.Matrix.Identity(),
        camera.getViewMatrix(),
        camera.getProjectionMatrix()
      )
    );

    // Cast ray against point markers
    let closestPoint: PointMarker | null = null;
    let closestDistance = Infinity;

    for (const marker of this.pointMarkers.values()) {
      const hit = ray.intersectsMesh(marker.mesh);
      if (hit && hit.distance < closestDistance) {
        closestDistance = hit.distance;
        closestPoint = marker;
      }
    }

    // Update selection
    this.selectPoint(closestPoint?.point.pointNumber || null);
  }

  /**
   * Select a point by ID
   */
  private selectPoint(pointNumber: string | null): void {
    // Deselect previous point
    if (this.selectedPointId && this.selectedPointId !== pointNumber) {
      const previousMarker = this.pointMarkers.get(this.selectedPointId);
      if (previousMarker) {
        previousMarker.selected = false;
        previousMarker.mesh.material = new BABYLON.StandardMaterial(
          `normal_${this.selectedPointId}`,
          this.scene
        );
        (previousMarker.mesh.material as BABYLON.StandardMaterial).emissiveColor =
          this.NORMAL_COLOR;
      }
    }

    // Select new point
    this.selectedPointId = pointNumber;

    if (pointNumber) {
      const marker = this.pointMarkers.get(pointNumber);
      if (marker) {
        marker.selected = true;

        // Update material to selected color
        const selectedMaterial = new BABYLON.StandardMaterial(
          `selected_${pointNumber}`,
          this.scene
        );
        selectedMaterial.emissiveColor = this.SELECTED_COLOR;
        selectedMaterial.alpha = 1.0;
        marker.mesh.material = selectedMaterial;

        // Trigger callback
        if (this.onPointSelected) {
          this.onPointSelected(marker.point);
        }
      }
    } else {
      // No point selected
      if (this.onPointSelected) {
        this.onPointSelected(null);
      }
    }
  }

  /**
   * Render frame update
   */
  render(frame: XRFrame): void {
    // Update point positions if needed (e.g., for LOD)
    // Currently just rendering as-is

    // Could add:
    // - Distance-based LOD (simplify distant points)
    // - Frustum culling
    // - Animation updates
  }

  /**
   * Update points (e.g., when data changes)
   */
  async updatePoints(points: SurveyPoint[]): Promise<void> {
    // Clear existing markers
    for (const marker of this.pointMarkers.values()) {
      marker.mesh.dispose();
      marker.label.dispose();
    }
    this.pointMarkers.clear();
    this.selectedPointId = null;

    // Recreate with new points
    const normalMaterial = this.scene.getMaterialByName('normalMaterial') as
      | BABYLON.StandardMaterial
      | null ||
      new BABYLON.StandardMaterial('normalMaterial', this.scene);

    const selectedMaterial = this.scene.getMaterialByName('selectedMaterial') as
      | BABYLON.StandardMaterial
      | null ||
      new BABYLON.StandardMaterial('selectedMaterial', this.scene);

    for (const point of points) {
      const marker = this.createPointMarker(point, normalMaterial, selectedMaterial);
      if (marker) {
        this.pointMarkers.set(point.pointNumber, marker);
      }
    }
  }

  /**
   * Highlight a specific point
   */
  highlightPoint(pointNumber: string): void {
    this.selectPoint(pointNumber);
  }

  /**
   * Get selected point
   */
  getSelectedPoint(): SurveyPoint | null {
    if (!this.selectedPointId) {
      return null;
    }

    const marker = this.pointMarkers.get(this.selectedPointId);
    return marker?.point || null;
  }

  /**
   * Cleanup and dispose resources
   */
  dispose(): void {
    for (const marker of this.pointMarkers.values()) {
      marker.mesh.dispose();
      marker.label.dispose();
    }
    this.pointMarkers.clear();

    if (this.rayCaster) {
      this.rayCaster.dispose();
      this.rayCaster = null;
    }

    this.onPointSelected = null;
  }
}

export default ARPointRenderer;
