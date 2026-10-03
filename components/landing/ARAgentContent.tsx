import React from 'react';

export const ARAgentContent: React.FC = () => {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xl font-bold text-cyan-400 mb-3">Augmented Reality (AR) Surveying</h3>
        <p className="mb-4">
          The AR Surveying Agent brings your survey data to life in real-world environments through augmented reality visualization. 
          See survey points, boundaries, and measurements overlaid on your actual site in real-time.
        </p>
      </section>

      <section>
        <h4 className="text-lg font-semibold text-green-400 mb-2">Key Features</h4>
        <ul className="list-disc list-inside space-y-2 text-gray-300">
          <li><strong>Real-Time Visualization:</strong> View survey points and boundaries in AR space using your device's camera</li>
          <li><strong>Geolocation Integration:</strong> Automatically position visualizations relative to your current GPS location</li>
          <li><strong>Point Inspection:</strong> Select and interact with survey points directly in AR</li>
          <li><strong>Distance Verification:</strong> Measure and verify distances between points in the real world</li>
          <li><strong>WebXR Support:</strong> Works on compatible AR-capable devices and browsers</li>
          <li><strong>Point Information:</strong> View detailed information about each survey point on demand</li>
        </ul>
      </section>

      <section>
        <h4 className="text-lg font-semibold text-green-400 mb-2">Supported Data Formats</h4>
        <ul className="list-disc list-inside space-y-2 text-gray-300">
          <li>Point coordinates from RAW data</li>
          <li>Survey points from deed data</li>
          <li>Points from DXF files</li>
          <li>GPS waypoints and survey stations</li>
        </ul>
      </section>

      <section>
        <h4 className="text-lg font-semibold text-green-400 mb-2">How to Use</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-300">
          <li>Load survey data into the main application using any supported agent</li>
          <li>Navigate to the GPS Stakeout or Point Editor panel</li>
          <li>Enable AR Viewing mode</li>
          <li>Allow location and camera permissions when prompted</li>
          <li>Hold your device up to see survey points overlaid on the real world</li>
          <li>Tap points to view their coordinates and details</li>
        </ol>
      </section>

      <section>
        <h4 className="text-lg font-semibold text-green-400 mb-2">Requirements</h4>
        <ul className="list-disc list-inside space-y-2 text-gray-300">
          <li>WebXR-capable browser (Chrome on Android, Safari on iOS 14+)</li>
          <li>Device with AR capability (most modern smartphones)</li>
          <li>GPS signal for accurate geolocation</li>
          <li>Camera permissions enabled</li>
          <li>Location services enabled</li>
        </ul>
      </section>

      <section>
        <h4 className="text-lg font-semibold text-green-400 mb-2">Use Cases</h4>
        <ul className="list-disc list-inside space-y-2 text-gray-300">
          <li><strong>Site Navigation:</strong> Walk boundaries and locate survey markers in the field</li>
          <li><strong>Boundary Verification:</strong> Verify survey accuracy by comparing with ground reality</li>
          <li><strong>Construction Stakeout:</strong> Position equipment and mark construction points precisely</li>
          <li><strong>Client Presentations:</strong> Show boundary lines and property extents in context on site</li>
          <li><strong>Quality Control:</strong> Verify survey points match expected positions</li>
          <li><strong>Real Estate Verification:</strong> Confirm property boundaries during site visits</li>
        </ul>
      </section>

      <section className="bg-slate-700 p-4 rounded-lg border border-slate-600">
        <p className="text-sm text-gray-300">
          <strong>Note:</strong> AR functionality requires a device with WebXR support and GPS capability. 
          Performance and accuracy depend on device sensors, GPS signal strength, and environmental conditions.
        </p>
      </section>
    </div>
  );
};
