import * as BABYLON from '@babylonjs/core';
import '@babylonjs/core/Debug/debugLayer';

type RenderLoopCallback = (frame: XRFrame) => void;

/**
 * Device detection for WebXR-capable devices
 */
export interface DeviceCapabilities {
  supportsImmersiveAR: boolean;
  supportsImmersiveVR: boolean;
  isOculusDevice: boolean;
  isMetaDevice: boolean;
  userAgent: string;
  deviceModel?: string;
}

/**
 * Detect device capabilities and type
 */
export async function detectDeviceCapabilities(): Promise<DeviceCapabilities> {
  const userAgent = navigator.userAgent.toLowerCase();
  
  const capabilities: DeviceCapabilities = {
    supportsImmersiveAR: false,
    supportsImmersiveVR: false,
    isOculusDevice: false,
    isMetaDevice: false,
    userAgent: userAgent,
  };

  // Check for Oculus/Meta device in user agent
  capabilities.isOculusDevice = /oculus|quest|rift/.test(userAgent);
  capabilities.isMetaDevice = /meta|horizon/.test(userAgent);

  // Get device model from user agent
  const questMatch = userAgent.match(/quest\s+(\d+)/);
  if (questMatch) {
    capabilities.deviceModel = `Meta Quest ${questMatch[1]}`;
  }

  // Check WebXR support
  if (!navigator.xr) {
    console.warn('WebXR not available on this device');
    return capabilities;
  }

  try {
    // Check for immersive AR support
    capabilities.supportsImmersiveAR = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
    
    // Check for immersive VR support (Oculus devices typically support this)
    capabilities.supportsImmersiveVR = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
    
    console.log('Device capabilities detected:', capabilities);
  } catch (error) {
    console.error('Error detecting XR capabilities:', error);
  }

  return capabilities;
}

/**
 * ARSession manages WebXR session lifecycle and Babylon.js engine
 * Handles initialization, frame updates, and cleanup
 */
class ARSession {
  private canvas: HTMLCanvasElement;
  private engine: BABYLON.Engine | null = null;
  private scene: BABYLON.Scene | null = null;
  private xrSession: XRSession | null = null;
  private xrBaseRefSpace: XRReferenceSpace | null = null;
  private isRunning = false;
  private renderLoopCallback: RenderLoopCallback | null = null;
  private deviceCapabilities: DeviceCapabilities | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /**
   * Get device capabilities
   */
  getDeviceCapabilities(): DeviceCapabilities | null {
    return this.deviceCapabilities;
  }

  /**
   * Initialize WebXR session and Babylon.js engine
   */
  async initialize(preferredMode: XRSessionMode = 'immersive-ar'): Promise<void> {
    try {
      // Detect device capabilities
      this.deviceCapabilities = await detectDeviceCapabilities();
      
      console.log('Initializing AR session with capabilities:', this.deviceCapabilities);

      // Check WebXR support
      if (!navigator.xr) {
        throw new Error('WebXR not supported');
      }

      // Determine actual mode to use
      let sessionMode: XRSessionMode = preferredMode;
      if (preferredMode === 'immersive-ar' && !this.deviceCapabilities.supportsImmersiveAR && this.deviceCapabilities.supportsImmersiveVR) {
        console.log('immersive-ar not supported, falling back to immersive-vr');
        sessionMode = 'immersive-vr';
      }

      // Prepare session options based on device capabilities
      const sessionInit: XRSessionInit = {
        requiredFeatures: [],
        optionalFeatures: [
          'hand-tracking',
          'layers',
          'depth-sensing',
          'plane-detection',
          'hit-test', // Move hit-test to optional by default
        ],
      };

      // Configure features based on mode
      if (this.deviceCapabilities.isOculusDevice || this.deviceCapabilities.isMetaDevice) {
        // Oculus/Meta specific config
        // We use local-floor as the base requirement for headsets
        sessionInit.requiredFeatures = ['local-floor'];
        
        // Add headset-specific optional features
        sessionInit.optionalFeatures?.push('bounded-floor');
        sessionInit.optionalFeatures?.push('touch-events');
        sessionInit.optionalFeatures?.push('hand-input');
        
        // Try to get dom-overlay if possible, but don't require it as it often fails on Quest
        sessionInit.optionalFeatures?.push('dom-overlay');
        sessionInit.domOverlay = { root: document.body };
        
        console.log('Detected Oculus/Meta device, using headset-optimized session config');
      } else {
        // Standard Handheld AR (Android/iOS)
        if (sessionMode === 'immersive-ar') {
            // For handheld AR, these are typically required for a functional experience
            sessionInit.requiredFeatures = ['hit-test', 'dom-overlay'];
            sessionInit.domOverlay = { root: document.body };
            sessionInit.optionalFeatures?.push('dom-overlay-for-handheld-ar');
        } else {
            // Fallback for other modes on non-headsets
            sessionInit.optionalFeatures?.push('hit-test');
        }
      }

      console.log(`Requesting session: mode=${sessionMode}, init=`, sessionInit);

      // Request immersive AR session
      this.xrSession = await navigator.xr.requestSession(sessionMode, sessionInit);

      // Create Babylon engine
      this.engine = new BABYLON.Engine(this.canvas, true, {
        preserveDrawingBuffer: true,
        antialias: true,
        adaptToDeviceRatio: true,
      });

      // Create scene
      this.scene = new BABYLON.Scene(this.engine);
      this.scene.collisionsEnabled = true;
      this.scene.enablePhysics();

      // Setup camera for AR
      const camera = new BABYLON.UniversalCamera(
        'arCamera',
        BABYLON.Vector3.Zero(),
        this.scene
      );
      camera.attachControl(this.canvas, true);

      // Setup lighting
      const light = new BABYLON.HemisphericLight(
        'light',
        BABYLON.Vector3.Up(),
        this.scene
      );
      light.intensity = 1;

      // Get reference space
      this.xrBaseRefSpace = await this.xrSession.requestReferenceSpace('local');

      // Handle session end
      this.xrSession.addEventListener('end', () => {
        this.isRunning = false;
      });

      // Handle window resize
      window.addEventListener('resize', () => {
        this.engine?.resize();
      });

      console.log('AR Session initialized successfully');
      if (this.deviceCapabilities.isOculusDevice) {
        console.log(`Connected with ${this.deviceCapabilities.deviceModel || 'Oculus device'}`);
      }
    } catch (error) {
      console.error('Failed to initialize AR session:', error);
      throw error;
    }
  }

  /**
   * Start render loop
   */
  async startRenderLoop(callback: RenderLoopCallback): Promise<void> {
    if (!this.xrSession || !this.engine || !this.scene) {
      throw new Error('AR session not initialized');
    }

    this.renderLoopCallback = callback;
    this.isRunning = true;

    const renderLoop = (time: DOMHighResTimeStamp, frame: XRFrame) => {
      // Call user's render callback
      if (this.renderLoopCallback) {
        this.renderLoopCallback(frame);
      }

      // Render Babylon scene
      this.engine!.beginFrame();
      this.scene!.render();
      this.engine!.endFrame();

      // Request next frame
      if (this.isRunning) {
        this.xrSession!.requestAnimationFrame(renderLoop);
      }
    };

    // Start the loop
    this.xrSession.requestAnimationFrame(renderLoop);
  }

  /**
   * Get Babylon scene
   */
  getScene(): BABYLON.Scene {
    if (!this.scene) {
      throw new Error('Scene not initialized');
    }
    return this.scene;
  }

  /**
   * Get Babylon engine
   */
  getEngine(): BABYLON.Engine {
    if (!this.engine) {
      throw new Error('Engine not initialized');
    }
    return this.engine;
  }

  /**
   * Get XR session
   */
  getXRSession(): XRSession {
    if (!this.xrSession) {
      throw new Error('XR session not initialized');
    }
    return this.xrSession;
  }

  /**
   * Get XR reference space
   */
  getXRBaseRefSpace(): XRReferenceSpace {
    if (!this.xrBaseRefSpace) {
      throw new Error('XR reference space not initialized');
    }
    return this.xrBaseRefSpace;
  }

  /**
   * Get Babylon camera
   */
  getCamera(): BABYLON.Camera | null {
    return this.scene?.activeCamera || null;
  }

  /**
   * Perform hit test to find surfaces
   */
  async hitTest(
    frame: XRFrame,
    x: number = 0.5,
    y: number = 0.5
  ): Promise<XRHitTestResult[] | null> {
    if (!this.xrSession || !this.xrBaseRefSpace) {
      return null;
    }

    try {
      const hitTestResults = await this.xrSession.requestHitTest(
        {
          space: this.xrBaseRefSpace,
          offsetRay: new XRRay({ x, y, z: -1 }),
        },
        frame
      );

      return hitTestResults;
    } catch (error) {
      console.warn('Hit test failed:', error);
      return null;
    }
  }

  /**
   * Get viewer pose from frame
   */
  getViewerPose(frame: XRFrame): XRViewerPose | null {
    if (!this.xrBaseRefSpace) {
      return null;
    }

    return frame.getViewerPose(this.xrBaseRefSpace);
  }

  /**
   * End AR session and cleanup
   */
  async end(): Promise<void> {
    this.isRunning = false;

    if (this.xrSession) {
      try {
        await this.xrSession.end();
      } catch (error) {
        console.warn('Error ending XR session:', error);
      }
      this.xrSession = null;
    }

    if (this.scene) {
      this.scene.dispose();
      this.scene = null;
    }

    if (this.engine) {
      this.engine.dispose();
      this.engine = null;
    }

    this.xrBaseRefSpace = null;
    this.renderLoopCallback = null;

    console.log('AR Session ended');
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.isRunning && this.xrSession !== null;
  }
}

export default ARSession;
