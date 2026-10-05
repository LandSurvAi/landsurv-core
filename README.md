# landsurv-core

The open-source core of [LandSurv.ai](https://landsurv.ai): a complete professional surveying CAD platform and multi-agent AI operating environment released under Apache-2.0. Runnable entirely locally with your own AI provider key (Gemini / OpenAI / Anthropic / xAI).

## What's Included

- **Interactive CAD Drawing Canvas & Drafting Engine** — 2D/3D graphics canvas, viewport navigation, object snapping, layer management, point cloud visualization, custom symbol libraries, titleblock editor, sheet view layouts, and AutoCAD DXF (R2000–R2021) import/export.
- **Surveying Computation (COGO & Boundaries)** — Traverse computations, inverse calculations, bearing/distance geometry, ALTA/NSPS 2021 closure verification, error-of-closure vectors, relative positional precision, and Bowditch (Compass Rule) traverse adjustment.
- **Terrain Modeling, TIN & Contouring** — Delaunay Triangulated Irregular Network (TIN) surface generation, interval-based contour line generation, slope aspect calculations, and steep-slope environmental analysis reports.
- **Civil Drafting, Stationing & Cut Sheets** — Road centerline alignments, stationing with equation offsets, cut/fill calculation sheets, utility linework, and automated surveyor fieldbook logging.
- **Point Management & Data Exchange** — Full point editor supporting PNEZD, .RAW, and CSV formats with sequential auto-numbering, block reservations, and point list management.
- **CAD Manager & Standards Compliance** — Automated Description Key builder, feature-code-to-layer mapping, and automated drafting standard enforcement.
- **Autonomous Multi-Agent AI Suite (Local BYOK)** — Full client-side agents (Point Editor, Boundary & Deed Reader, Civil Drafter, Contouring Agent, CAD Manager, Voice Agent, AR Field HUD) running directly against your own Gemini, OpenAI, Claude, or Grok API keys with zero vendor lock-in.
- **Civil 3D Open Bridge** — The open-source `civil3d-client` C#/.NET connector for Autodesk Civil 3D synchronization and description key mapping.

## Open Standards & Specifications

LandSurv.ai conforms to established surveying/geodetic standards and authors two open specifications for AI-assisted workflows:

- **[CACP (Cross-Agent Communications Protocol)](https://cacp.landsurv.ai)** — Open standard for inter-agent messaging, intent routing, and CAD execution (`services/CacpSchema.ts`, `services/cacpIntentRouter.ts`, `services/cacpRouter.ts`, `services/glassCacpGateway.ts`, `components/Cacp*.tsx`).
- **[.lsvz File Format Specification](https://lsvz.landsurv.ai)** — Open-standard (CC BY 4.0) survey workspace archive format with schema validation and archive serialization (`utils/sessionZip.ts`, `utils/lsvzSchema.ts`, `services/LsvzPersistence.ts`, `services/LsvzOrchestrator.ts`, `components/LsvzDocumentationContent.tsx`).
- **[Industry Standards & Specifications Directory](https://standards.landsurv.ai)** — Full alignment with AutoCAD DXF (R2000–R2021), ALTA/NSPS 2021 traverse closure, US State Plane (SPCS83/27) and UTM projections via Proj4, GeoJSON (RFC 7946), GPX 1.1, and Delaunay TIN terrain modeling.
- **[Civil 3D Client](https://civil3d.landsurv.ai)** — Open-source .NET/C# connector (`civil3d-client`) for Autodesk Civil 3D interoperability.
- **[Documentation Portal](https://docs.landsurv.ai)** — User guides, technical specifications, and COGO workflow manuals.
- **[Technologies & Upstream Credits](https://technologies.landsurv.ai)** — Open-source dependencies, mathematical libraries (Proj4, JSZip, Leaflet), and licensing transparency.

## Quick start

```bash
npm install
npm run dev:oss
```

Open the app, go to Settings, and paste your own AI provider API key. No
backend server, account, or billing is required.

## What's not included

GNSS/RINEX processing, drone photogrammetry, zoning/flood/structures/soils
research (these call a hosted backend with licensed data sources), and the
DevOps console / billing surfaces. See https://opensource.landsurv.ai for the
full roadmap and rationale.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
