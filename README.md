# landsurv-core

The open-source core of [LandSurv.ai](https://landsurv.ai): COGO/coordinate-geometry
math, boundary closure, DXF I/O, contouring/TIN/steep-slope, the CAD drawing
canvas, point editor, and CAD Manager — runnable entirely locally with your
own AI provider key (Gemini / OpenAI / Anthropic / xAI).

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
