import React from 'react';

const releases = [
    {
        version: "26.10.01.01",
        date: "October 1, 2026",
        highlights: [
            "👋 Welcome screen redesign: Replaced the multi-color welcome dialog with a restrained, professional layout — a 'Get started' heading, three dashed-outline destination cards (Agentic CAD, Home, Free Software) with color-coded side bars, Inter typography (self-hosted via `@fontsource-variable/inter`, CSP-safe), and colored YouTube / Facebook icons. The primary action is now 'Open CAD Environment'; the auto-close timer moved to a quiet footer with a Pause control.",
            "🛠️ Agentic CAD launch fix: Choosing Agentic CAD on first run opened the legal agreement and then dropped the user on the Home screen after signing. The chosen launch mode is now remembered and resumed automatically once the agreement is signed.",
            "✍️ Two-step agreement dialog: The first-time agreement now shows the conditions with a single 'I acknowledge all of the conditions above' action, then swaps to the name / email / signature step. The confirm button sits in a fixed footer so it is always visible, and a Back button returns to the conditions. The separate acknowledgement checkboxes were folded into the conditions list, and product-update emails are disclosed as part of signing (unsubscribe link in every email).",
            "🆓 Free Software view: Rewritten in plain language — the majority of LandSurv.ai is open source; the GitHub card explains free download and use, FOSS, and the permissive Apache 2.0 license (linked to the full text). The Zelle QR code is now revealed by a coin-flip button ('Click here to support open source software').",
            "🔀 Merge housekeeping: Reconciled `package.json` / `package-lock.json` with main (kept both `@babylonjs/loaders` and `@fontsource-variable/inter`) and took main's generated `test-results/results.json`.",
        ],
    },
    {
        version: "26.09.30.01",
        date: "September 30, 2026",
        highlights: [
            "⚖️ Automated License Inventory & Monetization Audit: Replaced manual license lists with an automated lockfile analysis pipeline (`scripts/licenses/generate-license-inventory.mjs`). DevOps Licenses tab now displays dual verdicts (Commercial Hosted Monetization safe; @landsurv/core Apache-2.0 permissive), multi-scope filters, explicit multi-license elections (JSZip -> MIT, DOMPurify -> Apache-2.0, node-forge -> BSD-3-Clause), and instant JSON/CSV export.",
            "🧭 DevOps Open Source Architecture Guide: Introduced a dedicated 'Open Source Guide' panel in the DevOps console featuring an interactive 'Which Repo Am I In?' path search, repository boundary matrix (@landsurv/core public engine vs. landsurv-app web app vs. private cloud backend), developer workflow guidance, and pre-push tripwire checklists.",
            "🌐 Public Transparency & Open Source Portal: Added a new 'Licenses & Credits' section to opensource.landsurv.ai mirroring verified package dependencies, clarifying BYOK cloud API terms, and attributing upstream projects (RTKLIB BSD-2-Clause by Tomoji Takasu, NodeODM AGPL-3.0 by OpenDroneMap, EPSG/IOGP geodetic data, OSM contributors). Reconciled technologies.landsurv.ai to reflect actual .NET 8 runtime and clean package registries.",
            "🛡️ Security Patching & Dependency Pruning: Upgraded jsPDF to v4.2.1 to resolve upstream CVE advisories while preserving client-side sheet exports. Pruned 8 legacy unused authentication packages and eliminated unmounted account recovery/2FA codebases. Removed redundant WebSocket libraries from the Civil 3D connector in favor of native .NET ClientWebSocket.",
            "🛰️ GNSS & Drone Processing Integrity: Removed simulated fallback calculations in the RINEX processing panel in favor of live service health verification, and clearly labeled cloud RINEX and Drone agents as Beta with transparent upstream attribution.",
            "⚡ Hardware-Accelerated 3D WebGPU Engine: Integrated high-performance WebGPU rendering via Babylon.js WebGPUEngine with automatic, zero-friction fallback to WebGL2 for older browsers and virtualization environments. Accessible via the top header bar's '3D' view toggle.",
            "🏔️ Zero-Copy Point Cloud & TIN Streaming: Added an off-main-thread Web Worker pipeline (`webgpuPointCloud.worker.ts`) that transforms survey coordinates, elevation points, and dense LiDAR point clouds into contiguous Float32Array buffers with hypsometric color ramps using zero-copy Transferable ArrayBuffers directly to GPU VRAM.",
            "⚙️ 3D Graphics & WebGPU Settings: Exposed custom user preferences in the Settings panel for GPU power preference (discrete high-performance vs. low-power), elevation color palettes (rainbow hypsometric, high-contrast cyan, monochrome), particle sizing (1–10px), MSAA anti-aliasing, and real-time GPU telemetry HUD overlays.",
        ],
    },
    {
        version: "26.09.25.01",
        date: "September 25, 2026",
        highlights: [
            "🧭 Orientation Tuple (OT) Tool: Introduced bottom-left interactive widget with numerical angle input, slider, preset rotation buttons (0°, ±90°, 180°), pivot origin (X, Y) controls with on-canvas snapping, and 'Align to Line' entity orientation. Supports dual modes: Drafting Mode (ortho constraint follows OT angle while linework and North remain fixed) and View Mode (dynamically rotates entire viewport and North Arrow).",
            "⭕ Unified Circle Drawing & TTR Mode: Upgraded circle entities to a unified single-entity representation (isCircle, curveRadius, arcLength, circleCenter) replacing dual semicircles for clean DXF export (d.drawCircle) and selection bounds. Added interactive Circle tool (shortcut 'C') with on-cursor HUD for Radius/Diameter toggle ('D'/'R'), plus Tangent-Tangent-Radius (TTR) mode ('T') with analytical geometric solvers for Line-Line, Line-Circle/Arc, and Circle-Circle tangencies, real-time tangent glyphs, and live preview.",
            "🎯 OSNAP Subsystem Additions: Added 'Center' OSNAP mode for circular arcs and full circles, fixed 'Nearest' OSNAP on circles and curved arcs to snap directly to true radial circumference instead of chords, and added 'Tangent' OSNAP mode (glyph 'T') for circles, arcs, and boundary curves.",
            "✂️ Trim Tool Overhaul & Preview: Bound 'T' shortcut to activate Trim tool, upgraded the intersection engine to accurately cut straight lines, arcs, and circles against all intersecting entities while preserving coordinates and attributes, and added AutoCAD-style real-time hover preview with red dashed segment highlights and '✕' cut badge indicators.",
        ],
    },
    {
        version: "26.09.24.01",
        date: "September 24, 2026",
        highlights: [
            "🧠 CACP skill enhancements: Expanded agent skill registrations and robust geometric validation across coordinate calculation pipelines.",
            "📐 Curve & circle emission contracts: Enforced strict standards for native arc and circle representations in generative outputs, preventing polygon approximation artifacts and maintaining exact radius, chord, and arc length parameters.",
            "🛡️ Backend startup hardening & container deployments: Implemented automated backend process supervision and resource guardrails to prevent memory exhaustion during large drawing syncs and streamline Cloud Run operations.",
            "🗺️ Coordinate correction pipelines & documentation indices: Upgraded geometric and statistical validation checks during coordinate ingestion and consolidated technical specifications into structured reference indices.",
        ],
    },
    {
        version: "26.09.21.01",
        date: "September 21, 2026",
        highlights: [
            "🔍 Canvas viewport preservation: Saving and reloading a .lsvz project session now persists and restores your exact 2D canvas pan and zoom position rather than auto-zooming out to full project extents.",
            "🗺️ Background map overlay default opacity: Map and aerial imagery (NAIP & Google Static Maps) now defaults to 100% full opacity (1.0) when enabled instead of 70%.",
            "📋 Point Editor interface copy refresh: Updated agent descriptions across the homepage, point.landsurv.ai, the in-app Help modal, and welcome dialogs to accurately reflect structured point list management and AI-powered coordinate geometry.",
        ],
    },
    {
        version: "26.09.19.01",
        date: "September 19, 2026",
        highlights: [
            "📂 Added support for Carlson Field Code Library (.fcl) files in CAD Manager. You can now upload .fcl files and instantly export them as Trimble-compatible CSVs (Feature Code, Description, Feature Type, Layer). The converter automatically translates Carlson's polyline 'Y/N' flags into Trimble's 'Line' or 'Point' feature types.",
        ],
    },
    {
        version: "26.09.07.12",
        date: "September 7, 2026",
        highlights: [
            "📐 The drawing canvas polyline tool gains a CAD-style Arc submode: while drawing, press A to make the next segment a true circular arc that stays tangent to the previous segment and follows the cursor with a live dashed preview, and press L to switch back to straight segments — alternate between the two until you finish with Escape. Chained arcs stay tangent-continuous, an endpoint that lands on the tangent line simply falls back to a straight segment, and the status bar shows a LINE/ARC (A/L) indicator while you draw.",
        ],
    },
    {
        version: "26.09.07.11",
        date: "September 7, 2026",
        highlights: [
            "🛡️ Fixed the outage that followed the previous release. Syncing a large drawing could exhaust the backend's memory and kill it, and because nothing restarted the process, every request returned a 502 until the release was rolled back by hand. The backend now runs under a supervisor that restarts it automatically, an oversized sync payload is refused on that one connection instead of taking the server down for everyone, and the service has been given the memory headroom a full drawing sync actually needs.",
            "🔍 Computing a deed preview no longer zooms the canvas to the deed — your current pan and zoom are left exactly as you set them.",
        ],
    },
    {
        version: "26.09.07.10",
        date: "September 7, 2026",
        highlights: [
            "⌖ Align a highlighted deed directly to found monuments: select a deed corner, then its corresponding found point. Add more pairs for a rigid best fit that preserves deed bearings and distances; Shift+click opens a chooser for nested points.",
            "🔗 Civil 3D chat drafting requests now hand off to LandSurv.ai's Civil Drafter when the web app is connected, so it can use the loaded survey, drafting style library, and CAD standard. The connector continues to answer locally when the web app is unavailable.",
            "🗂️ Choosing Civil 3D's layers during sync now creates a named CAD Manager session and binds usable drawing layers to codes, so agents draft onto the drawing's actual company layers instead of a previous standard.",
            "⛰️ Contouring now rejects missing and clearly detached elevations before building the TIN, reports excluded points and the accepted elevation range, and keeps suspicious values when filtering would discard too much of the survey.",
            "📐 Expanded DXF export coverage for assigned CAD layers and CAD Manager text styles across point, boundary, contour, and parcel annotations.",
        ],
    },
    {
        version: "26.09.07.09",
        date: "September 7, 2026",
        highlights: [
            "🎯 Fixed linework drawn in LandSurv.ai never reaching Civil 3D. Lines that reference survey points by number (how most LandSurv.ai linework is stored) carried no coordinates on the wire and were silently discarded — they are now resolved against the point table before sending, and the connector resolves them again as a safety net.",
            "🧷 Segments without an id previously got a positional key, so adding or deleting one line renumbered every line after it and the whole drawing looked like it had changed. Keys are now derived from the segment itself and stay stable between syncs.",
            "⚡ The connector reads the drawing in a single pass instead of walking every entity three times per sync, so large drawings reconcile noticeably faster.",
            "📏 Editing geometry in Civil 3D now syncs at the vertex level: STRETCH, grip-moving a single endpoint, or nudging one vertex updates LandSurv.ai without touching the rest of the line. Plain LINE and ARC entities plus 2D/3D polylines are now tracked as well, not just lightweight polylines.",
            "🗂️ Pulling layers from Civil 3D now opens its own CAD Manager session named after the drawing, so your company layer table is imported cleanly instead of merging into whatever standard happened to be open. Open a blank drawing with your layers, pull them, and LandSurv.ai is primed to draw features on those exact layers.",
            "🎨 Imported layers keep the drawing's resolved colour, linetype and lineweight in the form the connector compares against, so they reconcile instead of showing up as differences on every sync.",
            "🧹 Fixed the cause of duplicate \"Untitled Session\" entries: the CAD Manager forgot its active session whenever you switched views, so every save created a new record. Existing duplicates are collapsed automatically, keeping the newest copy of each.",
            "📐 GIS parcel lines, contours, soils, FEMA flood zones, steep-slope bands and TIN edges now sync to Civil 3D as ordinary linework, chained into continuous polylines on their own layers.",
        ],
    },
    {
        version: "26.09.07.06",
        date: "September 7, 2026",
        highlights: [
            "🔄 The Civil 3D connector's Sync button now runs the guarded review once and then stays live: safe additions and updates flow both ways automatically, while conflicts and large deletions are held back and reported instead of interrupting you.",
            "🪟 Rebuilt the connector's chat composer so the input box and Send button reserve their own space and are no longer clipped at the bottom of the window.",
            "📦 Rebuilt the connector from a clean source tree with matching assembly, direct-download ZIP, and MSI version 26.09.07.06.",
        ],
    },
    {
        version: "26.09.06.01",
        date: "September 6, 2026",
        highlights: [
            "🧭 Point symbols now stay hidden by default while symbol rendering is being stabilized. A new Settings toggle, \"Enable Point Symbols,\" turns matching custom, CAD Manager, and built-in survey symbols back on when needed.",
            "💬 Symbol chat commands now respect the global symbol display gate, so enabling a symbol group no longer suggests symbols are visible until point symbols are turned on in Settings.",
        ],
    },
    {
        version: "26.09.05.13",
        date: "September 6, 2026",
        highlights: [
            "📦 Final packaging fix for the Civil 3D connector: the build now deletes stale release artifacts before copying the freshly-built DLL, so the direct-download ZIP and MSI both contain the exact current assembly instead of a leftover 07-era UI bundle.",
            "🔍 The connector now exposes its true assembly version in the loaded banner and build output; a stale NETLOAD is no longer silently mistaken for the latest build. The direct ZIP and MSI are produced from the same freshly-built DLL so the version you see in Civil 3D matches the installer you downloaded.",
            "🛠️ The live connector stack was hardened around the package drift and connection churn that had been making the DLL look stale: same-day release artifacts are now refreshed deterministically, the web socket connection stays healthy longer, and the install path is consistent across direct-download and MSI deployment.",
        ],
    },
    {
        version: "26.09.05.12",
        date: "September 5, 2026",
        highlights: [
            "🔌 Fixed the Civil 3D connection dropping out every few minutes and session tokens appearing to \"expire in minutes.\" The backend service had a 4.5-minute request timeout that Cloud Run applies to WebSocket connections too, so the live link was forcibly closed on a fixed cadence regardless of activity. The timeout is now maxed out (60 minutes) and one service instance is kept warm so session tokens are no longer lost when the service scales down — the connection stays up and reconnects seamlessly.",
            "🔑 Connector session tokens are now effectively permanent (10-year lifetime) instead of expiring after 24 hours, so a returning user doesn't have to re-pair Civil 3D.",
            "🛡️ Live Sync now handles duplicate keys gracefully — a drawing containing two points with the same number (or two same-named blocks) previously threw \"An item with the same key has already been added\" and interrupted the sync. Duplicate keys are now tolerated (first one wins) so sync keeps running.",
        ],
    },
    {
        version: "26.09.05.11",
        date: "September 5, 2026",
        highlights: [
            "🧰 Fixed the MSI installer not upgrading between same-day builds — Windows Installer only compares the first three fields of a version, so builds like 26.09.05.07 and 26.09.05.10 looked identical to it and installing a newer one left the older files in place. The installer now allows same-version upgrades, so it removes the old build and installs the new one every time.",
        ],
    },
    {
        version: "26.09.05.10",
        date: "September 5, 2026",
        highlights: [
            "⭕ Live Sync now syncs circles — a plain AutoCAD circle used to be skipped entirely (it has no polyline vertices). Circles are now captured as closed two-arc polylines (geometrically identical) so they flow through the linework sync in both directions.",
            "🧠 Live Sync now honors deletion intent so deletes can't be \"pushed back.\" Previously, deleting a line on one side could be re-created from the other side's slightly-stale copy. The connector now keeps a per-drawing intent journal (tombstones): once an item is deleted, that intent is remembered and broadcast with the sync, so the deletion is propagated to the other side and never silently recreated — the tombstone clears automatically once both sides are clean. A large deletion still pauses for review, and a backup is still written before any removal.",
        ],
    },
    {
        version: "26.09.05.09",
        date: "September 5, 2026",
        highlights: [
            "🔎 The Civil 3D connector now prints a version banner the instant it loads — after NETLOAD you'll see \"✓ LandSurv.ai Connector v26.09.05.09 loaded\" on the command line, with the version read straight from the loaded assembly. This makes a stale load obvious: because .NET can't hot-swap an assembly of the same name within one session, loading a new build over an old one is silently ignored until Civil 3D is fully restarted — now you'll immediately know whether the new version actually took (banner appears) or you're still on the old one (no banner).",
        ],
    },
    {
        version: "26.09.05.08",
        date: "September 5, 2026",
        highlights: [
            "🗑️ Live Sync now honors deletions instead of undoing them — deleting or undoing an item in the web app used to \"push it back\" because the connector saw it as a new CAD-only object and re-created it in LandSurv.ai. The connector now uses the last-synced baseline to tell a genuine new addition apart from a deletion, so a web-app undo cleanly removes the matching object from the drawing (and a CAD-side delete removes it from LandSurv.ai). A timestamped backup is still written first, and a large bulk deletion still pauses to ask before wiping many items at once.",
            "🔌 Connector connection status is now accurate — the window previously stayed \"Connected\" even after the link dropped. A dropped or closed socket now flips the status pill to Disconnected and turns Live sync off automatically.",
            "🪟 Fixed the chat input box and Send button being cut off at the bottom of the connector window on some displays — the window now clamps itself to the screen's work area (so it never opens under the taskbar) and the input row has been given proper room.",
        ],
    },
    {
        version: "26.09.05.07",
        date: "September 5, 2026",
        highlights: [
            "🔴 Live Sync for the Civil 3D connector — a new \"Live\" toggle in the connector window keeps the drawing and your LandSurv.ai session continuously in sync. While on, safe changes flow automatically both ways: additions (a point/layer/line/label/block that exists on only one side) and unambiguous updates (exactly one side changed since the last sync) apply on a short debounce as you draw in CAD or as the AI draws in the web app — no button press.",
            "🛡️ Live Sync stays safe: it never auto-applies anything destructive. True conflicts (both sides changed the same item) and ambiguous edits are never applied silently — they pause auto-sync and open the review wizard once, so you decide. Deletions always require the explicit, typed-confirmation wizard flow (which backs up the drawing first). Turning Live off returns you to manual, one-click Sync.",
            "⚙️ Under the hood, Live Sync reuses the same snapshot → diff → apply engine and per-drawing baseline as manual Sync, hooking Civil 3D's object add/modify/erase events (with self-write suppression so it never loops on its own edits) plus a periodic poll to catch web-app-side changes.",
        ],
    },
    {
        version: "26.09.05.06",
        date: "September 5, 2026",
        highlights: [
            "🎨 Civil 3D connector UI overhaul (round 2): the chat window is now genuinely readable — a proper colored transcript (role labels, timestamps, word-wrap, autoscroll, duplicate-line collapsing) replaces the old cramped list, with soft rounded corners on the chat, buttons, and input for a modern look. Fixed the LandSurv.ai logo showing a stray dark/white box on both the chat header and the Session Token dialog so it always matches its background.",
            "🔌 Working Disconnect: the connector window now has a real Disconnect button (and the LANDSURVDISCONNECT command) that cleanly tears down the session and tells the webapp, so the Civil 3D status no longer gets stuck 'green'.",
            "🗂️ The agent can now create and delete drawing layers on request (not just recommend conventions) — e.g. 'make a layer V-ROAD-CNTR color 3' or 'remove the temp layers' — with color, linetype, and lineweight, and these participate in sync.",
            "📦 Fixed drawing linework failing with a 'could not write linework to the drawing session' error: the connector now tolerantly accepts vertices as either {x,y,bulge} objects or [x,y] arrays, so 'draw a box' and similar requests reliably produce closed polylines with arc support.",
            "💬 Conversation context no longer resets between messages — the connector chat remembers the running dialog (last 20 turns) so follow-ups like 'now label those' work.",
            "🟢 Reliable connection status & sync: the beta service is pinned to a single instance so the DLL and browser always share the same live link, fixing the connector not staying green and the Sync button appearing to do nothing.",
            "🧹 Removed the unsupported Carlson and IntelliCAD connector options from the Connect panel — Civil 3D is the supported CAD connector.",
        ],
    },
    {
        version: "26.09.05.05",
        date: "September 5, 2026",
        highlights: [
            "🔑 Fixed previously-issued Enabling/compute keys STILL failing Deed Summary even after the last permissions fix: the backfill logic only patched a key when its `permissions` array was completely empty, so a key that already had SOME permissions (e.g. `['read','write']` from an older code path) but was missing `demo:ai`/`demo:compute` was skipped entirely and kept 403'ing the AI proxy forever. Backfilling now merges in every required permission a service/Enabling key is missing, instead of only replacing an empty list — this closes the gap for every already-mailed key, on both server-startup hydration and on renewal, with no manual re-issuing needed.",
        ],
    },
    {
        version: "26.09.05.04",
        date: "September 5, 2026",
        highlights: [
            "🔗 Civil 3D connector overhaul — the DLL is now a professional, live two-way link to LandSurv.ai. Redesigned the connector window (correctly-kerned LandSurv.ai logo, DPI-aware resizable layout, message bubbles with roles/timestamps, connection status pill) and added a prominent Sync button.",
            "🔄 Full bidirectional sync engine with safeguards: sync points (real Civil 3D CogoPoints, DBPoint fallback in plain AutoCAD), layers (color/linetype/lineweight), linework incl. curves, annotation, and symbols/blocks. A wizard on both ends asks 'use from CAD / from LandSurv.ai / merge' per category, shows a dry-run diff preview, requires typed DELETE confirmation for any bulk removal, and writes a timestamped backup before changing anything — so a sync is always one undo away.",
            "🤖 The connector chat is now a real agent, not a canned reply: it can count entities, list and label points, place blocks/symbols at points, and draw linework (roads, boundaries, centerlines) with arc support, all executed live in the drawing.",
            "🧭 CACP now considers intent before acting: a request is classified against each agent's capabilities first, and a mismatched agent (e.g. the Point Agent asked to draw a road) flags the better-suited agent (Civil Drafter) instead of doing the wrong thing.",
            "🖥️ The webapp header now mirrors the connector: a Sync button plus the active Civil 3D drawing (with a dropdown of open drawings, click to switch) next to the notification bell.",
        ],
    },
    {
        version: "26.09.05.03",
        date: "September 5, 2026",
        highlights: [
            "🔑 Fixed previously-issued Enabling/compute keys losing AI access entirely: grantServiceAccess() never marked these paid keys as durable, so a purchased key only ever lived in the memory of whichever single Cloud Run instance minted it. Any restart, redeploy, or request routed to a different instance had no record of the key at all, causing Deed Summary (and every other AI call) to silently fail with \"No tracts detected\" while a personal Google AI Studio key kept working. Compute/Enabling keys are now always persisted to Firestore so they survive instance recycling, and existing in-memory-only keys are durably saved the next time they're used or renewed.",
            "🔑 Fixed DevOps Console \"Invalid Token\" errors when creating a new Enabling Key: the DevOps session signing secret fell back to a random value generated per server process when DEVOPS_SESSION_SECRET/DEVOPS_TOKEN weren't set, so a login token minted on one Cloud Run instance was rejected by any other instance. Now falls back to the already-deployed, stable JWT_SECRET before generating a random secret.",
        ],
    },
    {
        version: "26.09.05.02",
        date: "September 5, 2026",
        highlights: [
            "🔑 Fixed inconsistent AI access across valid keys: purchased Enabling/compute keys (Stripe service-plan checkouts) were minted with no permissions at all, so every AI call (deed drafting, deed summary, chat, etc.) was silently rejected by the demo AI proxy's permission gate — while 24-hour demo trial keys worked fine because they got AI permission by default. Any valid, paid, compute-entitled key now always receives full AI access. This is backfilled automatically for every already-issued live key at server startup (not just on renewal), so no manual re-issuing of existing customer keys is needed.",
        ],
    },
    {
        version: "26.09.05.01",
        date: "September 5, 2026",
        highlights: [
            "🐛 Fixed a live-only parity bug that broke Deed Summary (and any AI call using a user-supplied Gemini API key): the production Content-Security-Policy's `connect-src` never allowlisted `https://generativelanguage.googleapis.com`, the host the `@google/genai` SDK calls directly from the browser, so the browser silently blocked the request while local dev (no CSP enforcement) worked fine. Added the correct host to both `nginx-simple.conf` (the config actually used in the Docker image) and `nginx.conf`.",
        ],
    },
    {
        version: "26.09.04.04",
        date: "September 4, 2026",
        highlights: [
            "🗺️ GIS Agent ArcGIS link box fixed: requests now try the server directly first and then fail over across the CORS proxy chain (codetabs → allorigins → corsproxy.io) with timeouts, instead of relying on a single hard-coded proxy. Removed the dead \"SF Public Art\" preset and normalized ArcGIS error reporting.",
            "🌐 New ArcGIS Server Browser: paste any public ArcGIS REST endpoint — a server root, folder, MapServer/FeatureServer, or layer — and drill down through folders, services, and layers like a desktop GIS data-source manager. MapServer roots now show their layer list instead of silently loading layer 0.",
            "📚 Added a curated public GIS data catalog (Census TIGERweb, USGS National Map, FEMA NFHL flood zones, BLM PLSS, USFS, NPS, plus state/county/city examples) with a link to the MappingSupport community list of 7,500+ public GIS servers (© Joseph Elfelt) for finding your local county or city server.",
            "🐛 Fixed GIS Agent plotting nothing: fetched GeoJSON is now drawn on Parse for URL loads too (not just file uploads), the canvas auto-zooms to the plotted extent, and State Plane sessions holding a real-world EPSG code (e.g. Texas 2277, PA 2271/2272) now project correctly — previously proj4 didn't recognize those codes and every coordinate was silently dropped.",
            "🎯 Area-of-interest picker for large layers: clicking a big layer (e.g. FEMA NFHL with 5.8M polygons) probes the feature count and offers a place search (OSM Nominatim + Census fallback) at 0.25–50 mile radii, or clips the query to your drawn inclusion boundary. Server-side geometry generalization and transfer-limit warnings keep responses fast and honest.",
            "↩️ Complete drawing history: every point, line, centerline, contour, and boundary-file edit is captured automatically. Use toolbar buttons or Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl/Cmd+Y to undo/redo; the new History panel shows labeled changes and can restore any earlier state.",
            "🤖 AI-assisted history controls let agents identify and restore a requested prior edit. Multi-step reversions list the changes they would discard and require your confirmation.",
            "📐 Improved deed-boundary closure repair: the solver can now infer or rotate incorrect curve chords from endpoint geometry and tangency, including leading and closing curves, before completing other fixable traverse repairs.",
            "🛡️ Agent-requested point deletions now zoom to and visibly highlight the proposed points before asking for confirmation, preventing accidental removal from automated instructions.",
            "🧰 Refined the canvas workspace with a toggleable background grid, compact point markers, and centralized DXF export, drawing-mode, line-annotation, undo/redo, and history controls.",
        ],
    },
    {
        version: "26.09.04.03",
        date: "September 4, 2026",
        highlights: [
            "🗺️ Added a direct Shrinkwrap canvas tool: review a violet preview, refine it with exclusions or cuts, then explicitly draw the approved result as an inclusion boundary.",
            "🤝 Expanded the public concierge's verified knowledge of the .lsvz project archive, public documentation, subdomains, policy pages, and agent capabilities.",
            "✨ Replaced the browser, app, and shared-link icon assets with the updated LandSurv.ai mark.",
        ],
    },
    {
        version: "26.09.04.02",
        date: "September 4, 2026",
        highlights: [
            "🔑 Expanded bring-your-own-key support: connect compatible Google, OpenAI, xAI, or Anthropic API keys from Settings and use the corresponding available models directly from the browser.",
            "🌐 Refreshed public subdomain pages with a shared responsive layout and updated legal, security, compliance, roadmap, Civil 3D, RINEX, CACP, and AI Gateway content.",
            "📐 Improved contouring, steep-slope, and CAD automation workflows, including additional test coverage for generated terrain results.",
        ],
    },
    {
        version: "26.09.04.01",
        date: "September 4, 2026",
        highlights: [
            "🏠 Homepage card grid now shows only agent cards. Removed the non-agent shortcut cards (About LandSurv.ai, The .lsvz Format, Release Log, Technologies, Investor Inquiry, Claude AI Settings, Civil 3D Plugin) that previously appeared alongside the agents; those pages remain reachable from the header, footer, and Sidebar menu.",
        ],
    },
    {
        version: "26.09.03.03",
        date: "September 3, 2026",
        highlights: [
            "🔐 DevOps Console: fixed the \"Invalid token\" failure when creating an Enabling Key. DevOps session tokens are now signed stateless credentials verified by every backend instance, so authenticated actions work reliably even when Cloud Run routes requests across multiple instances. Expired sessions now return you to the login screen instead of showing a cryptic error.",
        ],
    },
    {
        version: "26.09.03.02",
        date: "September 3, 2026",
        highlights: [
            "✨ Welcome experience refreshed with a polished social-follow row, larger Facebook and YouTube links, and a subtle install action in the main action bar. Installation is now available only when requested; it no longer interrupts visitors with an automatic prompt.",
            "🤝 Public concierge answers are now grounded in the current public-site knowledge catalog, including the two available AI access paths: a personal Google Gemini API key or a purchased LandSurv Enabling Key.",
            "🌐 Refreshed the About and Legal public pages with modern layouts and current platform messaging. The public legal hub now focuses on professional-use guidance and policy links, without any public email or signature capture.",
            "🤖 The Agents directory now follows the DevOps-controlled enabled-agent configuration, so disabled agents are excluded from the catalog, its structured data, and listed subdomain links.",
        ],
    },
    {
        version: "26.09.03.01",
        date: "September 3, 2026",
        highlights: [
            "📘 Homepage header: replaced the visible \"Call Us\" button with a standard Facebook glyph linking to the LandSurv.ai Facebook page (opens in a new tab). The underlying call/voicemail handlers and modal remain wired up in the code for future use — only the visible button was swapped out.",
        ],
    },
    {
        version: "26.09.02.13",
        date: "September 2, 2026",
        highlights: [
            "🌐 Fixed the AI Gateway so it actually works in production — the gateway.landsurv.ai page and the point-editor relay now talk to the API same-origin through the frontend nginx proxy (`/api/`) instead of the standalone `landsurv-backend` `.run.app` URL, which is ingress-restricted and unreachable from browsers.",
            "🔧 `GatewaySubdomainPage.tsx` now calls the live boundary-closure tool via a relative `/api/grok/tools/...` path and renders the GPT Actions / Grok onboarding URLs using the page's own public origin (`window.location.origin`, e.g. https://gateway.landsurv.ai).",
            "🔌 The gateway relay WebSocket moved from `/gateway-relay` to `/api/gateway-relay` (both server `gatewayRelayWs.ts` and `gatewayRelayClient.ts`), so nginx's existing `/api/` proxy — which already supports WebSocket upgrades — forwards it with no nginx change; the client now connects same-origin (`wss://<host>/api/gateway-relay`).",
        ],
    },
    {
        version: "26.09.02.12",
        date: "September 2, 2026",
        highlights: [
            "🌐 New public page at gateway.landsurv.ai — a landing + functional hub for the LandSurv.ai AI Gateway. It explains what the gateway is, the Claude / ChatGPT / Grok integrations, and the Partial vs Full access tiers, all on one full-page subdomain route (registered under the existing `landingPageConfig` map).",
            "🧪 Live boundary-closure sandbox: the page calls the public partial-access tool endpoint (`POST /api/grok/tools/analyze_boundary_closure`) so visitors can run a real gateway compute tool anonymously, right in the browser (cross-origin allowed via the existing `*.landsurv.ai` CORS rule).",
            "🔌 Copy-paste onboarding for each platform — the GPT Actions OpenAPI spec URL, a Claude MCP config snippet, and the Grok endpoint details — so external assistant builders can wire up LandSurv.ai's tools without hunting through docs.",
        ],
    },
    {
        version: "26.09.02.11",
        date: "September 2, 2026",
        highlights: [
            "🤖 New AI Gateway: external assistants can now call LandSurv.ai's surveying tools through one shared tool registry — Claude Desktop/Projects (via a new MCP server, `npm run mcp`), ChatGPT (via `/api/gpt-actions` with an OpenAPI 3.1 spec and OAuth2 authorization-code + PKCE + refresh), and Grok (via `/api/grok`). A new non-streaming `/api/claude/tools` tool-use loop was added; the existing live SSE `/stream` path is untouched.",
            "📐 Extracted canonical, pure-math survey modules the gateway and app share — `backend/src/shared/deedMath.ts` (deed/property geometry, now re-exported by `services/DeedPropertyCalculations.ts`) and `backend/src/shared/cogo.ts` (traverse + closure). Tool schemas are projected per platform (Claude/OpenAI/Grok) from a single `agentTools` registry.",
            "🔀 Added a point-editor relay channel (`/gateway-relay` WebSocket) so gateway tool calls can drive the in-app Point Agent — the frontend relay client dispatches through the existing CACP bus. Wired into `App.tsx` and backend startup.",
            "🎛️ DevOps Console gained AI Gateway, Prompts, and Math Sandbox tabs — per-platform kill switches (enforced with 503s), editable system-instruction/prompt overrides, and a sandbox to exercise the shared survey math. Added `@modelcontextprotocol/sdk`; the gateway work ships with 51 new backend tests (`tsc` clean).",
            "🔔 Unified error reporting: component failures now always mirror to the header notification bell, and when the bell is out of scope (landing / subdomain / checkout pages, pre-mount init, or a React crash) they also raise the red floating error banner via a new root-level `GlobalErrorDialog`. A `NotificationScopeMarker` tracks whether the bell is mounted.",
            "🛎️ Notification center upgrades — per-row dismiss buttons, a \"Clear all\" action, HH:MM timestamps, de-duplication that bumps a repeat count instead of stacking rows, and optional auto-dismiss (new `dedupeKey` / `autoDismissMs` notification fields).",
            "⚠️ CadManager and agent panels now surface failures through the notification/error bus instead of raw `window.alert` (e.g. StandardsEditor text-style validation), via a shared `useMirrorError` hook and `reportError` reporter.",
            "🌳 Deterministic symbol-visibility command parser — plain-language chat like \"draw tree symbols\" or \"hide the fire hydrants\" now toggles symbol groups through a testable keyword matcher (no LLM in the loop, so it can't silently no-op), backed by a new `findMatchingSymbols` group resolver in the survey symbol library.",
            "🧰 Added a DevOps \"Starter Symbol Library\" builder tab for authoring the baked-in symbol pack from uploaded DXF glyphs (local-only authoring surface; nothing ships until the exported array is committed).",
            "📏 Linework now expands width-coded point chains (e.g. a `12 W` code) into left/right offset edges around the feature centerline, with centerline-code detection, and wires the expansion into the drawing canvas.",
        ],
    },
    {
        version: "26.09.02.10",
        date: "September 2, 2026",
        highlights: [
            "🚑 HOTFIX (same-day rollback of a 26.09.02.09 regression): DevOps 2FA login codes and every other transactional email were failing because the added `https://www.googleapis.com/auth/gmail.settings.sharing` scope had not yet been granted in Workspace domain-wide delegation, causing Google to reject the entire `jwtClient.authorize()` call and taking down the singleton `GmailApiService` — including 2FA code delivery.",
            "🛡️ `backend/src/utils/gmailApiService.ts` `initialize()` now attempts JWT authorization with `[gmail.send, gmail.metadata, gmail.settings.sharing]` first and, on failure, catches the error, logs a clear warning naming the missing scope, and retries with just `[gmail.send, gmail.metadata]`. A new `sharingScopeGranted` flag records which tier succeeded, and `ensureSendAsConfigured()` is only invoked when the sharing tier authorized.",
            "📬 `ensureSendAsConfigured()` now throws a self-explanatory \"grant this scope first\" error when `sharingScopeGranted` is false, so `POST /api/emails/campaign/register-send-as` returns actionable text instead of a cryptic Google-side failure. `listSendAs()` returns `[]` (rather than throwing) when the scope isn't granted, so the `/campaign/sent-recipients` panel keeps loading with an unverified identity strip.",
            "🔍 Added `isSharingScopeGranted()` accessor so future callers can cheaply distinguish \"scope not granted yet\" from \"identity not verified yet\". Once the Workspace admin grants the sharing scope, the next container cold start will authorize at the higher tier and auto-register the Send As identity on first send.",
        ],
    },
    {
        version: "26.09.02.09",
        date: "September 2, 2026",
        highlights: [
            "✉️ Email 2 sender identity is now registered as a verified Gmail Send As entry so recipients see the configured display name + address instead of Gmail rewriting the visible From to the mailbox owner — `GmailApiService.ensureSendAsConfigured()` fetches the current Send As list, patches the display name when out of sync, or creates a new `treatAsAlias: true` entry for the campaign sender. Same-domain addresses auto-verify; cross-domain addresses require a manual SMTP confirmation click.",
            "🔐 Added the `https://www.googleapis.com/auth/gmail.settings.sharing` scope to the service account JWT and wired it into the initialize flow as a best-effort call (failures are logged but don't break sending). The Workspace admin must grant this scope on the domain-wide-delegation client for the auto-registration to succeed — until then the visible From falls back to the mailbox owner.",
            "🔌 New `POST /api/emails/campaign/register-send-as` endpoint force-runs the Send As registration and returns the resulting `verificationStatus`; returns 502 with the raw Gmail error text when the sharing scope hasn't been granted so the panel can surface the exact issue. `GET /campaign/sent-recipients` now also returns `senderIdentityVerified`, `senderIdentityStatus`, and the full `sendAsIdentities` list (sendAs lookup failures are logged but do not break the recipient scan).",
            "📊 DevOps Email Campaign panel's Gmail status card now shows a colored sender-identity strip: green \"✓ verified\" when the Send As identity is accepted, or amber \"⚠ <status>\" with an inline explainer when not, plus a \"🔧 Register / re-check Send As identity\" button that hits the new endpoint and refreshes the Gmail scan afterwards.",
        ],
    },
    {
        version: "26.09.02.08",
        date: "September 2, 2026",
        highlights: [
            "✉️ Email 2 sends now carry a friendly \"LandSurv.ai Team\" display name and a `Reply-To: feedback@landsurv.ai` header — `GmailApiService` composes a full RFC 5322 From header (`\"LandSurv.ai Team\" <feedback@landsurv.ai>`) and a Reply-To header on every send, so most inbox clients render the campaign as coming from \"LandSurv.ai Team\" in the sender column and replies land at feedback@ regardless of what Gmail displays.",
            "🛠️ Display name and Reply-To are now configurable via new env vars `EMAIL_FROM_NAME` (default `LandSurv.ai Team`) and `EMAIL_REPLY_TO` (default `feedback@landsurv.ai`); non-ASCII display names are RFC 2047 base64-encoded so Gmail accepts them.",
            "📊 DevOps Email Campaign panel's Gmail status card now shows the full sender identity (`LandSurv.ai Team <feedback@landsurv.ai>`) and appends a `· Replies → feedback@landsurv.ai` suffix when Reply-To differs from the sender — surfaced through two new fields (`senderDisplayName`, `replyToEmail`) on the `/api/emails/campaign/sent-recipients` response.",
            "ℹ️ Note: because `feedback@landsurv.ai` is currently configured in Google Workspace as an alias/group of `admin@landsurv.ai`, Gmail rewrites the raw From address to `admin@landsurv.ai` on delivery — this cannot be overridden at the SMTP layer without a Workspace-side change (adding feedback@ as a verified \"Send Mail As\" for admin@, or provisioning feedback@ as a standalone user). The friendly display name + Reply-To are the code-side improvement that works regardless of that Workspace decision.",
        ],
    },
    {
        version: "26.09.02.07",
        date: "September 2, 2026",
        highlights: [
            "🔘 Fixed \"Turn Email 2 On\" showing the success banner while the panel's Automation status indicator kept displaying OFF — The DevOps Email Campaign toggle now updates the visible state immediately (by synthesizing a minimal `email2` status object when the initial status load hadn't populated yet) instead of silently discarding the update when `campaignStatus` was null.",
            "🩹 Fixed `GET /api/emails/campaign/status` returning 500 in production — Replaced the Firestore `where('campaign_id','==','email2').orderBy('sent_at','desc')` query (which required a composite index that doesn't exist in production) with a full-collection fetch plus client-side filter/sort. The `email_campaign_log` collection is one row per daily cron run, so a scan is fine, and this keeps the endpoint working without provisioning a Firestore index.",
        ],
    },
    {
        version: "26.09.02.06",
        date: "September 2, 2026",
        highlights: [
            "🔧 Fixed the GitHub-triggered Cloud Build pipeline for the frontend (`beta-landsurv-ai`) — Committed the two Civil Drafter context files (`components/CivilDrafterContextPanel.tsx` and `services/civilDrafterContextConfig.ts`) that `App.tsx` already imports but that had only existed in the local worktree, so auto-triggered builds no longer fail with `Could not resolve \"./components/CivilDrafterContextPanel.tsx\" from \"App.tsx\"`. No runtime/UI behavior change — the deployed revision already contained these files via a manual `gcloud builds submit`.",
        ],
    },
    {
        version: "26.09.02.05",
        date: "September 2, 2026",
        highlights: [
            "📬 Fixed the DevOps Email 2 panel's Gmail check failing with \"Metadata scope does not support 'q' parameter\" — Rewrote the Sent-folder scan to use `labelIds: ['SENT']` plus client-side `internalDate` filtering instead of a `q=in:sent after:...` search query, so it now works under the minimal `gmail.metadata` scope. Since Gmail returns Sent newest-first, pagination stops as soon as we cross the lookback window, and a per-scan message count is logged for visibility.",
            "✉️ Email 2 default sender is now `feedback@landsurv.ai` instead of `noreply@landsurv.ai` — Replies to the campaign email now land in a monitored inbox instead of being lost. The code default matches the deployed Cloud Run `EMAIL_FROM` env var so local/dev runs behave the same as production.",
        ],
    },
    {
        version: "26.09.02.04",
        date: "September 2, 2026",
        highlights: [
            "🗺️ Clearer ESRI contour errors when a publisher's ArcGIS service is offline — When a pinned ArcGIS Feature/Map Service (e.g. PASDA's PAMAP_Contours) responds with \"Service … not started\", the fetch now surfaces a plain-language message explaining that the source service is offline upstream, that it is not a landsurv.ai bug, and suggesting to retry shortly or switch to a different source via the Custom Service URL box.",
            "🔎 ESRI contour fetch now runs the service-info probe as an unconditional preflight — Upstream outages, auth failures, wrong URLs, and 5xx errors are now caught before the /query call instead of being hidden behind a silent try/catch and only surfacing later as an opaque relayed 500.",
            "🌐 ArcGIS error translator also covers auth failures (401 / \"not authorized\" / token required), 404 / \"not found\" (moved or renamed services), and generic 5xx server errors, so operators get an actionable message in each case instead of the raw upstream text.",
            "⏱️ ESRI contour error toasts now stay on screen for 20 seconds when the message is long or multi-line so operators have time to read the actionable text; short warnings still auto-dismiss on the original 7-second timer.",
        ],
    },
    {
        version: "26.09.02.03",
        date: "September 2, 2026",
        highlights: [
            "📬 Email 2 sends are now verifiable straight from Gmail — The DevOps Email Campaign panel opens a new Gmail status card that shows whether the sender inbox is reachable, which address is being read, and how many Email 2 messages have actually left the Sent folder within the configured lookback window.",
            "👥 Added an expandable per-recipient list — Operators can now see every address the Email 2 subject has been sent to and the timestamp of the first send, pulled live from the Gmail Sent folder (subject/recipient metadata only, never message bodies), with a Refresh from Gmail button and a last-scanned timestamp.",
            "📊 Analytics tab now surfaces the Gmail-verified total alongside the cron-run counts so the source-of-truth number is visible next to the automation metrics.",
            "🔌 Added `GET /api/emails/campaign/sent-recipients` — Returns per-recipient details on success and a clear `{ connected: false, error }` 502 on Gmail failure, giving the panel a real connection health probe instead of guessing from cron output.",
        ],
    },
    {
        version: "26.09.02.02",
        date: "September 2, 2026",
        highlights: [
            "📝 Fixed the Email 2 WYSIWYG editor rendering empty — The visual editor now imperatively syncs the loaded template HTML into the contentEditable div on mount, after preview load, and when switching from HTML back to Visual mode, so the current template is always visible instead of the placeholder.",
            "🔘 Fixed the “Turn Email 2 On” button silently doing nothing — Replaced the two-step inline confirmation with a simple confirm prompt that calls the automation endpoint directly, surfaces the actual HTTP status and response body on failure, and re-fetches campaign status after success.",
            "🔔 Added a visible status banner to the Email Campaign DevOps panel — Save template, seed test data, send test copy, and enable/disable automation now show success/error/info feedback directly in the panel instead of only logging to the browser console.",
        ],
    },
    {
        version: "26.09.02.01",
        date: "September 2, 2026",
        highlights: [
            "📧 Fixed daily follow-up eligibility — The Email 2 catch-up now considers everyone who recently signed the legal agreements or subscribed via the notification/newsletter forms, and hard-excludes anyone who has since unsubscribed.",
            "📬 Gmail is now the single source of truth for who has already received Email 2 — The daily cron and DevOps preview both read the Sent folder (subject/recipient metadata only, never message bodies) to decide who to skip, with a configurable lookback window. If Gmail can't be read the send is aborted rather than risking a duplicate.",
            "🧹 Retired the unused Email 1 and Email 3 flows — Removed the legacy Email 1/Email 3 endpoints, helpers, database idempotency tables, and shared types. The DevOps Email Campaign panel is now a single Email 2 workspace with Analytics and Testing tabs, and the test seed is trimmed to a single recent subscriber.",
        ],
    },
    {
        version: "26.09.01.01",
        date: "September 1, 2026",
        highlights: [
            "💾 Hardened .lsvz session save/load reliability — Session exports now retain the intended .lsvz identity, reopen correctly after save, and surface load/save failures more clearly instead of dropping users into a blank reset workspace.",
            "👋 Opening a file no longer re-triggers the welcome dialog — The welcome screen now stays out of the way once the user has entered an active workspace.",
            "📝 Added an advanced Save Session dialog — Users can now set a custom file name, author, and save note, plus optionally append the timestamp, job number, active agent, and author to the exported .lsvz filename.",
        ],
    },
    {
        version: "26.08.30.08",
        date: "August 30, 2026",
        highlights: [
            "🚀 Stripe checkout is generally available — Promoted both production billing services from the validated canary to unrestricted live checkout after confirming the real $5 payment, successful webhook processing, and exactly-once service fulfillment.",
        ],
    },
    {
        version: "26.08.30.07",
        date: "August 30, 2026",
        highlights: [
            "🛡️ Fixed live checkout reCAPTCHA execution — Replaced the invalid hyphenated checkout action with a supported action name in both the browser token request and backend verification, allowing Stripe checkout creation to proceed.",
        ],
    },
    {
        version: "26.08.30.06",
        date: "August 30, 2026",
        highlights: [
            "💳 Fixed anonymous service checkout — Incognito customers can now submit the email entered in the checkout modal and proceed directly to the supported Stripe bundle endpoint for service-only, compute-only, or combined purchases.",
            "🔒 Preserved live canary enforcement — Anonymous purchases remain protected by reCAPTCHA and the server-side canary allowlist, now supporting both `msersen@gmail.com` and `admin@landsurv.ai`.",
        ],
    },
    {
        version: "26.08.30.05",
        date: "August 30, 2026",
        highlights: [
            "💳 Fixed canary checkout availability — Billing configuration now advertises checkout whenever Stripe checkout is available, while purchase requests continue enforcing the canary email allowlist server-side.",
        ],
    },
    {
        version: "26.08.30.04",
        date: "August 30, 2026",
        highlights: [
            "💳 Stripe live-mode canary readiness — Added the seven validated live one-time prices for compute and service access, isolated and pinned production credentials, and restricted initial real checkout to the operator account before general release.",
            "🔐 Production checkout safeguards — Added matching reCAPTCHA v3 configuration across both billing-capable services and preserved strict rejection of known Stripe test/live credential mismatches while supporting Stripe's current live credential format.",
            "📨 Verified live fulfillment routing — Corrected the canonical webhook URL to the production endpoint and added a repeatable catalog reconciliation tool that validates live prices against the backend's authoritative amounts.",
            "📱 Fixed the mobile canvas bottom gap — Scroll-locked scene views now use the visual viewport height with a dynamic-viewport fallback, keeping pan and pinch gestures inside the canvas as browser toolbars change.",
        ],
    },
    {
        version: "26.08.30.03",
        date: "August 30, 2026",
        highlights: [
            "📱 Fixed large empty gap under the agent panel on phones — The app now sizes itself to the browser's actual visible area (visual viewport) and tracks it as the mobile address/tool bars show and hide, so the chat/agent panel fills the screen to the bottom instead of leaving dead space.",
            "📂 Point Editor now accepts multiple files and dropped folders — Upload or drag-and-drop several .csv/.txt point files at once, or an entire folder, and the points are parsed and combined into one session. Added a processing indicator and clearer messaging when no valid point files are found.",
            "📍 Point List button pulses instead of auto-opening — Entering the Point Editor or uploading points no longer forces the floating Point List panel open; the toolbar button now pulses pink to invite you to open it when you're ready.",
            "✂️ More reliable COGO Shrinkwrap — Re-running shrinkwrap on the same layer now refreshes the existing hull in place instead of stacking duplicate boundaries, always reopens the panel expanded (never as a stale collapsed chip), and clears orphaned hulls left over from a reload.",
            "🤝 Fixed agent actions that occasionally 'did nothing' — State-changing agent skills (like Shrinkwrap) are now always dispatched fresh and never served from cache, so a requested action always runs on screen instead of returning a stale success.",
            "✨ Refreshed landing and welcome copy — Replaced the rotating privacy tagline with a clear 'Agentic CAD built from the ground up, with you in mind' message and an AI-native toolkit subtitle.",
        ],
    },
    {
        version: "26.08.30.02",
        date: "August 30, 2026",
        highlights: [
            "✂️ Contour trimming to inclusion boundary — Downloaded ESRI REST contours are now clipped to the actual inclusion boundary shape, not just its bounding rectangle. Each returned contour segment is chained against the inclusion polygon in project coordinates, keeping only the portions inside and splitting segments cleanly at the boundary (elevations preserved).",
            "🔧 Fixed inclusion-mode EPSG false warning — The ESRI contour panel no longer reports a missing project projection/EPSG when one is actually selected. The inclusion-boundary download now unlocks correctly once a projection and boundary are set.",
        ],
    },
    {
        version: "26.08.30.01",
        date: "August 30, 2026",
        highlights: [
            "⚡ Gemini 3.7 Flash Model Standardization — Unified primary Gemini execution to Gemini 3.7 Flash across all frontend agent workflows, backend proxy routes, CAD Manager utilities, and live WebSocket endpoints. Legacy model references have been retired from active selectors and automatically migrate to Gemini 3.7 Flash.",
            "🧠 Auto Smart-Routing Optimization — Auto mode now routes lightweight fast agent tasks to Gemini 3.5 Flash Lite while steering high-reasoning complex agents to Gemini 3.7 Flash or user-selected Anthropic models. Sidebar displays clean 'Auto (Smart)' branding with direct quick settings access.",
            "⚙️ Context-Aware Model Settings — Model configuration popover now dynamically presents model-specific controls (Gemini 3 tuning, locked Claude configuration panels, or Auto multi-model routing breakdowns) based on current selection.",
            "🔒 Claude Fable 5 Per-Key Entitlement Control — Restricted Claude Fable 5 from public visibility by default. Added explicit entitlement management in the DevOps Console API Key Inventory (`model:claude-fable-5` permission) backed by server-side verification on `/api/claude/stream`.",
            "🧹 Unified Model UI Cleanup — Removed the experimental 'Gemini 3' controls button from the chat header across all agents; those tuning controls are now reachable only through context-aware model settings. Every agent follows the user's model settings (no hardcoded per-agent model overrides), and each chat response declares the model currently in use.",
        ],
    },
    {
        version: "26.08.22.1",
        date: "August 22, 2026",
        highlights: [
            "💡 AR Drafting Assistant Strategic Reframe — Shifted AR Agent from immersive-first MetaQuest concept to practical drafting copilot. New AR Drafting Assistant serves as spatial intelligence layer for real-time guidance: load project context from .lsvz, overlay GIS/survey/deed/plan data in XR, point/speak about features and receive AI guidance, approve actions routed through CACP to CAD pipeline. Integrates Android XR path for mobile/wearable spatial experiences with hands-free field use. Architectural documentation in `AR_DRAFTING_AGENT_CONCEPT.md` and `AR_DRAFTING_ASSISTANT_ENGINEERING_SPEC.md` establishes platform direction for heads-up collaborative drafting workflows.",
            "🛒 Enhanced checkout modal UX and accessibility — `components/ApiKeyOrPayModal.tsx` significantly expanded (369 insertions) with improved visual hierarchy, better error states, and streamlined payment flow. New `customerEmail` prop enables personalized purchase experience. Enhanced service status lookup with real-time expiration tracking. Improved form validation with pattern-based email validation. Better loading states and error recovery. Responsive design improvements for mobile checkout. Added accessibility attributes and clearer labeling for all form fields.",
            "💳 Billing infrastructure improvements — `backend/src/index.ts` enhanced with robust checkout endpoint validation and improved error handling. `backend/src/utils/apiKeys.ts` expanded with service access key generation and validation. New service access test suite (`backend/tests/serviceAccess.test.ts`) validates key lifecycle management. Improved idempotency handling for duplicate requests. Enhanced billing audit logging for compliance tracking.",
            "📋 Standards Compliance Agent Enhancements — `components/StandardsComplianceSummaryPanel.tsx` introduced with real-time standards verification summary display. Enhanced `services/geminiService.ts` with improved standards compliance checking and automated compliance report generation. Updated `types.ts` with new compliance data structures. `pages/DevOpsConsole.tsx` expanded with compliance monitoring and audit trails. Gemini integration now provides per-section compliance mapping with actionable guidance. New local RAG-grounded verification against project standards and regulatory requirements.",
            "🌟 Agent selection UX polish — `components/InitialAgentSelection.tsx` refined with improved visual feedback for checkout interactions. Better star animation rendering for constellation display. Improved CACP badge integration showing real-time agent communication status. Enhanced agent card styling with clearer purchase call-to-actions. Better mobile responsiveness for narrow viewports.",
            "🧪 Extended test coverage — `tests/components/ApiKeyOrPayModal.test.tsx` expanded (109 insertions) with comprehensive checkout flow testing. Service status lookup tests. Email validation tests. Billing config loading tests. Error state handling and recovery tests. Multi-plan selection validation.",
            "🚀 Cloud Build configuration updates — `cloudbuild-backend.yaml` refined with improved builder image selection and faster incremental builds. Enhanced secret management for billing infrastructure deployment.",
        ],
    },
    {
        version: "26.08.21.3",
        date: "August 21, 2026",
        highlights: [
            "🔍 LandSurv XR System Specification released — `landsurv-xr-system-spec.md` provides complete architectural blueprint for hybrid XR-CAD agentic system. Documents Level 3 (Goal-Oriented) AGS paradigm bridging real-time field data via smart glasses with high-fidelity CAD workstations. Defines dual-mode operations: Field Mode (egocentric perception with Google Glass and voice commands) and CAD Mode (local CAD generation with Civil 3D C3DMCP plugin). Full DGX Spark Interceptor architecture specification for local high-bandwidth sensory processing with NVIDIA Cosmos-Reason and Whisper. Complete message schemas, feedback mechanisms, and world-state persistence patterns documented for implementation reference.",
            "🔮 Smart Glass & XR Services Framework — New services enable real-time field-to-CAD synchronization: `services/googleGlassService.ts` manages smart glass connectivity and wearable device APIs. `services/glassCacpGateway.ts` implements local CACP gateway routing for field-side event processing. `services/vadEngine.ts` provides lightweight voice activity detection for field phones. `services/CoordinateVerificationGate.ts` gates high-risk coordinate alterations before CAD commit. `services/LocalDocumentRAG.ts` enables local RAG-grounded document verification against cached PDFs and GIS data.",
            "🔗 CACP Router & Schema infrastructure — `services/cacpRouter.ts` implements dynamic CACP message routing with priority queuing and delivery guarantees. `services/CacpSchema.ts` provides TypeScript schema validation for all CACP message types. Backend route `backend/src/routes/cacp.ts` implements server-side CACP event processing with state management. C# integration via `civil3d-client/CacpEventListener.cs` enables real-time CAD responses to field events.",
            "📱 Enhanced ARView with Glass Integration — `components/ARView.tsx` now integrates Google Glass service APIs and CACP gateway for real-time AR coordinate verification. Device capability detection supports both immersive-ar and immersive-vr modes. Dynamic session management for continuous streaming and gestural input.",
            "💾 LSVZ Persistence Enhancements — `services/LsvzPersistence.ts` expanded with world-state versioning, concurrent edit tracking, and automatic conflict resolution for multi-agent updates. Supports both local file-based and cloud-backed persistence. Schema version tracking enables seamless format evolution.",
            "🛠️ Bug Fixes & Stability — Fixed CACP activity log panel rendering for large event streams (200+ entries). Improved ARView initialization timing to prevent premature WebXR session start. Fixed DevOpsConsole tab rendering with proper conditional display. Enhanced C3D websocket error handling with exponential backoff. Improved AgentRegistry lifecycle management for agent hot-reload scenarios. Fixed index.html meta tags for proper CSP and device orientation hints.",
        ],
    },
    {
        version: "26.08.21.2",
        date: "August 21, 2026",
        highlights: [
            "🔑 Current key info panel in API key modal — `components/ApiKeyOrPayModal.tsx` now displays `CurrentKeyDetails` interface showing active key metadata (key type, ID, name, owner email, tier, access profile, creation date, expiration, activated timestamp, and permissions). Grid layout shows status badge, full key inspection panel with violet styling and expandable fields. Display is non-invasive—only shown when currentKeyDetails prop is provided. Supports both LandSurv service keys and Google API keys with source-specific messaging and behavior.",
            "👤 Auth route enhancements for key introspection — `backend/src/routes/auth.ts` improved token extraction with better JWT/API key prioritization. Supports both Bearer token and X-API-Key header formats. recordAPIKeyUsage now captures full request context (IP, endpoint, user agent) for audit logging. API key validation now properly extracts user ID and customer email for inclusion in key info panel.",
            "✏️ Key metadata normalization — API keys now include proper owner metadata (userId, customerEmail) and support optional tier/accessProfile fields for multi-tier billing (starter, growth, pro). Activation timestamp tracks when key was first used. Expiration date enables time-bound service access enforcement.",
            "✅ Bug fixes: API key modal state management — Fixed edge cases in form validation where empty key submissions could result in confusing error messages. Improved error handling for failed key validation with user-friendly messaging. Fixed copy-to-clipboard feedback on key info panel fields. Ensured form inputs clear on successful submission.",
            "🧪 Comprehensive test coverage — `tests/components/ApiKeyOrPayModal.test.tsx` expanded with tests for currentKeyDetails rendering, key info panel field visibility, status badge logic. Auth route tests validate JWT/API key extraction from multiple header formats.",
        ],
    },
    {
        version: "26.08.21.1",
        date: "August 21, 2026",
        highlights: [
            "🔄 CACP (Inter-Agent Communication Protocol) overhaul with activity logging — `services/InterAgentCommunication.ts` completely rewritten with comprehensive message lifecycle tracking (send/handler/response/error phases). New `components/CacpActivityLogPanel.tsx` provides DevOps console visibility into agent-to-agent traffic with filterable activity log, statistics dashboard, and JSON export for debugging. `CacpLogEntry` type captures every phase of message lifecycle including trace IDs for causal debugging across agent chains. Policy modes (soft/hard) enable activity validation and security gating. Ring buffer persists last 500 events to localStorage for forensic analysis.",
            "💾 Enhanced session persistence & backwards compatibility — `utils/sessionMigration.ts` expanded with comprehensive legacy session state handling, converting old boolean panel flags (isCanvasVisible, isPdfViewerVisible, etc.) to new panel reference system. `normalizePointLayers` reconciles legacy point layer format to current schema. `resolveLegacyVisualPanel` maps old UI state flags to new VisualPanel enum values. New migration tests (`__tests__/lsvz.migrations.test.ts`, `__tests__/lsvz.format.test.ts`) validate round-trip serialization and backwards-compatible load/save for sessions from any prior version.",
            "🖥️ Activity indicator improvements — `components/CacpActivityIndicator.tsx` now shows real-time agent communication status with phase-specific styling and latency metrics. `CacpBadge.tsx` enhanced with status indicators for multiple concurrent agent operations. Activity panel display scales from single-digit to hundreds of agents without performance degradation.",
            "⚙️ Session service refactoring — `services/sessionService.ts` simplified from 89 lines to 78 lines (while adding functionality) through better separation of concerns. Save/load operations now include version tracking and explicit migration dispatch. `App.tsx` session lifecycle improvements ensure proper save-on-unload behavior across all routes.",
            "🔍 AppStateContext updates — Added session version tracking and migration hints to enable proactive version management. DevOpsConsole expanded with CACP activity monitoring tab for real-time inter-agent visibility.",
        ],
    },
    {
        version: "26.08.20.1",
        date: "August 20, 2026",
        highlights: [
            "🔐 API key custody encryption (AES-256-GCM) — `backend/src/utils/apiKeyCustody.ts` provides secure storage for sensitive API keys in regulated environments. Keys are encrypted at rest with randomly-generated initialization vectors (IVs) and HMAC authentication tags, protecting against tampering and unauthorized access. Encryption version tracking enables seamless key rotation as security standards evolve. Supports both online (application-managed) and offline (HSM/Key Management Service) key derivation patterns for compliance with finance, healthcare, and government security frameworks.",
            "📧 Purchase confirmation email system — `backend/src/utils/purchaseConfirmationEmail.ts` generates rich HTML invoice-style emails for all purchase types: compute credit packages (1K, 5K, 10K units) and service plans (1M, 3M, 6M, 1Y). Confirmation emails include itemized receipts, Enabling Key visibility for service plans, payment method summary, and next-steps guidance. Template formatting supports personalization, renewal indicators, and call-to-action links for account management.",
            "🛠️ Enhanced DevOps console with billing controls — `pages/DevOpsConsole.tsx` now includes comprehensive billing management: service access panel (view/extend/renew user service plans), billing analytics (cost attribution by user and operation type), manual compute credit grants for testing/support, and purchase history reports. Tabbed interface separates API keys, service access, campaigns, and billing functions for streamlined admin workflows. Real-time cost aggregation enables per-customer ROI analysis and usage trend identification.",
            "📊 Improved checkout flow with purchase details — `pages/CheckoutPages.tsx` enhanced success page displays purchase confirmation summary, Enabling Key delivery for service plans, and clear next steps. CSS styling (`CheckoutPages.css`) refined for mobile-optimized receipt display with proper icon/typography hierarchy.",
        ],
    },
    {
        version: "26.08.16.2",
        date: "August 16, 2026",
        highlights: [
            "🐛 Minor patches and stability fixes — Billing routes enhanced with improved error handling and transaction logging. DevOps console auth refined for service access token validation. API key lifecycle management improved with better expiration tracking. Usage metrics calculations optimized for accurate per-operation cost attribution. Auth endpoint fixes for subscription status queries. Service access token generation now includes expiration metadata for billing compliance. Email campaign test suite expanded with segmentation boundary cases.",
        ],
    },
    {
        version: "26.08.16.1",
        date: "August 16, 2026",
        highlights: [
            "💳 Complete Stripe billing integration — `backend/src/utils/stripe.ts`, `backend/src/utils/stripeWebhookProcessor.ts`, and `backend/src/utils/billingCheckout.ts` implement end-to-end payment processing. Webhook security uses HMAC signature verification; event deduplication via Firestore tracking prevents double-billing. Safe redirect URLs and idempotency keys protect against common billing vulnerabilities. `POST /api/stripe/create-checkout-session` handles one-time compute credit purchases (1K, 5K, 10K units); `POST /api/billing/purchase-service` handles recurring service plans (1M, 3M, 6M, 1Y). All transactions are PCI-DSS compliant via Stripe tokenization.",
            "💰 Compute credit system with dynamic pricing — `backend/src/utils/computeCosts.ts` calculates per-operation costs based on agent type, model selection, and input complexity. `backend/src/utils/usageMetrics.ts` tracks and deducts compute units in real-time; `POST /api/stripe/subscription-status` queries available balance and service plan expiration. Credits are non-refundable, non-transferable, and tracked per API key with audit logging. Compute-intensive operations (Civil Drafter with Gemini 3.7, large boundary processing) cost more than quick queries; cost differences incentivize efficient usage patterns.",
            "📊 Telemetry-driven billing analytics — `backend/src/utils/telemetry.ts` middleware logs every request with category (request, usage, billing, auth, admin, system), endpoint, method, status code, duration, and compute units consumed. `GET /api/devops/telemetry-summary` returns aggregated costs by agent type and operation type (5 user-configurable windows: 1d, 7d, 30d, 90d, 365d). Cost attribution enables per-team billing, ROI analysis, and fraud detection. Telemetry data persists in PostgreSQL with 90-day retention for compliance audit trails.",
            "📧 Enhanced email campaign system with subscriber segmentation — `backend/src/middleware/track-access.ts` now tracks email campaign delivery status and API key purchase correlation. Email 1 targets legal-agreement signers with onboarding; Email 2 (automated daily via Cloud Scheduler) targets newly active subscribers; Email 3 targets users with active API keys and recent usage. Campaign segmentation queries run on indexed email/timestamp columns and complete in <100ms for million-user scale. Bounce/unsubscribe handling integrated with Stripe webhook events.",
            "🎯 Service plan enablement via email — `backend/src/routes/index.ts` `POST /api/billing/purchase-service` endpoint fulfillment calls `backend/src/utils/apiKeys.ts` `grantServiceAccess()` which generates time-bound Enabling Keys mailed to customers. Service access removes the free 4-hour pause and provides priority execution slots. Enabling Keys auto-attach to subsequent compute purchases and renewals without requiring re-purchase. Email template includes key visibility controls and renewal instructions.",
            "📱 Frontend pricing UI — `components/ApiKeyOrPayModal.tsx` unified modal for API key selection + billing checkout; `components/UsageDashboardPanel.tsx` displays available credits, service plan expiration, and cost-per-operation breakdown. `hooks/useComputeCredits.ts` manages credit lifecycle (purchase, check balance, apply to operations). `pages/DevOpsConsole.tsx` admin view for usage analytics by user, billing events by type, and revenue trends. `components/EmailCampaignPanel.tsx` three-tab dashboard for campaign status, delivery logs, and segmentation counts.",
            "🔐 Billing security & compliance — Rate limiting: 30/min on checkout endpoints, 60/min on billing routes. Idempotency keys prevent duplicate charges from network retries. Firestore-backed webhook event deduplication ensures exactly-once delivery fulfillment. All sensitive billing operations log to Cloud Audit Logs for FedRAMP/SOC2 compliance. PII is masked in telemetry (email last 4 chars only). Stripe webhook signatures verified with SHA256-HMAC before processing.",
        ],
    },
    {
        version: "26.08.14.1",
        date: "August 14, 2026",
        highlights: [
            "🛡️ Google Model Armor for adversarial robustness — Integrated Google's Model Armor security layer to protect against prompt injection attacks, jailbreak attempts, and adversarial inputs across all AI agents. `services/geminiService.ts` now routes all model requests through Model Armor pre-processing and post-validation, detecting malicious patterns before they reach Gemini models. The security layer automatically sanitizes user inputs, validates agent outputs, and flags suspicious request sequences. Provides defense-in-depth for Civil Drafter, Boundary Agent, Standards Compliance Agent, and all user-facing LLM interactions while maintaining transparent operation and full model capability.",
        ],
    },
    {
        version: "26.08.13.1",
        date: "August 13, 2026",
        highlights: [
            "🧠 Gemini 3.7 Flash model upgrade — All complex agents and Auto high-thinking workflows now default to Gemini 3.7 Flash, the latest high-reasoning model with improved reasoning depth and faster inference. `services/geminiService.ts` routes Civil Drafter, Boundary Agent, Standards Compliance Agent, and all complex multi-step workflows to Gemini 3.7 Flash. Fallback options include Gemini 3.7 Flash-Lite (faster, lower-cost alternative), Gemini 3.1 Pro, and Claude Fable 5. Single-turn queries and quick tasks continue using Gemini 2.5 Flash for optimal speed and cost efficiency. Model selection is configurable per-agent in settings without requiring code changes.",
        ],
    },
    {
        version: "26.08.10.2",
        date: "August 10, 2026",
        highlights: [
            "📧 Auto Mailer email campaign system with three-tier segmented follow-ups — `backend/src/routes/emails.ts` implements three-stage automated email campaigns: Email 1 (one-time manual) targets all legal-agreement signers with onboarding; Email 2 (daily automated) targets newly submitted subscribers with tips/feature updates; Email 3 (high-value leads) targets users with active API keys with advanced features and success stories. `backend/src/middleware/track-access.ts` tracks last-access timestamps and API key activity with hourly batch updates to avoid database thrashing. Campaign templates are rich HTML with call-to-action links, unsubscribe options, and optional personalization. DevOps-only endpoints control campaign triggering and can manually override send criteria.",
            "📊 Email campaign management UI — `components/EmailCampaignPanel.tsx` provides comprehensive campaign status dashboard for all three email tiers (Email 1, Email 2, Email 3), delivery logs, bounce/unsubscribe tracking, and per-user campaign history. Admins can view segmentation counts (legal signers, newly subscribed, active API key users), preview templates, trigger campaigns on-demand, and adjust send timing windows without code changes. Email 3 targeting shows conversion probability based on API usage patterns.",
            "📨 Notification subscriber tracking database — `backend/src/utils/database.ts` enhanced with notification_subscribers table tracking email addresses, opt-in/unsubscribe status, last_accessed_at timestamp, Email 1 sent flag, campaign history. Indexes on email and timestamps enable fast segmentation queries for million-user scale.",
        ],
    },
    {
        version: "26.08.10.1",
        date: "August 10, 2026",
        highlights: [
            "💰 Container registry scanning cost reduction (on-demand scanning) — `cloudbuild-ondemand-scan.yaml` replaces always-on container scanning with on-demand vulnerability scanning triggered only for production deployments. Scanning now runs as a discrete CloudBuild step rather than continuous background scans, reducing GCP Container Analysis and Artifact Registry costs by ~80%. Scan results are cached per image digest and only re-scanned when container content changes, eliminating redundant analysis. Estimated savings: $30-50/month.",
            "📧 Google Workspace Gmail API integration for transactional email — `backend/src/utils/gmailApiService.ts` now sends all application email (contact forms, password resets, C3D QR auth, legal signature docs) via Gmail API with service-account domain-wide delegation instead of SMTP relay. This eliminates dependency on third-party email services, improves deliverability, enables domain authentication (SPF/DKIM/DMARC), and provides native GCP audit logging. `backend/src/routes/contact.ts`, `backend/src/routes/demo.ts`, `backend/src/routes/legal.ts`, and `backend/src/routes/c3d-qr-auth.ts` now route through Gmail API with automatic retry and templating support.",
            "🔐 reCAPTCHA-based security hardening (2FA removal alternative) — `backend/src/middleware/recaptcha.ts` adds reCAPTCHA v3 bot-detection middleware to sensitive endpoints (login, key generation, admin actions). 2FA was replaced with reCAPTCHA scoring for transparent bot detection without breaking user workflows. DevOps console login now requires reCAPTCHA score ≥0.5 and can optionally escalate unconfident requests to browser-based interactive verification.",
            "⚡ Backend right-sizing for cost efficiency — Cloud Run services right-sized across all deployments: max-instances reduced from 20 → 5 (saves $50-100/month), CPU boost disabled, memory optimizations applied. Frontend memory reduced 512Mi → 256Mi (saves $5-10/month). On-demand minimum instances enabled for CLAW browser automation and other non-critical services. Phase 1 cost reduction estimated at $120-220/month (~30-40% reduction).",
            "🔍 Hardened backend startup validation & security scanning — New `backend-startup-validation.test.ts` validates container integrity, dependency signatures, and runtime security posture on service startup. Security scanning scripts in `scripts/security/` provide retention policy enforcement (GCR image cleanup), production scan-gate validation, and compliance audit logging.",
        ],
    },
    {
        version: "26.08.08.1",
        date: "August 8, 2026",
        highlights: [
            "📐 Deed closure solver & bearing alternatives system — `utils/closureSolver.ts` now automatically resolves incomplete boundary traverses by inverse-solving missing bearing/distance data from call geometry. `utils/closureAlternatives.ts` analyzes quadrant bearing variants and produces ranked alternatives ranked by misclosure improvement percentage. Each alternative includes precision denominator calculation, right-angle deviation analysis, and confidence scoring so surveyors can quickly evaluate closure-fixing options without manual recalculation.",
            "🧪 Comprehensive closure algorithm test suite — New test files `tests/closureSolver.test.ts`, `tests/closureAlternatives.test.ts`, and `tests/deedClosureReview.test.ts` provide 50+ test cases covering single-leg traverse fixes, multi-leg closure patterns, curve-bearing recovery, and edge cases (zero distance, near-parallel sides, opposite-side geometry). Test coverage includes precision denomination validation and worst-case closure scenarios.",
            "🎯 Deed closure visual review interface — Boundary Editor now displays closure improvement indicators during deed review, with color-coded misclosure status (green: acceptable, yellow: marginal, red: requires correction). Surveyors can directly apply solver recommendations or manually select bearing alternatives from the closure panel without disrupting the main boundary workflow.",
        ],
    },
    {
        version: "26.08.07.2",
        date: "August 8, 2026",
        highlights: [
            "🐛 App component stability & rendering fixes — `App.tsx` underwent comprehensive refactoring to improve component lifecycle management, state synchronization, and error boundary handling. Fixed race conditions in agent initialization, improved modal/overlay stacking behavior, and optimized re-render performance. All authenticated paths now properly handle session state transitions without UI flickering or duplicate renders.",
            "🔐 API Key Modal UX refinements — `components/ApiKeyModal.tsx` and `components/ApiKeyOrPayModal.tsx` now provide clearer key visibility controls, improved copy-to-clipboard feedback, and better error messaging for key validation failures. Scope indicators are now color-coded (read-only: blue, full-access: red, connector: green) for quick visual identification.",
            "🛡️ App Lock Overlay improvements — `components/AppLockOverlay.tsx` now includes proper timeout handling, cleanup on unmount, and improved accessibility for locked-screen interactions. Lock status is now visually persistent and properly dismissible without losing application state.",
            "🚀 DevOps Console key management expansion — `pages/DevOpsConsole.tsx` expanded with comprehensive API key lifecycle management (view, revoke, rotate, audit trail). New tabbed interface separates key generation, active keys, and security event logs. Added bulk-key operations and export functionality for key audit compliance.",
            "📋 Environment configuration & deployment documentation — Added `ENVIRONMENT_CONFIG_MATRIX.md`, `PHASE1_QUICK_START.md`, `PHASE1_EXECUTION_GUIDE.md`, `PHASE1_CHECKLIST.md`, and `PHASE1_GCP_SETUP.ps1` to provide comprehensive deployment infrastructure guidance, multi-region configuration patterns, and GCP setup automation for new deployment environments.",
        ],
    },
    {
        version: "26.08.07.1",
        date: "August 7, 2026",
        highlights: [
            "🔑 DevOps API key generation console — `backend/src/routes/devops.ts` now includes POST `/api/devops/apikeys/generate` endpoint allowing admins to create new API keys directly within the DevOps console without database access or backend restarts. The key-generation interface (`components/DevOpsKeyPanel.tsx`) supports configurable scopes (read-only, full-access, C3D-connector, boundary-agent), expiration policies, and optional per-client rate-limit overrides. Generated keys are immediately usable for authentication and appear in the API key management panel with creation timestamp and last-access audit trail.",
            "🚁 Drone Agent for UAV mission planning — New Drone Agent (`services/droneProcessingService.ts`) enables mission planning, flight path optimization, and automated image processing for UAV-captured survey imagery. The agent integrates with `components/DroneProcessingPanel.tsx` for real-time mission coordination and supports georeferenced image ingestion, orthophoto stitching, and anomaly detection on captured imagery. Dedicated `cloudbuild-drone-agent.yaml` pipeline enables independent deployment scaling for compute-heavy drone processing workflows.",
        ],
    },
    {
        version: "26.08.06.2",
        date: "August 6, 2026",
        highlights: [
            "✅ Standards Compliance Agent & intelligent pre-submission validation — `services/standardsComplianceAgent.ts` now provides comprehensive professional standards validation across ALTA/ACSM specifications, state-specific regulations, and liability guidelines. The agent performs automated pre-submission checks on survey operations, deeds, and CAD outputs; flags non-compliant geometry, attributes, and metadata; and delivers actionable remediation guidance. Integration with the new `standards.landsurv.ai` subdomain ensures compliance rules stay current. `components/StandardsCompliancePanel.tsx` surfaces detailed compliance reports with risk assessment and specific correction recommendations.",
            "🖼️ Raster imagery support for Boundary Deed Reader — `components/BoundaryDeedPanel.tsx` now accepts GeoTIFF, orthophoto, and deed scan uploads directly alongside vector deed inputs. The enhanced Boundary Agent deed-reader preprocessor performs vision-based linework extraction from raster imagery, auto-georeferencing when available, and intelligent fusion with vector deed data. This enables high-accuracy boundary reconstruction on historical deeds, poor-quality scans, and complex overlapping parcels without manual redrafting.",
            "🏢 Public standards compliance portal at standards.landsurv.ai — New dedicated subdomain provides ALTA/ACSM documentation, state-specific checklists, and current AI validation rule sets. The Standards Compliance Agent queries this endpoint for active compliance frameworks, field teams reference it for standardized requirements, and the system auto-syncs rule updates across all deployed instances without service interruption.",
        ],
    },
    {
        version: "26.08.06.1",
        date: "August 6, 2026",
        highlights: [
            "🎨 Misclosure coloring for Boundary Deed Agent — `services/boundaryDeedAgent.ts` now color-codes misclosure vectors in the final deed output: green for closures within tolerance, yellow for marginal closures requiring review, and red for significant closures. The `components/DeedViewer.tsx` viewport displays color-coded misclosure indicators with magnitude labels, enabling quick visual QA of deed accuracy before finalization.",
        ],
    },
    {
        version: "26.08.05.1",
        date: "August 5, 2026",
        highlights: [
            "💰 Cost reduction & egress optimization — cloud deployment configurations now include VPC Service Controls perimeter isolation, private GCP service endpoints, and intelligent request routing to eliminate cross-zone/cross-region egress charges. Vertex AI, Firestore, and Cloud Storage traffic now flows through private IP paths, reducing per-GB external egress costs by ~70% while improving latency.",
            "🚫 Traffic isolation hardening — `cloudbuild.yaml`, `cloudbuild-backend.yaml`, and backend service VPC peering were updated to enforce intra-VPC routing for all data connectors (Parcel GIS services, FEMA flood, SSURGO soils, NSI structures). External API calls remain internet-routed but internal GCP-to-GCP communication is now completely isolated, reducing attack surface and eliminating unintended cross-region traffic charges.",
            "📊 Monitoring & observability expanded — new Cloud Monitoring dashboards and log queries track egress volumes, VPC Service Controls violations, and per-connector latency so cost reduction impact and traffic isolation effectiveness are continuously audited.",
        ],
    },
    {
        version: "26.08.03.1",
        date: "August 3, 2026",
        highlights: [
            "🤖 Claude Opus 5 and Sonnet 5 wired up — `services/claudeConfig.ts`, `components/ClaudeSettingsPanel.tsx`, and `App.tsx` now support Claude Opus 5 and Claude Sonnet 5 (default) alongside Claude Fable 5, with full configuration routing through `backend/src/routes/claude.ts` via Google Vertex AI.",
            "🏗️ CAD Manager defaults load on app initialization — `CadManagerContext` now auto-loads default CAD standards (DEED → L-DEED-BOUNDARY, INCL → L-INCLUSION, EXCL → L-EXCLUSION, BRKL → L-BREAKLINE) at app startup via `cad_ensure_default_layers`, eliminating the need for manual layer creation before drafting.",
            "🛣️ Civil Drafter Auto Draft contextual road drafting — `utils/autoDraftOrchestrator.ts` now builds road-specific context blocks using existing parcel/street data and zoning inputs to guide the Civil Drafter model toward more accurate road geometry, centerline placement, and feature classification.",
        ],
    },
    {
        version: "26.08.02.1",
        date: "August 2, 2026",
        highlights: [
            "🚀 Gemini 3.6 upgrade — `services/geminiService.ts` now routes all Gemini agents to Gemini 3.6 (replacing Gemini 3.5), improving model quality and latency across drafting, boundary analysis, and all CACP-integrated workflows.",
        ],
    },
    {
        version: "26.07.16.1",
        date: "July 16, 2026",
        highlights: [
            "🩹 Gemini 3 \"Publisher Model not found\" 404 fixed — `services/geminiService.ts` now maps the friendly UI aliases (e.g. `gemini-3.1-pro`, `gemini-3.5-flash`) to the real Vertex preview publisher IDs before dispatching, so Gemini 3.x agents connect instead of erroring out.",
            "🌊 Civil Drafter stream/channel linework overhaul — the Civil Drafter now emits classified `chains` (grouping existing points by feature/bank/bench) and lets the host order them along the channel axis, eliminating the cross-channel \"sawtooth\" on streams, ditches, and benched banks; new `utils/linework.ts` performs the deterministic ordering with test coverage.",
            "🛟 CAD Manager standards generation is more resilient — `backend/src/routes/cad-manager.ts` retries across a Gemini model sequence (2.5 Flash → Flash-Lite → Pro) on model-availability/permission errors instead of failing the whole request.",
            "⬇️ Connector DLL bundle download — `backend/src/routes/downloads.ts` and `pages/ConnectorDownload.tsx` add an advanced \".dll bundle (ZIP)\" option for manual NETLOAD alongside the MSI installer.",
        ],
    },
    {
        version: "26.07.14.2",
        date: "July 14, 2026",
        highlights: [
            "🧠 Civil Drafter model routing restored — `services/geminiService.ts` now routes the Civil Drafter back to the selected high-thinking model (e.g. Gemini 3.5 Flash) so the model selector and Gemini 3 controls apply, while still capping its thinking budget/level and lifting `maxOutputTokens` on both the direct and Vertex paths so large drawings don't truncate.",
            "🏷️ Chat interface now declares the active model — `components/ChatInterface.tsx` / `App.tsx` show a model badge in the chat header (e.g. \"Auto · Gemini 3.5 Flash\") so it's always clear which model an agent is running; switching the Auto high-thinking model now updates the display immediately.",
            "🧪 Gemini 3 dialog is back with an explicit toggle — a \"Gemini 3\" button in the chat header opens/closes the experimental Gemini 3 controls panel (which also auto-opens when an eligible agent runs a Gemini 3.x model), and the panel now has a close button.",
        ],
    },
    {
        version: "26.07.14.1",
        date: "July 14, 2026",
        highlights: [
            "🐛 Civil Drafter large-drawing truncation fix — `services/geminiService.ts` no longer routes the Civil Drafter agent to a high-thinking model and now caps its native thinking budget while raising `maxOutputTokens`, so big linework outputs (hundreds of points/lines) finish cleanly instead of running out of output tokens mid-drawing.",
        ],
    },
    {
        version: "26.07.13.1",
        date: "July 13, 2026",
        highlights: [
            "🤖 Auto Draft and vision pass extended — `utils/autoDraftOrchestrator.ts`, `utils/civilDrafterVision.ts`, and `App.tsx` received another major refinement pass for staged drafting behavior, imagery/vision handling, and end-to-end output consistency.",
            "🔌 Vertex and backend routing hardening — `backend/src/routes/vertex.ts`, `services/vertexChat.ts`, and `backend/src/index.ts` were updated to improve provider routing reliability and backend integration stability.",
            "🔐 C3D QR auth and compliance surface updates — `backend/src/routes/c3d-qr-auth.ts` plus `components/ComplianceSubdomainPage.tsx` include reliability/documentation refinements aligned with the latest security and trust-center flow.",
            "🧩 UI/runtime alignment and guardrails — `components/ChatInterface.tsx`, `components/Gemini3ControlsPanel.tsx`, `components/SettingsPage.tsx`, `components/Sidebar.tsx`, and `services/geminiService.ts` were synchronized with the updated model/runtime behavior; this release also includes API-key modal guard additions (`utils/apiKeyModalGuard.ts`) and related tests.",
        ],
    },
    {
        version: "26.07.11.2",
        date: "July 11, 2026",
        highlights: [
            "🛰️ Map and aerial imagery pipeline upgrade — `services/staticMapsService.ts`, `backend/src/routes/maps.ts`, and `App.tsx` now support a more robust NAIP/static-map fallback path, including larger imagery fetches and safer rate limiting for the free aerial source.",
            "👁️ Civil Drafter vision handoff refinement — `App.tsx` and `utils/civilDrafterVision.ts` now cache the survey-extent aerial reference and attach it to draw requests, while the Civil Drafter Gimbal HUD is gated behind the developer/testing setting to reduce accidental noise in normal use.",
            "🎛️ Model and drafting defaults aligned — `services/geminiService.ts`, `components/SettingsPage.tsx`, `components/Sidebar.tsx`, and `utils/sessionDefaults.ts` were updated so the current high-thinking/model-selection behavior stays in sync across the UI and session defaults.",
            "🧱 Canvas, state, and Auto Draft follow-on fixes — `components/DrawingCanvas.tsx`, `contexts/AppStateContext.tsx`, `types.ts`, `utils/autoDraftOrchestrator.ts`, and related tests were adjusted to keep terrain/drafting data flow stable after the recent integrations.",
        ],
    },
    {
        version: "26.07.11.1",
        date: "July 11, 2026",
        highlights: [
            "🗺️ Static map retrieval robustness pass — updates across `services/staticMapsService.ts`, `backend/src/routes/maps.ts`, and `tests/staticMapsService.test.ts` improve map-provider fallback behavior and align backend-assisted map responses with current Auto Draft and GIS expectations.",
            "🧠 Auto Draft orchestration and shared-state alignment — `utils/autoDraftOrchestrator.ts`, `contexts/AppStateContext.tsx`, and `types.ts` were refined so drafted data flow and persisted state contracts remain consistent across UI surfaces.",
            "🖥️ Canvas and settings workflow refinements — `components/DrawingCanvas.tsx`, `components/SettingsPage.tsx`, and `App.tsx` received follow-on UX/compatibility adjustments to keep terrain/drafting tools and configuration behavior synchronized after recent integrations.",
            "✅ Regression signal updates — latest static-map test output and related implementation adjustments were included in this release pass to reflect the currently validated runtime path.",
        ],
    },
    {
        version: "26.07.10.6",
        date: "July 10, 2026",
        highlights: [
            "🧠 Auto Draft unknown-code workflow expanded — `components/CadManager/AutoDraftPanel.tsx` now supports per-code enable/disable controls, optional typed descriptions for fuzzy symbol matching, and direct suggestion apply actions so field crews can recover ambiguous codes without leaving the run flow.",
            "🏗️ Building-confidence quality pass in orchestrator — `utils/autoDraftOrchestrator.ts` adds optional building review-checklist behavior with confidence-tagging instructions (including low-confidence marker conventions) so generated structures can be reviewed consistently after draft output.",
            "📐 Steep-slope canonical interface integration — `App.tsx` now registers Auto Draft steep-slope runs into shared run state, exposes them in the standard steep-slope report/tools pathways, and wires the Steep Slope Agent floating panel/report access so generated slope data is manipulable via normal dialogs.",
            "🛠️ UI compatibility and minor component refinements — follow-on edits in `components/AnnotationCategoryPanel.tsx` and `components/ParcelPanel.tsx` were included with this release pass to keep adjacent agent dialogs aligned with the current visual/tooling workflow.",
        ],
    },
    {
        version: "26.07.10.5",
        date: "July 10, 2026",
        highlights: [
            "🐛 Auto Draft location-input reliability fix — `components/CadManager/AutoDraftPanel.tsx` now uses explicit state/county/municipality selection backed by jurisdiction datasets, replacing the fragile freeform location parse path that caused inconsistent context resolution.",
            "🗺️ Deterministic terrain pipeline wiring — `utils/autoDraftOrchestrator.ts` and `App.tsx` now support explicit contour mode selection (GIS / points / none) plus optional steep-slope generation, with dedicated orchestration phases and clearer completion/skipped reporting.",
            "🌱 Soil-overlay drafting fix — Auto Draft now supports drawing SSURGO soil boundaries to canvas when requested, improving downstream drafting context and reducing missing-linework outcomes during one-shot runs.",
            "📷 Vision handoff stabilization — `App.tsx` now queues Auto Draft map imagery and reliably injects it into the next Civil Drafter message as inline vision parts, fixing prior cases where imagery context could be dropped between panel run and model call.",
        ],
    },
    {
        version: "26.07.10.4",
        date: "July 10, 2026",
        highlights: [
            "🧠 Model routing refresh — `services/geminiService.ts` now keeps `gemini-3.5-flash` as the default high-thinking path for complex agents, while preserving `claude-fable-5` as the configurable alternative in Auto mode.",
            "⚙️ App-level model selector expansion — `App.tsx` updates the available model catalog and Auto-mode plumbing so users can choose the newly added model family directly instead of the prior provider alias flow.",
            "🧭 Settings and sidebar model UX refresh — `components/SettingsPage.tsx` and `components/Sidebar.tsx` now expose explicit model labels and a dedicated Auto high-thinking picker, improving discoverability/control of new model additions.",
            "🔌 Supporting integration adjustments — `components/ChatInterface.tsx` and `api/index.js` were aligned with the updated model-routing/user-flow behavior to keep frontend and API surfaces consistent for this release.",
        ],
    },
    {
        version: "26.07.10.3",
        date: "July 10, 2026",
        highlights: [
            "🐛 Auto Draft orchestration bug-fix pass — `utils/autoDraftOrchestrator.ts` and `App.tsx` were updated to stabilize drafting execution/state transitions and reduce failure-prone edge cases during end-to-end draft runs.",
            "🧰 CAD Manager drafting flow fixes — `components/CadManager/AutoDraftPanel.tsx` received targeted bug fixes to improve run controls, status behavior, and user feedback consistency while drafting jobs are active.",
            "🧭 Navigation-state sync fix — `components/Sidebar.tsx` updates align UI navigation behavior with the latest drafting session state so route/section transitions remain consistent during bug-fix scenarios.",
        ],
    },
    {
        version: "26.07.10.2",
        date: "July 10, 2026",
        highlights: [
            "🧠 Major Auto Draft orchestration expansion — `utils/autoDraftOrchestrator.ts` received another large capability pass to improve multi-source drafting workflow control, staging logic, and execution consistency for end-to-end draft generation.",
            "🤖 Model/runtime integration updates in drafting flow — `services/geminiService.ts`, `backend/src/routes/claude.ts`, and `App.tsx` were refined to better coordinate model-backed drafting actions and request routing behavior across frontend and backend boundaries.",
            "🗺️ Maps pipeline and configuration hardening — `backend/src/routes/maps.ts` plus `backend/.env.example` were updated to strengthen map-service proxy/config behavior and make required environment setup clearer for deployment/runtime parity.",
            "🛠️ Drafting UX/navigation refinements — `components/CadManager/AutoDraftPanel.tsx` and `components/Sidebar.tsx` were adjusted to improve discoverability and control flow around the upgraded major drafting capabilities.",
        ],
    },
    {
        version: "26.07.10.1",
        date: "July 10, 2026",
        highlights: [
            "🧩 Major Auto Draft orchestration upgrade — `utils/autoDraftOrchestrator.ts` was substantially expanded with stronger stage control and drafting pipeline behavior, paired with `utils/aoiResolver.ts` for more reliable area-of-interest resolution before map/data retrieval.",
            "🗺️ New map acquisition stack for drafting — added `services/esriRestClient.ts`, `services/staticMapsService.ts`, and backend `backend/src/routes/maps.ts`, plus route registration in `backend/src/index.ts`, enabling resilient map-source fallback paths and server-assisted static map delivery when direct client keys or providers are unavailable.",
            "📐 Drafting UX and type-safety pass — `components/CadManager/AutoDraftPanel.tsx`, `App.tsx`, `types.ts`, `utils/projections.ts`, and `components/SettingsPage.tsx` were updated to support the new drafting capability flow with clearer controls, stronger contracts, and projection-aware handling.",
            "🌐 Data-provider integration hardening — `services/parcelGisService.ts`, `services/floodService.ts`, `services/soilsService.ts`, and `services/structuresService.ts` were refined to improve consistency and reliability of downstream drafting inputs across parcel, flood, soils, and structure overlays.",
            "✅ Regression coverage added for core drafting plumbing — new tests (`tests/aoiResolver.test.ts`, `tests/autoDraftOrchestrator.test.ts`, `tests/esriRestClient.test.ts`, `tests/staticMapsService.test.ts`) lock in the expanded orchestration and mapping behavior for this release.",
        ],
    },
    {
        version: "26.07.09.1",
        date: "July 9, 2026",
        highlights: [
            "🤖 Claude runtime plumbing expanded across UI + API surfaces — updates spanning `components/ClaudeSettingsPanel.tsx`, `components/SettingsPage.tsx`, `services/claudeChat.ts`, `services/claudeConfig.ts`, and `backend/src/routes/claude.ts` improve configuration flow and request handling for Claude-backed chat paths.",
            "🧠 Session/state wiring enhancements — `App.tsx`, `contexts/AppStateContext.tsx`, `types.ts`, and `utils/sessionDefaults.ts` were updated to carry new state and defaults consistently across app lifecycle boundaries.",
            "🛰️ Navigation and lifecycle UX refinements — `components/Sidebar.tsx` and `components/PwaLifecycleOverlay.tsx` received interaction updates to improve user visibility/control during app and PWA lifecycle transitions.",
            "🔌 Service integration hardening — `services/geminiService.ts`, `backend/src/index.ts`, and related surfaces were adjusted to keep model/service orchestration aligned with the latest Claude feature set and backend route registration.",
        ],
    },
    {
        version: "26.07.08.2",
        date: "July 8, 2026",
        highlights: [
            "⚖️ Legal page refresh — `components/LegalPage.tsx` was updated for clearer readability and section flow, with copy tightening and structure improvements that keep legal terms consistent while making key obligations easier to scan.",
            "🧾 Policy-language alignment across legal surfaces — `components/LegalSubdomainPage.tsx` now mirrors the latest trust/compliance phrasing and references used across subdomain policy pages, reducing wording drift between legal and compliance domains.",
            "🔒 Privacy clarifications — `components/PrivacyPolicySubdomainPage.tsx` includes minor wording updates to align handling/disclosure language with the current subprocessor and compliance narratives without changing policy intent.",
            "🛡️ Compliance surface consistency pass — `components/ComplianceSubdomainPage.tsx` received targeted text updates so SAIF-aligned trust statements and legal/privacy cross-links remain synchronized after the prior 26.07.08.1 rollout.",
        ],
    },
    {
        version: "26.07.08.1",
        date: "July 8, 2026",
        highlights: [
            "🛡️ Google Secure AI Framework rollout (model-consumer scope) — trust and policy surfaces now use the standard claim language \"aligned with SAIF principles\" across `compliance.landsurv.ai`, `privacy.landsurv.ai`, `legal.landsurv.ai`, and `subprocessors.landsurv.ai`, with explicit non-certification guardrails.",
            "🧭 Trust Center SAIF controls published — `components/ComplianceSubdomainPage.tsx` adds a dedicated SAIF agent-security section covering least-privilege permissions, user-control gates, observability, and input/output safeguards mapped to prompt-injection, sensitive-data-disclosure, and rogue-action risk areas.",
            "📋 Compliance program formalized with SAIF matrix — `SOC2_GDPR_COMPLIANCE_PROGRAM.md` now includes a risk-control matrix (PIJ, SDD, RA, IIC, IMO, DMS, EDH) with implementation evidence, ownership, review frequency, and residual-risk tracking for quarterly governance reviews.",
            "🔗 Strategy + discovery surfaces synchronized — `COMPLIANCE_SUBDOMAIN_STRATEGY.md`, `components/SitemapPageContent.tsx`, and `public/sitemap.xml` were updated so SAIF-aligned trust messaging is discoverable and consistent with legal/privacy/subprocessor companion pages.",
        ],
    },
    {
        version: "26.07.07.2",
        date: "July 7, 2026",
        highlights: [
            "📦 LSVZ spec surfaces aligned to the live archive contract — `pages/DevOpsConsole.tsx`, `components/LsvzDocumentationContent.tsx`, and `utils/lsvzSchema.ts` now consistently describe the real `.lsvz` layout as `manifest.json` plus root-level copied source files, not the older `session.json` / `metadata.json` / `version.txt` packaging story.",
            "🧭 Published schema narrative expanded — the LSVZ docs now call out the currently persisted advanced session surfaces: `steepSlopeRuns`, `soilMapUnits`, `deedBatchJob`, `draftingStyleLibrary`, CACP reservations, knowledge-base facts, and the broader file inventory that now travels with a session save.",
            "🔁 CACP developer spec refreshed across documentation surfaces — `components/CacpSubdomainPage.tsx` and `pages/DevOpsConsole.tsx` now document the current API shape (`interAgentComm.request()`, `askPeer()`, `onCommand()`), TTL-based cached results, reservation-oriented point-number workflows, and the newer QA skill lineup including `points_sanity_check`.",
            "🏷️ Open-standard positioning clarified — the DevOps Console now labels `.lsvz` as an open CC BY 4.0 published spec at `lsvz.landsurv.ai`, and points readers at `utils/sessionZip.ts` + `utils/lsvzSchema.ts` as the authoritative implementation/spec pair instead of the older persistence-only references.",
            "🧪 Schema docs tied to compile-time guarantees — the LSVZ field catalog now explicitly tracks the compile-time checked `LSVZ_SCHEMA`, clarifies additive compatibility behavior, and distinguishes the session ZIP payload from CAD Manager’s separate localStorage-backed persistence layer.",
        ],
    },
    {
        version: "26.07.07.1",
        date: "July 7, 2026",
        highlights: [
            "🔍 Zoning map search hardened end-to-end — backend `zoningSearch.ts` now runs the full server-side Serper/CSE pipeline (candidate scoring, drill + second-hop fetch, GIS/PDF/image classification) so deployed builds match local dev; `SERPER_API_KEY` and `CLAW_API_KEY` are now provisioned as Secret Manager secrets and injected at deploy time via `cloudbuild-backend.yaml` / `cloudbuild.yaml`.",
            "🚫 TOS-restricted codifier hosts blocked across the full stack — `utils/clawCompliance.ts` blocklist (ecode360, municode, qcode, generalcode, codepublishing, amlegal, sterlingcodifiers, lf-pubs) is now enforced in: the frontend candidate loop, the `zoningMapSources` pin filter, the dev API search (`api/index.js`), the backend search route, and the production `proxy-fetch` route (returns HTTP 451). These hosts serve ordinance text, not official maps, so they were never valid map candidates.",
            "⏱️ Drill-phase timeout budget — the CSE/Serper drill loop now skips immediately when a high-confidence direct map candidate is already present (PDF/image/GIS match scoring ≥ 300) and enforces a 9-second hard deadline across all drill + second-hop fetches, eliminating the race condition where slow municipal sites ate the client's 30-second request budget.",
            "📄 PDF map preview with pdf.js — `ZoningResultsPanel` replaces the unreliable `<object>` PDF embed with a client-side pdf.js renderer that rasterises page 1 to a canvas; worker is now bundled locally (Vite `?url` import) so preview works under strict CSP without external worker hosts.",
            "🔧 Backend claw route + deployment config fixes — `backend/src/routes/claw.ts` updated for correct session-header forwarding; `backend/src/index.ts` registers the zoningSearch and claw routes; `cloudbuild-backend.yaml` and `cloudbuild.yaml` updated with SERPER/CLAW secret refs and correct Cloud Run service targets.",
        ],
    },
    {
        version: "26.07.06.1",
        date: "July 6, 2026",
        highlights: [
            "🗺️ Zoning map discovery/reliability overhaul — zoning bootstrap now treats interactive GIS viewers as first-class official maps (not just PDFs/images), preserves municipality-hosted candidates even when Google CSE misses them, records `zoningMapKind` + frame-embeddability, and pins a structured `zoningResearchSummary` so users can see exactly what was found, verified, and dropped in the main results panel.",
            "🌐 Native ArcGIS in-app renderer + fallback ladder — new `components/ArcGISZoningMap.tsx` renders ArcGIS `MapServer` zoning layers directly in-app (`export` + `identify` + legend) without iframe dependence; `ZoningResultsPanel` now uses a three-tier map strategy: native ArcGIS render, Claw-captured live snapshot for non-embeddable GIS viewers, then iframe/embed fallback.",
            "🦾 LandSurv Claw session isolation + PDF navigate fallback — `landsurv-claw/main.py` now maintains isolated BrowserContext/page state per `x-claw-session` (TTL + LRU-capped pool), adds retina screenshots (`device_scale_factor=2`), and handles direct-document `navigate` failures (`ERR_ABORTED`/download-starting PDFs) by probing via HTTP and returning actionable metadata instead of hard failing.",
            "🔐 End-to-end Claw session propagation — `utils/clawClient.ts` now generates a tab-scoped session id and forwards it to `/api/claw/tools/*`; `api/index.js` validates/forwards `x-claw-session`; blocklist current-page gating is now tracked per session so auxiliary preview sessions never contaminate the agent session state.",
            "⚡ Zoning agent model quality default — `services/geminiService.ts` now upgrades flash defaults to `gemini-2.5-pro` specifically for the Zoning Agent (while still respecting explicit user/per-agent overrides), improving multi-hop Claw planning and extraction reliability on complex municipal/GIS workflows.",
        ],
    },
    {
        version: "26.07.02.1",
        date: "July 2, 2026",
        highlights: [
            "🐛 Backend 502 hotfix — `cloudbuild.yaml` now provisions `JWT_SECRET` and `PASSWORD_SALT` as secrets on the in-container backend. `backend/src/utils/auth.ts` throws at startup in production when these fall back to dev defaults, crashing the Node backend so nginx returned HTTP 502 for every `/api/*` route (silently dropping legal-signature and voicemail writes).",
            "🗄️ Firestore database routing fix — `cloudbuild-backend.yaml` now passes `FIRESTORE_DATABASE_ID=logins` (and defaults `FIRESTORE_PROJECT_ID`), so the standalone backend service reads/writes the correct Firestore database instead of `(default)`.",
            "🔗 DevOps API base URL normalization — `pages/DevOpsConsole.tsx` and `utils/globalSettings.ts` now trim a trailing slash from `VITE_API_URL` and fall back to the backend Cloud Run URL, preventing malformed `//api/...` request paths.",
            "♻️ Stale-bundle fix after deploys — `public/sw.js` (cache `v1.37.1`) now always fetches JS/CSS from the network instead of serving cached app-shell bundles, so users pick up new releases without a hard refresh.",
        ],
    },
    {
        version: "26.07.01.3",
        date: "July 1, 2026",
        highlights: [
            "🔀 Claude model switching now takes effect live — selecting a model (e.g. Claude Fable 5) in the Claude settings panel now rebuilds the active agent's chat session against the chosen model. Previously the app reused the agent's cached Gemini chat and the selection never reached the routing layer. Wired via `ClaudeSettingsPanel` `onModelChange`, `App.tsx` model-change effect, and `__lsModel`/`__lsRecreate` metadata stashed by `startGeminiChat` in `services/geminiService.ts`.",
            "🌐 Claude Fable 5 served through the Vertex AI global endpoint — `backend/src/routes/claude.ts` now targets the bare `aiplatform.googleapis.com` host for the `global` region (dynamic shared quota), and `ClaudeSettingsPanel` adds a `global` region option and auto-selects it for Fable 5, which has zero regional per-project quota.",
            "🏷️ Per-message model attribution — each AI response now displays a small badge naming the model that produced it (Gemini/Claude variants), backed by a new `model` field on `ChatMessage` (`types.ts`) and label mapping in `components/ChatInterface.tsx`.",
            "🔓 Actionable Vertex data-sharing error — when a model (notably `claude-fable-5`) requires publisher data sharing to be enabled, the backend now returns a clear HTTP 403 with exact `setPublisherModelConfig` remediation steps instead of the raw Google error.",
            "🎨 Safe inline formatting in chat output — `utils/chatHtml.ts` restores a tiny allow-list of presentational tags (`<strong>`/`<em>` with a validated hex color only) after escaping, so app-emitted colored agent names render while untrusted model output stays escaped. Also fixed a literal `&amp;` rendering in `SignatureForm`.",
        ],
    },
    {
        version: "26.07.01.2",
        date: "July 1, 2026",
        highlights: [
            "🤖 Trust Center AI governance disclosure — `compliance.landsurv.ai` now includes a dedicated \"AI Governance & Model Provider Compliance\" section explicitly naming Anthropic Claude (via Google Vertex AI) and documenting Anthropic Usage Policy enforcement, the Claude Fable 5 Advanced AI Safety Addendum gate (HTTP 412 until consent recorded), prohibited-use controls, and Google Cloud/Vertex AI terms.",
            "📋 Subprocessors list now names AI providers — `subprocessors.landsurv.ai` replaces the generic \"AI model providers\" entry with explicit rows for Google Cloud Vertex AI and Anthropic (via Vertex AI), giving Google and Anthropic reviewers a clear, verifiable record of provider-terms compliance.",
        ],
    },
    {
        version: "26.07.01.1",
        date: "July 1, 2026",
        highlights: [
            "🛡️ SOC 2 + GDPR compliance program launched — new `SOC2_GDPR_COMPLIANCE_PROGRAM.md` and `COMPLIANCE_SUBDOMAIN_STRATEGY.md` establish the control framework, and a public Trust Center is now live at `compliance.landsurv.ai` alongside dedicated `subprocessors.landsurv.ai`, privacy-policy, and data-processing-addendum surfaces (registered in `App.tsx`, `public/sitemap.xml`, and `public/robots.txt`).",
            "🔏 DevOps data-subject tooling — `backend/src/routes/devops.ts` adds authenticated GDPR/CCPA endpoints `/api/devops/compliance/data-subject/export`, `/data-subject/delete`, and `/data-retention/run` (preview + execute), each writing a `logComplianceAuditEvent` audit trail for accountability.",
            "🤖 Claude Fable 5 (initial rollout) — new `claude-fable-5` model wired through `services/claudeConfig.ts`, `services/claudeChat.ts`, `components/ClaudeSettingsPanel.tsx`, and `backend/src/routes/claude.ts`, featuring a 1M-token context window and multimodal (Image/PDF/Text) input with 128K output.",
            "✅ Anthropic Usage Policy + Advanced AI Safety consent gating — Claude requests now require explicit Anthropic Usage Policy acknowledgement, and Claude Fable 5 additionally requires an Advanced AI Safety Addendum acceptance; the backend enforces both with HTTP 412 until consent (version + timestamp) is recorded.",
            "📄 Legal surfaces updated — `LegalSubdomainPage`, `LegalPage`, `LegalAgreementGate`, and `SignatureForm` refreshed to reference the SOC 2/GDPR posture, subprocessors, and Advanced AI (Claude Fable 5) disclosure obligations.",
        ],
    },
    {
        version: "26.06.28.5",
        date: "June 29, 2026",
        highlights: [
            "🔐 DevOps 2FA login hotfix (frontend + backend) — `backend/src/routes/devops.ts` session storage reverted to a resilient in-memory store so `/api/devops/generate-qr`, `/request-mfa`, and `/verify-mfa` no longer 500 with `Database pool not initialized` on deployments without an initialized Postgres pool.",
            "🌐 DevOps console API routing fix — `pages/DevOpsConsole.tsx` and `utils/globalSettings.ts` now route all `/api/devops/*` calls to the backend Cloud Run service via `VITE_API_URL`, eliminating the persistent HTTP 502 errors caused by the frontend origin not hosting the API.",
        ],
    },
    {
        version: "26.06.28.4",
        date: "June 28, 2026",
        highlights: [
            "🔐 DevOps MFA initialization fix — `/api/devops/request-mfa` endpoint now defaults to the server-configured `AUTHORIZED_EMAIL` instead of requiring it from the frontend, eliminating missing-parameter errors during MFA code requests and restoring DevOps login flow.",
        ],
    },
    {
        version: "26.06.28.3",
        date: "June 28, 2026",
        highlights: [
            "🛠️ Cloud Build recovery hotfix — `backend/src/routes/devops.ts` was restored to a syntactically valid baseline after a malformed merge introduced TypeScript parse errors (`TS1003/TS1005/TS1128`) that blocked backend compilation in Docker.",
            "✅ Backend deployment gate restored — `backend` TypeScript build now compiles cleanly again, allowing the Cloud Run pipeline to proceed for this release train.",
        ],
    },
    {
        version: "26.06.28.2",
        date: "June 28, 2026",
        highlights: [
            "🔐 Security posture controls expanded in DevOps global settings — server-side sanitization now accepts strict `agentReleaseStages` values only (`pre-alpha/alpha/beta/rc/ga`) and rejects malformed stage payloads before they can influence world-state behavior.",
            "⚡ Homepage and admin UI efficiency improvements — `InitialAgentSelection` now applies live admin stage overrides directly to card rendering, while `DevOpsConsole` adds horizontal overflow handling and minimum table widths across heavy data tabs for smoother operation on smaller viewports.",
            "🧭 Documentation and rollout surfaces updated for this release cadence — app version + release log now track the staged hardening and operational tuning sequence without changing existing runtime APIs.",
        ],
    },
    {
        version: "26.06.28.1",
        date: "June 28, 2026",
        highlights: [
            "🏷️ DevOps can now set per-agent release badges globally — new `agentReleaseStages` world-setting support was added in `utils/globalSettings.ts` and sanitized server-side in `backend/src/routes/devops.ts`, then surfaced in `InitialAgentSelection` so homepage cards can reflect admin-defined Pre-Alpha/Alpha/Beta/RC/GA states.",
            "📱 DevOps Console responsive polish — top tab row and major data tables now use horizontal overflow containers and minimum table widths, preventing clipped content on smaller viewports while preserving full admin visibility.",
        ],
    },
    {
        version: "26.06.27.7",
        date: "June 27, 2026",
        highlights: [
            "🔉 Voicemail audio playback compatibility hotfix — `InitialAgentSelection` and `DevOpsConsole` now decode base64 voicemail audio into Blob object URLs instead of `data:` URIs, fixing Chrome playback failures for WebM/Opus recordings and ensuring callers/admins can hear recorded greetings reliably.",
            "📦 DevOps greeting payload handling aligned — `backend/src/index.ts` now allows larger JSON bodies on `/api/devops/voicemail-greeting`, preventing large recorded greeting uploads from being rejected at the request parser layer.",
        ],
    },
    {
        version: "26.06.27.6",
        date: "June 27, 2026",
        highlights: [
            "⏱️ Answering-machine greeting playback hotfix — `InitialAgentSelection` now starts a timed browser-speech fallback when custom voicemail audio is slow to fetch or fails to play, preventing dead-air before the tone and keeping call flow responsive.",
        ],
    },
    {
        version: "26.06.27.5",
        date: "June 27, 2026",
        highlights: [
            "🧱 Firestore voicemail greeting storage now chunks oversized audio payloads — `backend/src/utils/firestoreStore.ts` splits large base64 greetings into ordered child docs and reassembles them on read, so DevOps greeting saves no longer fail once the inline limit is exceeded.",
            "🧭 DevOps greeting save endpoint now accepts the chunked backend path cleanly — `backend/src/routes/devops.ts` reports a clearer failure reason when no backend accepts the greeting, while normal saves continue to target Firestore and Postgres together.",
        ],
    },
    {
        version: "26.06.27.4",
        date: "June 27, 2026",
        highlights: [
            "🗣️ Voicemail greeting now uses a dedicated storage path — `backend/src/routes/devops.ts` serves and persists the greeting through its own Firestore/Postgres record, and `InitialAgentSelection` fetches that greeting directly for caller playback instead of reading from global settings.",
            "🛡️ DevOps greeting management is resilient — the console can record, preview, save, and clear the welcome audio without depending on global settings round-trips, and fallback playback still uses synthesized speech when no custom greeting exists.",
            "📏 Linear-unit and session defaults remain stable — the existing `usSurveyFoot` drafting default and session migration guardrails continue to protect older saved sessions while the new greeting storage stays isolated from world-state settings.",
        ],
    },
    {
        version: "26.06.27.3",
        date: "June 27, 2026",
        highlights: [
            "🧷 DevOps call-message workflow tightened — `backend/src/routes/devops.ts` now marks voicemail rows as read after playback, and the Firestore/Postgres status update helper persists the read state in whichever backend owns the record.",
            "🎙️ Voicemail greeting support added to DevOps — `DevOpsConsole` can now record, preview, save, and clear a custom welcome greeting, while `InitialAgentSelection` plays that greeting before falling back to cloud or synthesized speech.",
            "📏 Linear-unit defaults and session migration were hardened — `usSurveyFoot` is now the default drafting unit, `SettingsPage` accepts the updated enum safely, and old sessions migrate invalid unit values back to a supported default.",
        ],
    },
    {
        version: "26.06.27.2",
        date: "June 27, 2026",
        highlights: [
            "🩹 DevOps Console tab-rendering hotfix — `pages/DevOpsConsole.tsx` now restores the `legal` tab container structure in the correct order after the calls panel, preventing layout breakage and ensuring Legal Signatures UI renders reliably.",
        ],
    },
    {
        version: "26.06.27.1",
        date: "June 27, 2026",
        highlights: [
            "🧩 Voice assistant wording generalized from layer-only prompts to action-oriented confirmations — `App.tsx`, `backend/src/routes/voice.ts`, and `VoiceAgentPilot` now consistently guide users with neutral CACP action language and clearer fallback prompts.",
            "🗄️ Call-message persistence hardened across dual storage backends — `backend/src/routes/contact.ts` now attempts Firestore and Postgres independently, reports combined storage source when successful, and only returns failure if both writes fail.",
            "📋 DevOps call-message retrieval made resilient — `backend/src/routes/devops.ts` now merges Firestore + Postgres reads, decompresses voicemail payloads uniformly, de-duplicates overlapping records, and sorts by `created_at` before returning the latest entries.",
        ],
    },
    {
        version: "26.06.26.4",
        date: "June 26, 2026",
        highlights: [
            "🔊 Voice playback upgraded to Google Cloud TTS — `App.tsx` and `InitialAgentSelection` now try `/api/voice/speak` first and fall back to browser `SpeechSynthesis` with a preferred-voice picker (Neural/Aria/Jenny/Google voices ranked first), giving the answering machine and Voice Agent a consistent high-quality voice.",
            "🛠️ Contact Firestore fallback fixed — `backend/src/routes/contact.ts` now inspects the return value of `addCallMessageFs` and falls through to Postgres when Firestore silently fails instead of always returning `ok:true`.",
            "🖥️ DevOps Console call-message error handling added — the voicemail list now shows an inline error string and uses `cache: no-store` to avoid stale cached responses.",
        ],
    },
    {
        version: "26.06.26.3",
        date: "June 26, 2026",
        highlights: [
            "🎙️ Voice Agent pilot plumbing landed — the new `/api/voice/turn` route classifies transcripts into drawing intents, `VoiceAgentPilot` adds speech-recognition UI for live guidance, and `App.tsx` can propose or confirm CAD layer changes through the CACP voice workflow.",
            "☎️ Public contact callback intake expanded — the homepage call-message flow now accepts voicemail audio, gzip-compresses it when worthwhile, and stores the payload through Firestore or Postgres with the same validation guardrails as text submissions.",
            "🧭 CACP and LSVZ docs were refreshed for the new agent surface area — the protocol registry now includes the Voice Agent manifest, and the live manifest / session docs track the updated collaborative workflow and versioned settings coverage.",
        ],
    },
    {
        version: "26.06.26.2",
        date: "June 26, 2026",
        highlights: [
            "🧭 Deed-to-GIS coarse alignment added to the standard boundary workflow — `DeedSummaryPanel` now exposes `Align to GIS`, and `App.tsx` reuses the batch parcel scoring policy to match a parsed deed against fetched county parcels, then translate the tract centroid onto the matched GIS parcel centroid with fieldbook logging and redraw support.",
            "📐 Canvas drafting integrations expanded — `DrawingCanvas` now supports running OSNAP modes (endpoint, midpoint, intersection, nearest, perpendicular), inline ortho toggling, and typed segment lengths while drawing breaklines/inclusion/exclusion/polylines, bringing the live drafting workflow closer to CAD-style command entry.",
            "📏 Project linear-unit support added — new `utils/linearUnits.ts` plus `SettingsPage` and settings defaults add selectable linear units for typed drafting input and display, with conversions applied when entering segment lengths in the canvas and test fixtures updated to persist the new setting.",
        ],
    },
    {
        version: "26.06.26.1",
        date: "June 26, 2026",
        highlights: [
            "🔗 CAD Text Style integration expanded across annotation systems — annotation categories now support `styleSource` + `cadTextStyleName` with case and line-spacing controls, and `AnnotationCategoryPanel` can bind categories directly to shared CAD Manager text styles.",
            "🧩 Shared text-style catalog editor added to CAD Manager — `StandardsEditor` now includes a full Shared Text Styles table (name/font/bold/italic/case/line spacing) with validation for non-empty unique names before save, enabling reusable project-wide annotation typography definitions.",
            "📐 Canvas + DXF typography pipeline unified for boundary/contour/parcel text — new `utils/annotationTextStyle.ts` plus updates in `DrawingCanvas`, `ParcelPanel`, and `utils/dxf.ts` make world/screen annotation scaling, text-case transforms, CAD-style font overrides, and MTEXT line spacing consistent between on-screen rendering and exported DXF outputs.",
        ],
    },
    {
        version: "26.06.25.4",
        date: "June 25, 2026",
        highlights: [
            "📚 Boundary Agent batch deed triage added — `DeedInput` now supports multi-file PDF ingestion and routes batches into a new review workflow instead of forcing one-file-at-a-time processing. Batch files retain selected pages and are tracked as a grouped job for downstream matching.",
            "🧭 Parcel match + alignment review panel introduced — new `DeedBatchReviewPanel` surfaces per-file confidence, county preflight status, tract summaries, and coarse-align / rollback controls so operators can resolve multiple deeds in one pass.",
            "🧪 Batch matching engine and preflight checks added — `services/batchDeedProcessor.ts` now scores parcel candidates using parcel ID, owner similarity, deed book/page, and block/unit signals, and verifies county GIS field availability before a batch run starts.",
        ],
    },
    {
        version: "26.06.25.3",
        date: "June 25, 2026",
        highlights: [
            "✍️ Boundary Agent parcel typography controls expanded — `ParcelPanel` now lets users switch between local parcel text overrides and the CAD Manager text-style catalog, choose professional presets, and tune font family, bold/italic, case, and line spacing for parcel owner labels.",
            "🧱 CAD Manager text-style persistence for parcel labels — parcel label formatting now resolves against shared CAD text styles, and `CadManagerContext` backfills a default parcel-owner style catalog into standards that do not already include one so styling remains available across session restore and older `.lsvz` files.",
            "📐 Canvas and DXF parcel labels now stay in sync stylistically — `utils/parcelLabelFormatter.ts`, `components/DrawingCanvas.tsx`, and `utils/dxf.ts` now share the same resolved text-style pipeline, including uppercase/original-case handling, line-spacing, and MTEXT font formatting on the `PARCEL_LABELS` layer.",
        ],
    },
    {
        version: "26.06.25.2",
        date: "June 25, 2026",
        highlights: [
            "🏷️ Boundary Agent parcel label formatter controls — `ParcelPanel` now exposes include/exclude toggles for parcel ID, owner, deed book/page, and block/unit, plus configurable owner prefix behavior. Formatter state is persisted in session UI state and applied consistently to on-canvas labels.",
            "🖼️ Unified parcel label rendering path — new `utils/parcelLabelFormatter.ts` centralizes label line construction so `DrawingCanvas` and DXF export use the same field-order and fallback rules, eliminating mismatches between screen labels and exported annotation text.",
            "📐 DXF label export hardening — `utils/dxf.ts` now emits parcel labels as `MTEXT` on a dedicated `PARCEL_LABELS` layer, converts generated `TEXT` entities to `MTEXT`, and includes formatter-aware multi-line parcel labels so downstream CAD import preserves stacked label formatting.",
        ],
    },
    {
        version: "26.06.25.1",
        date: "June 25, 2026",
        highlights: [
            "🏘️ Boundary Agent parcel enrichment — deed references now auto-fetch from secondary GIS layers. New `attributeLookup` configuration in `ParcelGisServiceDef` enables services like Montgomery County (GIS_BOA_LAND) and Lehigh County to supply deed book/page + block/unit metadata after primary parcel geometry fetch. `services/parcelGisService.ts` now includes robust case-insensitive attribute matching with fallback regex patterns so field names vary by county without breaking lookups.",
            "📋 Multi-line parcel label rendering — `DrawingCanvas` now renders deed references as a third label line below parcel ID and N/F owner, with dynamic background sizing. Format: 'Deed Bk/Pg X/Y | Block/Unit Z/W' when available.",
            "📊 Parcel summary persistence — `deedRef` (deed book + page + block + unit formatted) is now part of `ParcelFeatureSummary` and `labelPoints`, so deed metadata survives in session state and restore workflows.",
        ],
    },
    {
        version: "26.06.24.1",
        date: "June 24, 2026",
        highlights: [
            "⚡ TIN import responsiveness upgrade — moved heavy TIN parsing off the main thread via new `services/tinImport.worker.ts` + `services/tinImportClient.ts`, and switched `App.tsx` to `importTinSurfaceFromSessionFileAsync(...)`. Large Carlson binary imports now run in a worker, preventing UI stalls and browser 'page unresponsive' warnings during parse/triangulation.",
            "🖥️ TIN import progress UX polish — `App.tsx` now uses a paint-aware `waitForPaint()` (double `requestAnimationFrame` + minimum stage dwell) so progress states like 'Parsing...' and 'Building mesh...' visibly render instead of flashing by when parsing completes quickly.",
            "📊 Steep Slope reporting workflow added — new `components/SteepSlopeReportPanel.tsx` with per-run slope-band statistics, plan area/acres totals, component summaries, and one-click `.txt` / `.csv` export. `SteepSlopePanel` now includes a `View Full Report` action and `VisualPanel` gained `steepslopereport` route support.",
            "💾 Session persistence expanded for steep-slope analytics — `steepSlopeRuns` is now stored in app state (`CanvasStateContext`), appended on analysis run, serialized into save sessions, restored on load, and cleared on reset so reports survive across working sessions.",
            "🗺️ TIN contour quality refinements — `utils/contouring.ts` now normalizes smoothing iterations to integers and uses a more tolerant contour endpoint join threshold for large-coordinate surfaces, improving contour stitching reliability and reducing fragmented major contours.",
            "🚀 Carlson parser hot-path optimization — `services/TinImportService.ts` now short-circuits vertex/triangle table search once strong table matches are found, dramatically reducing redundant full-file scans in binary `.tin` parsing paths.",
        ],
    },
    {
        version: "26.06.23.4",
        date: "June 23, 2026",
        highlights: [
            "🧹 TIN import cleanup — `App.tsx` no longer materializes imported TIN triangle edges into persistent `SurveyLine` rows (`type: 'tin-edge'`) during import. Imported surfaces now load as true TIN geometry without injecting extra mesh line entities into drawing layers, reducing visual clutter and preventing edge-line pollution of downstream line operations.",
            "📝 Release-log chronology patch — clarified and positioned the retroactive PWA foundation entry so history reads in logical order (initial PWA development documented before later share-target/file-handler enhancements), addressing the 'mid-stream jump' confusion in prior notes.",
        ],
    },
    {
        version: "26.06.23.3",
        date: "June 23, 2026",
        highlights: [
            "🌐 New dedicated PWA subdomain landing page (`pwa.landsurv.ai`). Added `components/landing/PwaLandingContent.tsx` with SEO-first product messaging for installable LandSurv workflows, including structured-data schema (`Product` + `BreadcrumbList`) for better discoverability of the PWA experience in search.",
            "🧭 App routing + sitemap integration for PWA page. `App.tsx` now registers a `pwa` landing route in `landingPageConfig`, includes the subdomain in runtime sitemap generation, and `components/SitemapPageContent.tsx` now surfaces `https://pwa.landsurv.ai` with install-focused description text.",
            "📲 PWA install UX clarity pass. `components/PwaLifecycleOverlay.tsx` now tracks installed state explicitly and adds a user-facing `What am I installing?` explainer panel (benefits, offline behavior, update prompts), reducing ambiguity during install prompts and keeping update notifications scoped to installed users.",
            "📝 Release-log quality update: retroactive PWA foundation documentation has been added below so the initial architecture launch is represented in history, not just follow-on patches.",
        ],
    },
    {
        version: "26.06.20.1",
        date: "June 20, 2026",
        highlights: [
            "🕰️ Retroactive documentation entry — Initial LandSurv.ai PWA foundation development (the first full PWA rollout). This release established the core installable-web-app baseline: manifest + browser config assets, service-worker registration lifecycle, offline fallback shell, and in-app install/update lifecycle overlays.",
            "🧱 Initial platform-specific PWA architecture delivered. First-generation Android/iOS/Desktop install experience components and rollout controls were introduced so capabilities could be enabled safely by cohort instead of all-at-once.",
            "🔄 Offline reliability baseline shipped. Initial offline queue/replay orchestration and sync-state instrumentation were introduced so API intents can be preserved during connectivity loss and replayed on reconnect.",
            "📌 Historical note: later PWA entries (for example 26.06.23.2 file handlers/share target) are follow-on enhancements built on this foundation release.",
        ],
    },
    {
        version: "26.06.23.2",
        date: "June 23, 2026",
        highlights: [
            "📱 PWA follow-on upgrade (built on 26.06.20.1 foundation) — installed-app file launch support. `index.tsx` now registers the Launch Queue consumer (`window.launchQueue.setConsumer`) and dispatches launched files into the app via `landsurv:pwa-launch-files`, enabling OS-level file association workflows when LandSurv.ai is installed as a PWA.",
            "📥 Direct TIN/LandXML open-from-desktop flow. `App.tsx` now includes a shared `importTinFile()` routine used by both manual import and PWA launch events, so opening a `.tin`, `.landxml`, or `.xml` file from the OS can auto-import directly into the active session and zoom to geometry without opening the file picker.",
            "🧩 Web manifest expanded for richer install behavior (`public/manifest.webmanifest`): added stable app `id`, `display_override`, `launch_handler` (`navigate-existing`), `handle_links: preferred`, and `file_handlers` for `.tin` / `.landxml` / `.xml` so installed clients behave more like a native desktop app.",
            "🔗 PWA share target support added in the manifest (`share_target`) so links/text can be routed into the installed app entrypoint for future deep-link workflows.",
        ],
    },
    {
        version: "26.06.23.1",
        date: "June 23, 2026",
        highlights: [
            "📊 Carlson DTM binary .tin parser — expanded `services/TinImportService.ts` to recognize and decode Carlson DTM revision 30433+ binary .tin files (binary magic header + point/face records) alongside existing LandXML and text-based formats. Parser auto-detects format, validates point coordinates, and builds a triangulation. Includes intelligent data cleanup: IQR-based outlier filtering (removes points >3× interquartile range) and local-density filtering (strips isolated singleton points) so noisy survey captures don't corrupt slope-band classification.",
            "🎚️ Steep Slope Panel UI — new dedicated panel (`components/SteepSlopePanel.tsx`) for slope-band analysis workflow. Users select a TIN surface, define custom slope-percent bands with per-band layer names and colors (default: 0–15% green, 15–30% amber, 30%+ red), set a minimum component linear span threshold (filters noise), optionally clip to an inclusion boundary, and trigger analysis. Renders classified triangles on the canvas in real-time so users immediately see steep regions highlighted.",
            "🖼️ Drawing canvas — enhanced TIN surface rendering with slope-band visualization. Updates to `components/DrawingCanvas.tsx` now display imported TIN surfaces as triangulated meshes and render steep-slope analysis results as color-coded triangle groups, with per-surface and per-band visibility toggles.",
            "🧹 Types cleanup — minor updates to `types.ts` to support the new TIN surface and steep-slope analysis state shapes across the app.",
        ],
    },
    {
        version: "26.06.21.2",
        date: "June 22, 2026",
        highlights: [
            "🔧 Steep Slope Agent SEO URL corrected — fixed from `steepslope.landsurv.ai` to `steepslopes.landsurv.ai` in agent registry, SEO URL map, and public sitemap so bookmarks + organic search results land on the correct subdomain.",
            "📥 TIN import UX refinement — added 'From TIN' CTA button to Contouring Agent card for direct .tin/.landxml surface import, with integrated callback wiring into `InitialAgentSelection` and supporting callbacks to the main app orchestrator.",
            "🗺️ Layer Manager TIN visibility toggle — new 'TIN Surfaces' section in LayerManagerPanel lists imported surfaces with vertex/triangle count and per-surface visibility toggle so users can manage multiple in-progress contour sources.",
            "🛠️ UI refinements — contouring generation panel, drawing canvas DXF rendering, agents landing page Steep Slope listing, and SitemapPageContent polish across multiple components for consistency.",
        ],
    },
    {
        version: "26.06.21.1",
        date: "June 21, 2026",
        highlights: [
            "⛰️ New Steep Slope Agent — TIN slope-band analysis with CAD-ready output. A new CACP-enabled agent (`services/SteepSlopeService.ts`, `services/AgentRegistry.ts`, `components/landing/SteepSlopeAgentContent.tsx`) analyzes a TIN surface triangle-by-triangle, classifies each face into slope-percent bands (default 0–15%, 15–30%, 30%+), groups connected steep triangles into components, and filters out components whose vertical span falls below a configurable minimum so isolated noise doesn't clutter the result. Two skills are exposed: `run_steep_slope_analysis` (analyze + band + group + threshold-filter) and `publish_steep_slope_layers` (create/update CAD layers per band through CAD Manager integration). Registered in `constants/agents.ts` with a new orange `SlopeIcon`, theme color, and gradient.",
            "📥 LandXML / TIN import — bring external surfaces straight into the session. New `services/TinImportService.ts` parses LandXML surface definitions (points + faces) into a `TinSurface` with northing/easting/elevation vertices and triangle index triples, with guardrails for malformed point/face rows and a minimum-3-points sanity check. Feeds the contouring, profile, and steep-slope workflows so a surface generated in Civil 3D or another package can be analyzed without re-deriving it from points.",
            "🗺️ Google Maps link parsing + secure short-link expansion. New `utils/googleMaps.ts` extracts lat/lon from pasted Google Maps URLs (decimal pairs, `@lat,lng`, and `!3d…!4d…` patterns) with range validation, and detects `maps.app.goo.gl` / `goo.gl` short links. A new backend route (`backend/src/routes/expandShortUrl.ts`) resolves those short links server-side with hardened SSRF protection — it follows up to 8 redirects but rejects any hop that resolves to a private/loopback/link-local IPv4 or IPv6 address, so the expander can't be abused to probe internal infrastructure.",
            "🧹 Zoning Agent — raw THINKING traces no longer leak into user-facing answers. `App.tsx` now runs a `stripThinkingBlocks()` filter over every zoning response (full text, result text, and the JSON-fenced / fallback paths) to remove stray `THINKING` markers the model occasionally emits past the reasoning delimiter, so the rendered answer reads as a clean district summary instead of exposing internal deliberation.",
            "✏️ Point Editor — chat + panel refinements. `components/PointEditorChat.tsx` and `components/PointEditorPanel.tsx` gained tighter editing affordances and state wiring (via `contexts/ChatStateContext.tsx`) for smoother point-list manipulation during a session.",
            "📐 Contouring & DXF export hardening. Updates across `utils/contouring.ts`, `utils/dxf.ts`, `components/ContourGenerationPanel.tsx`, `components/ContourManagementPanel.tsx`, `components/ContourEsriPanel.tsx`, and `components/DrawingCanvas.tsx` improve surface-contour generation and DXF artifact fidelity, with supporting type additions in `types.ts` and a new `services/TinService.ts` helper surface.",
        ],
    },
    {
        version: "26.06.17.1",
        date: "June 17, 2026",
        highlights: [
            "🐛 Zoning bootstrap reliability patch — Claw is now optional instead of a hard dependency during municipality map discovery. In `App.tsx`, the bootstrap flow now detects Claw authorization failures (401/unauthorized), records the tool transcript, and automatically pivots to grounded-search-only synthesis so zoning initialization can continue instead of stalling. The JSON restatement prompt was tightened accordingly, and an absolute guardrail now guarantees a deterministic fallback shell (`zoningMapUrl: null`, `zoningMapImage: null`, empty arrays) when parsing still fails, removing the previous `No structured data returned` dead-end state.",
            "🗺️ Zoning map candidate ranking and municipality safety improved. Candidate scoring now explicitly boosts GIS/ArcGIS/Esri/webmap endpoints alongside PDFs, and ranking filters were hardened to only keep real HTTP(S) URLs. The final map pinning step now enforces a strict municipality guard: when municipality-matched candidates exist, only those are eligible to pin; if none verify, the app prefers no map over pinning the wrong adjacent jurisdiction.",
            "🔎 Backend zoning search hardening (`api/index.js`) — multi-query discovery + listing-page drill + anti-aggregator guard. The search route now runs deterministic exact/PDF/general/site queries, normalizes and deduplicates URLs, downranks or rejects aggregator hosts, and performs best-effort one/two-hop municipal listing-page extraction to surface direct zoning map resources (PDF or GIS viewer links) that are one click deeper than the top search result. Municipality matching was tightened to title+URL signals (snippet removed to reduce false positives from neighboring-town legends), and candidate selection now favors official municipal/county/state hosts with stronger map-signal filtering.",
            "⚡ CAD Manager and C3D backend model update — migrated from `gemini-2.0-flash` to `gemini-2.5-flash` in `backend/src/routes/c3d-websocket.ts`, `backend/src/routes/cad-manager.ts`, and `backend/src/utils/cadManagerAI.ts`. Added `thinkingConfig: { thinkingBudget: 0 }` on latency-sensitive CAD Manager parse/inference generation paths to keep response times low and reduce timeout risk under Cloud Run gateway limits.",
        ],
    },
    {
        version: "26.06.15.1",
        date: "June 15, 2026",
        highlights: [
            "🏛️ Zoning Agent research results now have a live-updating knowledge base. New `ZoningResultsPanel` (replaces flat 'Research Summary') layers a jurisdiction hero header (name + Claw status: Researching / Synthesizing / Idle) + a snapshot card (aggregated KB facts like setbacks, use classes, step-backs from every Q&A) + a timeline of per-question cards with auto-extracted citations (§27-405.A, Section 4.5, etc.), source URLs, numeric findings, and permitted-use lists. The KB automatically hydrates from every model response via `extractZoningJsonBlock()` and persists through the session so follow-up questions build a live fact sheet instead of restarting from scratch.",
            "⚖️ TOS compliance policy for automated source retrieval. New `utils/clawCompliance.ts` maintains a hard-blocked list of hosts whose published TOS prohibits unattended retrieval: eCode360, Municode, qCode, GeneralCode, CodePublishing, amLegal, SterlingCodifiers, LF-Pubs. Claw directives that would navigate to these domains return a synthetic `[BLOCKED: TOS violation]` result instead of a 404, so the agent learns to pivot to permissive sources (municipality .gov, Zoneomics, county GIS, planning PDFs, public-record ordinances). If the user wants to read the blocked site themselves, the new `SourceBlockedNotice` toast offers 'Open in your browser' — that fetch goes under the user's own session + TOS exposure, not the app's. Anything the user pastes back is user-supplied input, not automated retrieval.",
            "🔍 Reverse geocoding + US jurisdiction bootstrap. New `utils/reverseGeocode.ts` and `utils/usJurisdictions.ts` form a three-tier jurisdiction resolver: (1) the user types a location → (2) reverse-geocode it to lat/lon → (3) look up what state/county/municipality intersects those coords → (4) populate the Zoning Agent's context with canonical county FIPS, municipality ID, and known district prefixes. `utils/zoningBootstrap.ts` orchestrates the lookup flow with a 'Retrieving jurisdiction...' → 'Found …' → 'Ready' progression visible in the UI.",
            "🧠 Zoning Agent system prompt v2 — now teaches the agent to ask user-clarifying questions when jurisdiction is ambiguous. If the user says 'what's the setback in this county?' the agent now prompts 'which municipality? I found Anytown, Midtown, Oldtown' rather than guessing. Updated to ground all findings in the KB snapshot so answers cite the live-aggregated facts from `ZoningResultsPanel` instead of relying on search snippets alone.",
            "📄 New `SourceBlockedNotice` toast (replaces deprecated `SourceConsentGateway`). Compliance-first UX: when Claw hits a TOS-restricted host, the user gets a clear toast explaining why (\"eCode360's TOS prohibits automated retrieval\"), offering two buttons: (1) 'Open in your browser' (user's own session, user's TOS exposure) and (2) 'Try a different source' (agent pivots). Renders as an inline alert in the Zoning chat so the research flow isn't interrupted.",
            "🛠️ Backend proxy route for fetch() — new `backend/src/routes/proxyFetch.ts` unifies cross-origin fetch requests from the SPA. Gemini-powered agents sometimes need to fetch plain-text content from URLs (PDFs, CSVs, public records) that don't support CORS from the browser; the new `/api/proxy-fetch?url=` route fetches server-side and streams the response so agents can consume the data without CORS blocking. Request URL is validated against the same compliance list so restricted hosts are blocked here too.",
            "📊 DevOps Console v2 — expanded with new tabs and refined UI. Added admin controls for knowledge-base seeding, session snapshots, TOS audit trail, and compliance-event logs. The console now surfaces which agents accessed which restricted hosts (for compliance review), when they blocked a request (timestamp + reason), and what permissive source they pivoted to. Helps ops teams understand agent behavior + respond to any TOS audit inquiries.",
            "🎨 New zoning-specific CSS — `index.css` gains dark-themed cards, badges, and timeline elements so the results panel + notices integrate seamlessly with the existing LandSurv aesthetic. Hero header uses emerald/cyan gradients; timeline uses soft borders and truncation for long citations.",
        ],
    },
    {
        version: "26.06.06.2",
        date: "June 6, 2026",
        highlights: [
            "🐛 LandSurv Claw — missing production-backend route. The 26.06.06.1 deploy added the `/api/claw/*` proxy to `api/index.js` (the local-dev Express harness), but Cloud Run actually runs the TypeScript `backend/` (`backend/src/index.ts` → `backend/dist/index.js`) per the production Dockerfile. Result: `/api/claw/tools` 404'd in prod even after the Claw container itself deployed cleanly. Added `backend/src/routes/claw.ts` mirroring the dev proxy exactly (same `CLAW_BASE_URL` + `CLAW_API_KEY` env vars, same 10-tool allowlist, same content-type/status passthrough) and registered it at `app.use('/api/claw', clawRouter)` in `backend/src/index.ts`. End-to-end now works: SPA → nginx → Node backend (`/api/claw`) → Cloud Run Claw service → headless Chromium.",
        ],
    },
    {
        version: "26.06.06.1",
        date: "June 6, 2026",
        highlights: [
            "🤖 LandSurv Claw — the Zoning Agent now drives a real headless Chromium browser. New `landsurv-claw/` service (Python + Microsoft's Playwright MCP base image `mcr.microsoft.com/playwright/python:v1.49.0-jammy`) wraps Chromium in a Model Context Protocol server and ships both an SSE transport (`GET /sse` + `POST /messages/`) for native MCP clients and a parallel REST surface (`GET /tools`, `POST /tools/{name}`) for our Node backend. Ten tools exposed: `navigate`, `click`, `type_text`, `wait_for_selector`, `scrape_text`, `scrape_html`, `extract_links`, `screenshot`, `get_page_info`, `reset_session` — plus a deliberately server-side-only `evaluate_js` escape hatch. Deployed to Cloud Run on demand (`min-instances=0`, `max-instances=5`, `concurrency=4`, `memory=2Gi`, `timeout=3600`) so it scales to zero between jobs and only spins up when an agent actually needs to browse, keeping the bill near —0 when idle.",
            "🔌 Backend proxy at `/api/claw/*` (api/index.js) — the SPA never talks to Claw directly. New `CLAW_BASE_URL` + optional `CLAW_API_KEY` env vars keep the shared secret server-side; a hard allowlist of ten tool names blocks anything not on the curated list (notably `evaluate_js` is dropped so a compromised model can't run arbitrary JS in the browser context). Proxy streams the upstream content-type/status through unchanged so REST responses and image payloads pass intact. Returns `503` when unconfigured, `502` on upstream failure, `403` on disallowed tool — each path surfaces a clean JSON error to the agent.",
            "🧠 Zoning Agent system prompt overhaul — the agent now knows about both Google Search grounding AND the Claw browser as complementary tools, with explicit guidance on when to use each (Search for discovery, Claw for getting past JS / forms / map viewers / Municode tables / ArcGIS popups / PDFs behind redirects). The prompt documents the ` ```claw ` fenced-JSON invocation format with the full tool signature list and a four-step research workflow (discover → read snippet OR navigate-wait-scrape → cite ordinance section + URL). Same anti-fabrication guardrails as before but now both tools are valid grounding sources.",
            "♻️ Multi-hop tool loop in `App.tsx` `handleSendMessage` — when the active agent is `ZONING_AGENT`, the host now scans each model response for ` ```claw ` fences via `parseClawDirectives()`, executes them through `runClawDirectives()` (capped at 4 directives per turn), feeds the formatted transcript back as a synthetic user message, and re-streams the follow-up. Hop counter is bounded by `MAX_CLAW_HOPS = 3` so a runaway model can't burn the page; the user's stop-generation flag short-circuits the loop on every iteration; image content (screenshots) is summarized rather than re-attached so token budget stays sane. Each follow-up turn appends a fresh assistant message so the chat history reads as Model → Tool → Model → Tool → Final synthesis.",
            "💻 New `utils/clawClient.ts` — typed REST client + a module-scoped event bus (`subscribeClawEvents`) that publishes per-tool-call telemetry (`id`, `tool`, `args`, `startedAt`, `endedAt`, `status`, `error`, `preview`). `summarizeClawResponse()` renders tool output into a token-bounded markdown block ready to feed back to the model; image parts collapse to ` [screenshot captured — mime, ~bytes] ` so the SPA doesn't echo the base64 PNG into the next turn. Includes a ` ```claw ` regex parser and a `runClawDirectives()` orchestrator that catches per-tool errors so a single bad selector doesn't abort the whole hop.",
            "🌐 New floating `ClawStatusBadge` (bottom-right) — only renders when `activeAgent === ZONING_AGENT`. Shows a pulsing `Browsing…` pill with the current tool name and a URL/selector preview while a call is in flight; flips to a green check / red X on completion. Click-to-expand reveals the last eight calls with per-call duration (ms), inline error text on failure, and a two-line italic preview of returned text on success — so the user can SEE the agent actually visiting `ecode360.com` and pulling `§ 18-203.2.A` instead of guessing whether anything happened.",
        ],
    },
    {
        version: "26.06.05.2",
        date: "June 5, 2026",
        highlights: [
            "🐛 DevOps API-Key Usage panel — BYOK signed-in users now actually show up. The 26.06.02.4 release shipped the backend route, the Firestore persistence, and the DevOps console UI (emerald rows + green `user-key` pill) for BYOK session check-ins, but the matching client-side `fetch('/api/demo/byok-checkin', …)` was never wired into `App.tsx` — so the panel only ever displayed demo `lsa_*` key events and looked frozen to anyone reviewing live usage. Added a guarded `useEffect` in `App.tsx` that fires the check-in exactly once per page load when all four conditions hold: not a super-user, `hasConfirmedApiKey === true`, `settings.userApiKey` set, and `hasLegalSignature === true` with a parseable `{ name, email }` in localStorage's `landsurv-legal-agreement-v1`. A `useRef` keeps the call from repeating on every render; the backend's existing 1-hour per-email cooldown still deduplicates across reloads and across tabs. Only `{ name, email }` is sent — the Gemini API key value itself is never transmitted.",
        ],
    },
    {
        version: "26.06.05.1",
        date: "June 5, 2026",
        highlights: [
            "📺 LandSurv.ai is on YouTube! Tutorials, walkthroughs, and tips live at youtube.com/@LandSurv. New entry points: a red YouTube icon button in the landing-page top action row (next to the public concierge chat), a `📺 YouTube Tutorials — Learn the app — walkthroughs & tips` link in the Sidebar info dropdown, and a prominent `New Here? Watch the @LandSurv YouTube Channel for tips and tutorials` callout in the API-Key modal so first-time users land on real video help instead of staring at an empty key field.",
            "✨ Landing page — secondary-action buttons restyled for visual depth. Every entry-screen button (Civil 3D Connect, API Key Settings, Buy Day Pass, Email Support, Load Session, About, Legal, Documentation, Release Log, Job Info, Settings, plus the State-Plane projection menu) was upgraded from flat `bg-gray-800/80` plates to soft vertical gradients (`from-gray-800/80 to-gray-900/80`), inner highlight (`shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]`), translucent white border, hover lift (`hover:-translate-y-px`), and an accent-colored hover glow matching each button's existing hover text color (emerald / cyan / amber / pink / blue / green / purple / teal). Civil 3D's connected-state pill also got the gradient treatment. Pure cosmetic polish — no behavioral changes.",
            "🗄️ API-Key modal — density pass + collapsible instructions. `ApiKeyOrPayModal` narrowed from `max-w-2xl` to `max-w-xl`, header trimmed from `text-2xl`/`p-6` to `text-lg`/`px-5 py-3`, tab bar reduced to `py-2 text-sm`, and the multi-line `How to Get Your API Key` instructions collapsed into a single `<details>` summary chip that expands on click. The freed vertical space hosts the new YouTube tutorials callout. Net: the entire modal now fits well above the fold on small laptop screens (was previously scrolling past the submit button on 13” displays).",
        ],
    },
    {
        version: "26.06.04.1",
        date: "June 4, 2026",
        highlights: [
            "🏷️ CAD Manager — per-surveyor aliases are now multi-value and wildcard-aware. `CodeDefinition.surveyorAliases` widened from `{ [surveyorId]: string }` to `{ [surveyorId]: string | string[] }` so one surveyor can map multiple field codes (e.g. `CM`, `CM*`, `MH-SAN`) to the same master code. New `normalizeSurveyorAliases()` + `aliasToRegExp()` helpers in `contexts/types/CadManager.types.ts` standardize the on-disk shape (legacy single-string sessions still load) and compile each term to a case-insensitive word-bounded regex with `*` expanded to `\\S*`. `resolveCode()` in `CadManagerContext` consults the alias table on every lookup — exact case-insensitive match returns confidence `1.0`, fuzzy wildcard match returns `0.9`, fuzzy literal returns `0.95`. The Standards Editor gained chip-style UI to add/remove alias terms per surveyor and a domain-conflict warning surface.",
            "🧠 New `utils/codeDomainClassifier.ts` — sanity-checks alias mappings across thirteen survey domains (water, sewer, storm, electric, gas, comm, paving, concrete, boundary, control, structure, vegetation, topo). Each alias term and master-code description is tokenized on `[\\s/\\-+,&_.]+` and looked up in a static lexicon (~160 canonical abbreviations); if a surveyor maps a clearly-electrical token like `EM` to a clearly-sewer master like `SMH`, the editor flags the cross-domain conflict so the user can confirm before it silently corrupts auto-coded linework on the next import.",
            "⚡ Linetype Manager — new `arc` shape element for revision-cloud / foliage patterns. `LinetypeDefinition.shapeData[]` entries gain `arc?: boolean` + `arcSide?: 1 | -1` fields. When `arc: true`, the renderer draws a semicircular bump whose chord length equals the shape's `scale` (in .lin units); `arcSide` flips the bump above (+1) or below (-1) the line direction. `DrawingCanvas.drawComplexLinetype` was extended (+377 lines) to handle the new arc step alongside the existing dash/gap/glyph cycle, and `LinetypeManagerPanel` rebuilt its preview as a unified dash/gap/glyph/arc walker rendered through an SVG `path` so the swatch matches canvas output bit-for-bit. The default USACE `TREELINE` linetype was switched from an embedded-`T` dash to consecutive tight arcs (`scale: 0.4`, `arcSide: 1`) so tree lines now read as actual foliage instead of a row of letters.",
            "🛣️ Field-to-finish AI — compound / multi-code descriptions now match correctly. The line-stringing prompt in `services/geminiService.ts` gained a new §5 ‘COMPOUND / MULTI-CODE DESCRIPTIONS — PARTIAL MATCHES STILL COUNT’ section instructing the model that descriptions like `DW1 BRK`, `EP/CURB`, `SW+EP`, `DW2 PC`, `TC EP` represent a primary feature code plus one or more secondary modifiers — the point still belongs to the primary feature's polyline. Includes an explicit tokenization rule (split on whitespace, `/`, `-`, `+`, `,`, `&`, `_`), an alias table covering driveway / road / curb / sidewalk / building / fence / centerline / water-ditch, a list of never-disqualifying modifier tokens (`BRK`, `GB`, `PC`, `PT`, `POC`, `COR`, `TC`, etc.), a continuity rule that keeps a running polyline going through secondary-code shots, and a worked example for `“draw the driveway”` over `DW1 DW1 DW1 BRK DW1 DW1 PC DW1 POC DW1 PT DW1` showing all 8 points landing on one polyline with the PC→POC→PT trio becoming a curved segment.",
            "📝 Annotate Manager — AI rule generation now sees what's actually on the canvas. `generateAnnotationRule()` accepts an optional `pointDescriptions[]` parameter; `AnnotateManagerPanel` passes the current file's point descriptions on every Generate click. The prompt ranks the unique descriptions by frequency, ships the top 80 to the model under a `POINT DESCRIPTIONS PRESENT IN THIS FILE` block, and instructs it to pick wildcard patterns that hit those exact strings FIRST before adding 1–2 general survey-convention fallbacks. Eliminates the common case of generating a rule that conceptually matches the user's request but doesn't actually fire on any of their points.",
            "🧹 `deleteLineFromList` — honors composite `from-to` selection keys. Lines created without an explicit `id` are referenced through selection tooling by the composite `“<from>-<to>”` key; the delete helper now matches that key in addition to `line.id` so right-click ‘Delete line’ actually removes deed-drafted segments that haven't been re-keyed yet.",
        ],
    },
    {
        version: "26.06.03.4",
        date: "June 3, 2026",
        highlights: [
            "📜 Spec metadata refresh — CACP and .lsvz version banners now reflect today's surface. The 26.06.02.2 release introduced spec-version banners but only wired the `CACP_SPEC_VERSION` / `CACP_SPEC_RELEASE` constants; the matching `LSVZ_SPEC_VERSION` / `LSVZ_SPEC_RELEASE` constants and the banner on the `.lsvz` docs tab were never shipped. Both spec constants now exist in `utils/lsvzSchema.ts` and render at the top of `LsvzDocumentationContent` as `.lsvz Specification v1.0 / Released 2026-06-03 / App build {APP_VERSION}`, matching the existing CACP banner style. The CACP release date was also rolled forward to `2026-06-03` to capture the new skills added across 06-01→ 06-03 (`cl_create_from_description`, `cl_create_from_points`, `place_station_offset_point`, `generate_stationed_points`, `update_point_list`, `points_sanity_check`, `structures_rectify_footprints`, the 11-skill COGO toolkit). Protocol envelope is unchanged so `CACP_SPEC_VERSION` and `LSVZ_SPEC_VERSION` both stay at `1.0` — by design these only bump on backwards-incompatible schema changes.",
        ],
    },
    {
        version: "26.06.03.3",
        date: "June 3, 2026",
        highlights: [
            "🐛 DXF export — curves now plot in the correct location on rotated deeds. When a Boundary file had a non-zero `rotationDeg` (best-fit-to-points, or manual rotation to fit monuments), drafted curve `SurveyLine` rows carried rotated `from`/`to` endpoints but an *unrotated* `tangentBearing` straight from the deed. The DXF exporter combined the two when computing arc centers — perpendicular to the unrotated tangent off a rotated endpoint — producing arcs swung off in the wrong direction. The on-canvas renderer was unaffected because it derives curve geometry from endpoints + radius + sweep + direction, but the DXF artifact diverged. Fix: rotate `bearing`, `chordBearing`, and `tangentBearing` by `rotRad` when materializing drafted boundary lines so every stored angular field is in the same coordinate frame as the endpoints.",
            "🐛 Deed reader — explicit chord bearings now preserved on non-tangent-out curves. The post-parse ‘curve bearing correction via tangent continuity’ pass in `App.tsx` was unconditionally overwriting every curve's `chordBearing` with a value derived from the adjacent straight line — fine for deeds that gave only R + arc length, but wrong when the deed *explicitly* states a chord bearing on a curve that does NOT exit tangent from the prior call. Added a guard: skip the correction when `chordBearing` is already present and parses to a valid angle. The Boundary Agent prompt and JSON response schema already supported `chordBearing`; this restores the field's authority through the pipeline so the curve renders at the bearing the deed actually states.",
        ],
    },
    {
        version: "26.06.03.2",
        date: "June 3, 2026",
        highlights: [
            "🐛 Backend deploy fix — widen `PersistedAPIKey.tier` to include `'user-key'`. The 26.06.02.4 BYOK work added `'user-key'` to `APIKey.tier` but missed the parallel `PersistedAPIKey` Firestore-mirror type in `backend/src/utils/firestoreStore.ts`, which caused `tsc` to fail with TS2345 on `upsertAPIKeyFs` calls and broke the last two Cloud Run deploys (`ae6112f1`, `e61652e2`). Types are now aligned and `npm run build` in `backend/` compiles cleanly.",
        ],
    },
    {
        version: "26.06.03.1",
        date: "June 3, 2026",
        highlights: [
            "🔗 Stationing agent MODE 3 — chain existing project points into a baseline. The Stationing & CL agent gains a third skill, `cl_create_from_points`, alongside its existing description-based creation flow. Say 'create a centerline using the DYL points, connect them in a chain' and the agent finds every project point matching `DYL` in its context, orders them (by point number, spatially, or as listed), and emits the ordered coordinates as PIs — first point becomes POB, last becomes END, intermediates become PI-n. Straight tangents only (no curves), upserted by name so re-running with the same alignment name replaces the previous one. Logged to the fieldbook with PI count + total chord length.",
            "🎨 Linetype Manager — new CAD Manager sub-tool with full LTSCALE / CELTSCALE support. New `📏 Linetype Manager` entry in the sidebar (under CAD Standards / Drafting Style Library) renders the new `components/CadManager/LinetypeManagerPanel.tsx` for inspecting and editing every linetype in the active CAD standard. The data model now mirrors AutoCAD's three-tier scaling: `StandardDefinition.globalLinetypeScale` (LTSCALE — multiplies every pattern), `LinetypeDefinition.scale` (CELTSCALE-equivalent per linetype), and a new `SurveyLine.lineTypeScale` for per-entity overrides. `DrawingCanvas` was extended (+348 lines) to honor the full scale chain when stroking dashed/centerline/phantom patterns so what you see on canvas matches what exports to DXF / C3D.",
            "📦 Default USACE survey standard expansion. `utils/defaultUsaceStandard.ts` grew by +113 lines with additional linetype definitions and richer metadata so a fresh project lands with a complete, drawing-ready USACE-flavored linetype library out of the box.",
        ],
    },
    {
        version: "26.06.02.4",
        date: "June 2, 2026",
        highlights: [
            "🛤️ Stationing agent — create centerlines & baselines from natural language. The Stationing & CL agent now has a second mode: ask it to 'draw a centerline starting at 0,0 north 45 east for half a mile, then curve right radius 1000 for 20 degrees, then tangent out a quarter mile' and it parses the description into an ordered tangent/curve `legs` array and dispatches the new `cl_create_from_description` CACP skill. The host computes PI coordinates, tangent offsets (`T = R·tan(Δ/2)`), and full alignment geometry, then drops the finished centerline into the session automatically — no manual `.cl` file required. Supported leg units: ft, m, mi, ch, lk. Bearings accepted in quadrant (`N 45°15' E`), decimal degrees, or compass.",
            "📍 Cross-agent stationing skills — `place_station_offset_point` + `generate_stationed_points`. Any peer agent (Point Editor, COGO, Boundary, etc.) can now place points on the active centerline by station + offset via CACP `askPeer` without forcing the user to switch into the Stationing agent UI. Backed by new `services/stationingSkillHandlers.ts` and registered via the existing skill registry; uses a fresh `centerlinesRef` so handlers always see the current alignment instead of a stale closure.",
            "🔑 BYOK session check-in — signed-in users running with their own Gemini API key now show up in the DevOps API-Keys table. When a user has both confirmed their key and signed the Terms of Use, the SPA fires a single `/api/demo/byok-checkin` ping per rolling hour with just `{ name, email }` from the legal signature stored locally — the API key value itself is never transmitted. New backend route + `recordByokSession()` helper (1-hour cooldown per email, persisted to Firestore alongside demo-key events). DevOps console highlights BYOK rows in emerald, surfaces the full email instead of a truncated machine ID, and renders the `user-key` tier as a green pill.",
        ],
    },
    {
        version: "26.06.02.3",
        date: "June 2, 2026",
        highlights: [
            "↔️ Deed-to-deed line alignment — new interactive `↔ Align to other deed…` button on every boundary in the Boundary Editor (shown whenever ≥2 deeds are loaded). Clicking it arms the canvas: pick one line on the movable deed, then the matching line on the other (target) deed, and the movable boundary's `translationE` / `translationN` / `rotationDeg` snap so the two picked lines become collinear. Includes a live slide-along-target preview and a flip toggle so you can choose which endpoint pairs up with which. Anchored at the picked points so closure stays intact; no edits to the underlying bearings/distances. Major rewrite in `components/DrawingCanvas.tsx` (+628 lines) wires the picking, slide, and flip states into the existing transform pipeline.",
            "🔄 No-store cache headers on the SPA shell. Added `Cache-Control: no-store, no-cache, must-revalidate` + `Pragma: no-cache` + `Expires: 0` meta tags to `index.html` so browsers always fetch a fresh module graph on reload — fixes the recurring 'I deployed but users still see the old build' class of report. Hashed asset bundles continue to cache normally; only the entry document is forced fresh.",
            "🛑 Reduce-motion default tightened. The Settings toggle is now strictly opt-in: animations stay ON by default even for users whose OS has `prefers-reduced-motion: reduce` enabled. The OS preference is intentionally ignored because LandSurv's status pulses are functional (they indicate live AI work), not decorative — users who want them off can still flip the explicit `🛑 Reduce motion` checkbox in Settings → Developer/Testing. Reverts the 26.06.02.2 OS-fallback behavior.",
            "⚙️ Donation request timer is now a Settings field. New `donationRequestTimer` field on the `Settings` type (replaces previously hard-coded interval) so the cadence at which the in-app donation nudge can appear is configurable per install.",
        ],
    },
    {
        version: "26.06.02.2",
        date: "June 2, 2026",
        highlights: [
            "🐛 Reduce-motion preference — explicit Settings toggle now beats the OS. Previously, unchecking `🛑 Reduce motion` in Settings only deleted the stored flag, so users whose OS had `prefers-reduced-motion: reduce` ON could never turn LandSurv animations back on. Now we persist an explicit `'true'` / `'false'` in `localStorage['landsurv_reduced_motion']`; precedence is (1) explicit user toggle, (2) OS preference as fallback only when no explicit choice exists. Early-paint `<script>` in `index.html` and the Settings checkbox `defaultChecked` were updated to match.",
            "📜 CACP + .lsvz spec version banners. The `cacp.landsurv.ai` landing page now shows `CACP Spec v1.0` + `Released 2026-06-02` badges next to the Open Source pill, and the .lsvz documentation tab now opens with a `.lsvz Specification v1.0 / Released 2026-06-02 / App build {APP_VERSION}` banner. Spec versions live in `CACP_SPEC_VERSION` / `LSVZ_SPEC_VERSION` constants and are bumped independently of the app build.",
            "👋 Legal-agreement gate copy refresh. First-run Terms-of-Use modal now leads with `One more thing before we begin.` and a friendlier subheading explaining this is a one-time, per-device step — reduces the ‘what is this and why now?’ confusion reported on first-visit screen recordings.",
        ],
    },
    {
        version: "26.06.02.1",
        date: "June 2, 2026",
        highlights: [
            "🎨 Day Pass modal — homepage-idiom redesign + double-blind email confirm. `DemoRequestModal` was reworked to match the bolder homepage agent-card aesthetic: full-bleed dark `bg-gray-950` panel with a dashed `border-emerald-400/30` frame, a larger gradient `$24` headline (`24hr Demo LandSurv.ai™ — $24 — receive software-enabling key by email in minutes`), uppercase emerald section labels, and a chunkier gradient submit pill. New double-entry email flow: after the user types a valid email and blurs / presses Enter / Tab, the email field locks and an `Email confirm` field appears — submit is only enabled when both fields match (case-insensitive). Prevents the most common Day Pass support ticket cause (typo'd recipient address).",
            "🛑 Reduce motion preference — Settings toggle + early-paint CSS. New `🛑 Reduce motion (disable pulsing / shimmering animations)` checkbox under Settings → Developer/Testing. Persisted to `localStorage['landsurv_reduced_motion']` and read in `index.html` *before* React mounts so the first paint already has no pulse / shimmer / ping loops on agent cards and status badges. Implementation: an inline `<script>` at the top of `<head>` sets `data-reduced-motion=\"true\"` on `<html>` when the flag is on; a CSS rule scoped to `html[data-reduced-motion=\"true\"] *` (plus the standard `@media (prefers-reduced-motion: reduce)` block) clamps every animation to a single 0.001 ms iteration and zeroes transition duration. Activates immediately on toggle without reload; also auto-on for users whose OS has `Reduce motion` enabled.",
            "✨ ApiKeyOrPayModal backdrop polish. Bumped the modal scrim from `bg-black/80 backdrop-blur-sm` to `bg-gray-950/97 backdrop-blur-md` so the underlying page content fully disappears behind the dialog instead of bleeding through as a faint grid.",
        ],
    },
    {
        version: "26.06.01.2",
        date: "June 1, 2026",
        highlights: [
            "🛰️ Google Maps Static-tile overlay — new optional basemap beneath survey geometry. New `Google Maps Overlay` section in Settings (under `Drawing Canvas`) lets the user paste their own Google Maps Static API key and toggle a satellite / hybrid / roadmap / terrain raster underlay on the 2D canvas. Settings: enable toggle, API key (stored browser-only, never sent to LandSurv servers), map type, resolution scale (1× / 2× Retina), opacity slider (0–100%), `Show road / place labels on hybrid` checkbox (off → falls back to plain `satellite` map type so labels don't fight survey annotations), optional `language` and `region` biasing inputs, and an optional Styled Maps JSON textarea (roadmap/terrain only) that accepts paste-in output from mapstyle.withgoogle.com. New `Settings.googleMaps` type with sensible defaults (hybrid, 70% opacity, scale 2, labels on). Renderer in `DrawingCanvas` reprojects the current canvas view bbox from the project CRS into WebMercator (EPSG:3857), picks the tightest integer zoom that covers the view at native 640 px tile resolution, requests one Static Maps tile centered on the view (Styled Maps JSON expanded into repeated `style=` params), then reprojects the tile's actual coverage back to the project CRS for an axis-aligned blit beneath all survey geometry. Skips silently when the project projection is not set, the API key is missing, or the view center crosses ±85° latitude (Mercator pole guard). Tile fetch is debounced on pan/zoom so we don't burn quota on every wheel tick. Backend bumps the JSON body limit on `/api/demo/gemini/*` to 200 MB to match the existing `/api/vertex/*` cap, so demo-key holders can post the same multimodal payloads (large PDF / image base64) as bring-your-own-key users.",
            "👋 Demo-key returning-visitor modal — `Welcome back` variant. When a user re-enters a Day Pass demo key that's already been activated and has under 23:57 left on the clock, the confirmation modal now greets them with `👋 Welcome back!` and reports the exact remaining hours (e.g. `You have 16.42 hours left on your 24-hour LandSurv.ai demo`), making it obvious the key syncs across browsers and devices and that the clock is shared, not restarted. Fresh activations still show the original `🎉 Thank you — you're in!` copy.",
        ],
    },
    {
        version: "26.06.01.1",
        date: "June 1, 2026",
        highlights: [
            "🎟️ Day Pass — self-serve $24 / 24-hour demo API key. The legacy `📧 Contact Us for a Demo Key` mailto path is gone from every entry point (`AppLockOverlay`, `ApiKeyOrPayModal`, and the `Demo` button on the InitialAgentSelection landing screen) and replaced with a one-click `💳 Buy a 24-Hour Demo Key — $24` flow backed by a new `components/DemoRequestModal.tsx`. The modal is homepage-styled — same `Land`/`Surv`/`.ai`™ wordmark (cyan + green accents), amber `🎟️ Day Pass · 24 hours` badge, an 8-icon colorful feature grid (🤖 AI agent stack · 📐 COGO & boundary · 📄 Deed parsing · 🗺️ Civil plan reader · 📍 Stationing & CL · 🌐 GIS lookups · ⛰️ Contours & profile · ⚙️ CAD Manager) and a dedicated 🔌 orange/amber `Pair it with the Civil 3D Connector` callout. It collects email + optional name/use-case, POSTs to `/api/demo/request`, then opens the PayPal approve URL in a new tab. Backend wiring: new `/api/demo` and `/api/demo/gemini` routers, `demoScopeGuard` middleware (deny-list enforcement of uploads / GNSS / admin paths against demo-tier keys), and a new raw-body-verified `/api/paypal/webhook` that listens for `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.REFUNDED`. On capture: mints a trial-tier key with `activateOnFirstUse: true`, `expiresInHours: 24`, `rateLimit: 500`, `permissions: ['demo:read', 'demo:ai', 'demo:compute', 'demo:deed-parse']`, persists it to Firestore, and emails the buyer the key plus a curl quick-start. On refund: revokes the key automatically. Idempotent against PayPal replays via `demo_request.status` checks. Server cold-start now re-hydrates persisted demo keys from Firestore (`hydrateAPIKeysFromFirestore()`) so a key minted moments before a restart works as soon as the new instance accepts connections. Sandbox scope is intentionally narrow — heavy GNSS / RINEX processing, file uploads, and admin endpoints remain excluded.",
            "📡 New `services/proxyGenAI.ts` — server-proxied Gemini client for Day Pass holders. Demo-key users can use the website without bringing their own Gemini key: model calls route through the backend's `/api/demo/gemini` proxy, which forwards under the server-side service account and enforces the demo's per-key rate limit and permission scope. The frontend `geminiService` transparently falls through to this client when a demo key is the active credential — no per-agent code changes required.",
            "🏠 Structures Agent v2 — deterministic 4-pass building rectifier (no Gemini round-trip). `structures_fetch_nsi` now fetches OpenStreetMap `building=*` polygons alongside FEMA NSI centroids (NSI provides attributes — occupancy, sqft_ft, num_story, year built, first-floor elevation, census flood-loss stats; OSM provides real building geometry). Attributes are joined onto polygons via point-in-polygon. New `structures_rectify_footprints` skill (with `structures_draw_footprints` kept as a back-compat alias) runs a fully client-side 4-pass rectifier: PASS 1 (HIGH) — for each OSM polygon overlapping a survey BLDG cluster, pair each BLDG point to its nearest OSM vertex and apply a 2D Helmert (rotation + translation, no scale) to snap the real building geometry onto the survey corners. PASS 2 (MED) — emit unmatched OSM polygons as-is. PASS 3 (HIGH/MED/LOW) — BLDG clusters with no OSM match are COGO-completed: 1 corner → square centered on the point, 2 corners → perpendicular extrusion sized to NSI sqft when available, 3 corners → 90°-snapped parallelogram completion, ≥4 corners → minimum-area enclosing rectangle (rotating calipers). PASS 4 (LOW) — NSI centroids with `sqft_ft` but no OSM/BLDG match become synthetic squares sized to √sqft and oriented to the supplied `streetBearingDeg` (or N if absent). Output is closed polylines sharing a `polylineId` per building on layer `STRUCTURES`; reruns are idempotent (prior STRUCTURES layer is cleared and replaced). New supporting modules: `services/buildingRectifier.ts` (pure math, returns `RectifyStats { osmSnapped, osmAsIs, cogo3, cogo2, cogo1, cogoMer, nsiOnly, warnings }`) and `services/osmBuildingsService.ts` (Overpass QL fetch with bbox guards). StructuresPanel surfaces per-pass confidence counts color-coded HIGH/MED/LOW under a `Last rectify run` block after each invocation. Triggered by any of: \"draw the buildings\", \"rectify the buildings\", \"close out the buildings\", \"plot building footprints\", \"square that building\" — every agent that hears a draw-buildings intent must delegate to this skill.",
            "💼 Donation revenue model retired — moving to pure SaaS monetization. Every donate / donation reference has been removed from the runtime, the UI, and the public site map. Deleted: `components/DonationModal.tsx`, `components/landing/DonationPageContent.tsx`, `hooks/useDonationTimer.ts`. Removed from `App.tsx`: the `donate` landing-page route, the timer hook invocation, the `isDonationModalVisible` / `setIsDonationModalVisible` state plumbing, the `showDonationModal` UI-context entry, and the donation modal render. Removed from `contexts/AppStateContext.tsx`, `types.ts` (`Settings.donationRequestTimer`, `UIContext.showDonationModal`), `utils/sessionDefaults.ts`, and `utils/sessionMigration.ts`. UI buttons stripped from the InitialAgentSelection landing menu (top action bar and home-screen action card), `Sidebar.tsx` info dropdown, `HelpModal.tsx` quick actions, and `AboutPage.tsx` / `AboutPageContent.tsx` (the 💚 Support Us quick link and the Community Supported paragraph were replaced with a SaaS Monetization Model paragraph). Public `sitemap.xml` and `robots.txt` no longer advertise the `donate.landsurv.ai` subdomain; the sitemap link list rendered by `SitemapPageContent.tsx` and the `generateSitemapXml` helper in App.tsx were updated to match. Test fixtures (`tests/geminiService.test.ts`, `tests/dxfExport.test.ts`, `tests/components/FieldbookPanel.test.ts`) and the landing-page test suite (`components/landing/landing.test.tsx`) had the `donationRequestTimer` field and the `DonationPageContent` describe block stripped. `README_PUBLIC.md` and `systeminstructions.txt` no longer mention PayPal donations or the Donate button. Going forward, monetization is exclusively SaaS subscription tiers plus the optional LSVC ERC-20 premium-feature token.",
        ],
    },
    {
        version: "26.05.31.2",
        date: "May 31, 2026",
        highlights: [
            "🩹 MOVE/UPDATE host-side enforcement — duplicate-point bug fix. The v26.05.31.1 release codified MOVE-vs-COPY verb semantics in the system prompt, but the host's point-merge path was still treating every LLM response as additive: any returned `pointNumber` that already existed got renumbered to the next available PN and appended to the working list, producing stacked / near-coincident duplicates whenever the user said \"move\", \"shift\", or \"change coordinates of\" point N. The CACP loop also forced every Deed Reader re-parse through a `-A` suffix path, which was correct for the deed-reader workflow but wrong for every other agent. This patch makes the host honor the contract: (1) the suffix-and-renumber conflict path is now scoped to `AgentType.DEED_READER` only (and is bypassed entirely when `replacePoints: true` is set); (2) inside the CACP renumber loop, any numeric `pointNumber` that already exists in any list is treated as UPDATE intent — the AI-emitted PN is preserved through `aiToCacpMap`, `getNextNumbers()` issues numbers only for genuinely-new points, and `from`/`to` line refs resolve correctly because the AI label maps to itself; (3) the post-validation merge step now upserts by `pointNumber` across all lists — incoming points whose PN matches an existing entry overwrite that entry in place (preserving list-owned metadata like `layer` when the AI omits it) and only the truly-new remainder is appended to `Unsaved Points`. The fieldbook now logs separate `Updated N existing point(s) in place.` and `Plotted N new point(s).` lines so users can see exactly what each agent turn did.",
        ],
    },
    {
        version: "26.05.31.1",
        date: "May 31, 2026",
        highlights: [
            "🧪 COGO `points_sanity_check` skill — pre-commit QA for PDF/table extraction. New CACP skill that runs six independent geometric & statistical checks on any set of points extracted from a PDF, image, or coordinate table and returns a per-point severity verdict (yellow / red) plus a global pass/fail score. The six checks: (1) coordinate-magnitude clustering vs the median (catches column swaps or extra/missing digits), (2) per-segment inverse round-trip vs the stated bearing & distance from a companion L1/C1 line/curve table — strongest single check; provide `expectedSegments` whenever the plan publishes one, (3) polygon closure + linear misclosure + precision ratio when `expectedClosed: true`, (4) shoelace area vs `expectedArea` with tunable percent tolerance, (5) bearing-distance triangulation residuals for points referenced from multiple others, (6) coincident / collinear point detection within a configurable absolute tolerance. Returns `{ passed, score, summary, checksRun, checksSkipped, issues:[ {check, severity, pn, relatedPns, message, expected, actual, residual} ], closure:{ perimeter, misclosureLinear, precision, areaSqft, areaAcres } }`. Auto-triggered by `App.tsx` after every Gemini extraction (5 s timeout, non-blocking) — results written to the fieldbook with per-issue details; any RED severity fires a warning banner. The Boundary Agent system prompt now requires the agent to emit the call itself — non-negotiable for table-extracted points — with explicit guidance: a `cluster` red on a single point with the \"N/E may be swapped\" hint means the agent almost certainly read the table columns in the wrong order.",
            "⭕ Curve & circle emission contract — native arcs, no 36-point polylines. The Gemini response-formatting spec now forbids approximating circles and arcs as N-point polylines and codifies the correct emission shapes. Full circle → two curve segments forming a closed two-arc circle (each Δ = 180°): two points only (east-of-center and west-of-center), two `line` objects each with `isCurve: true`, `curveRadius: R`, `arcLength: π·R`, matching `curveDirection`. Arc (any partial sweep) → one `line` with `isCurve: true` plus `curveRadius`, `arcLength`, `curveDirection`; endpoints come from `from`/`to` points and the renderer derives the chord. Agents are told to delegate missing parameters to COGO (`cogo_curve_solve`, `circleThrough3`) instead of computing inline. Anti-pattern explicitly named: \"If you find yourself iterating an azimuth in a loop to generate point coordinates for a circle, stop — re-emit as the two-arc form above.\" DrawingCanvas now derives a chord bearing from the two endpoints when the AI supplies a curve with only R/L/curveDirection (no bearing fields), and curve annotation labels (Δ / R / L) render only for actual boundary calls — user-drawn geometric arcs and ad-hoc circles render silently.",
            "🔁 MOVE vs COPY verb semantics — duplicate prevention. A new CRITICAL — VERB SEMANTICS block in the formatting instructions distinguishes requests that modify existing geometry from requests that create new geometry. Saying \"move\" / \"translate\" / \"shift\" / \"change coordinates of\" point X now correctly re-emits the same `pointNumber` with new coordinates so the host overwrites in place (or uses `update_point_list` with `replacePoints: true` + `removePointIds: [<old PNs>]`). Previous behavior of emitting a new PN for what the user described as a move left stacked or near-coincident duplicate points scattered through the database.",
            "📋 Chat — Copy Conversation button. New copy icon in the chat header exports the full active-agent conversation as a markdown-formatted plaintext block, ideal for pasting into other AI tools for debugging or filing issues. Includes agent label & enum, ISO timestamp, page URL, user agent, message count; per-message: role, `<details>`-wrapped thinking block (when present), result/text body with HTML stripped, sources list with URIs. Uses `navigator.clipboard.writeText` with a hidden-textarea fallback for older browsers. Button briefly turns green (Copied!) or red (Copy failed) for 1.8 s as feedback.",
        ],
    },
    {
        version: "26.05.30.4",
        date: "May 30, 2026",
        highlights: [
            "📐 Extended COGO skill toolkit — 11 new CACP skills. The COGO Agent gains a comprehensive set of CACP-registered skills covering the full forward/inverse/intersection/curve/area/transform stack so other agents (Boundary, Stationing, Deed Reader, etc.) can delegate any standard COGO computation via `askPeer` instead of attempting it locally. New skills: `cogo_direct` (forward calc from PN or coords), `cogo_intersect_bb` / `cogo_intersect_bd` / `cogo_intersect_dd` (bearing/bearing, bearing/distance, distance/distance intersections), `cogo_curve_solve` (solve any horizontal curve from any two of {R, Δ, L, chord, T}), `cogo_area_polygon` (closed-polygon area in acres + sq ft and perimeter), `cogo_offset_line` (parallel offset of a line or polyline at signed distance), `cogo_subdivide_line` (divide into N equal parts), `cogo_traverse_close` (run traverse from courses, return closure error + ratio + adjusted points via compass rule), `cogo_transform_helmert` (2D Helmert from ≥ 2 control pairs), `cogo_geodetic_convert` (lat/lon ↔ project grid).",
            "📚 cogoLib — pure-math library backing the COGO skills. New framework-agnostic module tree at `utils/cogoLib/` so the same code is reusable from server-side scripts, tests, and other agents: `bearing.ts` (quadrant/DMS/decimal parsing & formatting), `curve.ts` (curve solver), `intersect.ts` (BB/BD/DD ray intersections with parallel/no-solution handling), `offset.ts` (polyline parallel-offset), `area.ts` (shoelace polygon area + perimeter), `subdivide.ts` (equal-part subdivision), `traverse.ts` (traverse closure + compass-rule adjustment), `transform.ts` (Helmert least-squares solver), `geodetic.ts` (lat/lon ↔ grid). Backed by `tests/cogoLib.test.ts` covering every function with reference outputs (forward/inverse round-trip, intersection symmetry, curve parameter cross-checks, traverse closure on a known polygon, Helmert recovery from synthesized noise).",
            "📍 `update_point_list` skill — authoritative point-list grouping. The Point Editor agent gains a new action skill so the Boundary Agent (and any other producer of grouped points) can land each drafted tract in its own named list rather than a shared 'Working Points' bucket. Inputs: `listId` (stable, derived from `listName` if omitted), `listName`, `points[]`, optional `removePointIds[]` (cleanup of prior draft), `replacePoints` flag, `isVisible` default. Outputs: `{ listId, pointCount }`. Tagged `type: 'action'` so the CACP loop-prevention follow-up applies (no infinite re-attempts after success). Boundary Agent now emits `update_point_list { listId: 'boundary-<fileId>' }` when re-drafting a tract — old PNs are stripped from any list before the new geometry merges in.",
        ],
    },
    {
        version: "26.05.30.3",
        date: "May 30, 2026",
        highlights: [
            "✏️ Boundary Editor — significant editing & rendering improvements. Floating editor gains tighter call-list editing, better POB handling, and an improved Draft / Draft All flow. Curve calls now render correctly even when only chord/radius are populated, and the closure summary's curve-completeness check no longer flags a 0-radius value as incomplete.",
            "🎨 DrawingCanvas — render-pipeline refinements. Curve handling, label hit-testing, and per-frame caching all tightened. The canvas no longer auto-fits the viewport on every points-changed re-render, so the user's chosen zoom and pan are preserved during draft / re-draft cycles.",
            "🔔 Notification Center — new floating component. Centralizes ephemeral status messages from CACP traffic, fieldbook events, and background skills into a single overlay (replacing one-off toast plumbing scattered across handlers). Respects the `showCacpNotifications` setting.",
        ],
    },
    {
        version: "26.05.30.2",
        date: "May 30, 2026",
        highlights: [
            "📄 PDF uncertainty highlights — text-anchor system. Completely overhauled the highlight pipeline so uncertainty annotations land on glyph-accurate text rather than fragile PDF-point coordinates Gemini was frequently inventing. New anchor hierarchy (preferred → fallback): (1) `textSnippet` — verbatim text excerpt (≤ 80 chars) from the page; the viewer locates it in the PDF.js text layer with whitespace-normalized matching and builds per-glyph rectangles. Optional `contextBefore` / `contextAfter` (≤ 40 chars each) disambiguate when the snippet repeats. (2) `box_2d` — `[ymin, xmin, ymax, xmax]` in 0–1000 normalized image-space (origin top-left), mapped back through the page's natural (unrotated, unscaled) viewport for raster-only regions. (3) Legacy free-form `boundingBox` accepted for back-compat but no longer generated. Text matching scores multiple candidates against ±80-char context windows (exact prefix/suffix = +2, substring = +1). Text-item parsing is cached per `${fileIndex}:${pageIndex}` so re-renders don't re-parse. Gemini prompts (`responseFormattingInstruction` + per-agent uncertainty paragraph) updated to require `textSnippet` whenever text is present and `box_2d` only for raster-only regions. App-side parsing now skips uncertainties with no usable anchor (logs a warning) instead of crashing the renderer.",
        ],
    },
    {
        version: "26.05.30.1",
        date: "May 30, 2026",
        highlights: [
            "⚖️ DevOps console — new Licenses & Monetization Audit tab. Added a dedicated `⚖️ Licenses` tab at devops.landsurv.ai that holds the authoritative third-party license registry for the entire stack (npm, Python, .NET, external binaries, cloud APIs, standards, and platforms — 50+ entries). Each entry is risk-rated (`safe` / `attribution` / `weak-copyleft` / `tos` / `review`), linked to both the upstream project and the full license text, and annotated with a plain-English note explaining what the obligation means for commercial SaaS resale. Includes search + risk + category filters, a risk-taxonomy legend, and a `🚦 Items That Could Affect Monetization` action-item spotlight covering: Gemini free-vs-paid tier data handling, Google Maps attribution / no-caching rules, Autodesk ADN plugin distribution model, Redis 7.4+ SSPL re-review trigger (with Valkey escape hatch), Docker Desktop seat-count thresholds, psycopg2-binary LGPL boundaries, and the umbrella Apache-2.0 / BSD attribution duty. Footer documents the maintenance rule: every new dep added to a package.json / requirements.txt / .csproj must add a row to `components/LicensesTab.tsx → ENTRIES[]` in the same PR. Headline finding: nothing in the current stack blocks commercial monetization of LandSurv.ai as a hosted SaaS.",
        ],
    },
    {
        version: "26.05.26.5",
        date: "May 26, 2026",
        highlights: [
            "📐 Stationing & CL agent — now handles PC/PT key stations, multi-offset, and end-of-alignment. Previously, asking the agent to ‘give 20' and 50' offsets at every PC and PT to end of alignment’ caused it to refuse, citing that PC/PT calculation, total alignment length, and multiple offsets were outside its scope (treating them as COGO). They aren’t — the loaded centerline geometry already defines all of those deterministically. Extended `stationingParameters` to accept (a) `keyStations: true` — host emits one point at every BOP, PC, PT, and EOP between `startStation` and `endStation`; (b) `endStation: \"end\"` magic string — host resolves to the last station of the loaded alignment; (c) `offset` as a number array (e.g. `[20, -20, 50, -50]`) — host takes the cross product of every station × every offset. Added a new `getCenterlineKeyStations()` helper in `utils/stationing.ts` that walks the alignment and emits labeled stations (`BOP`, `PC-1`, `PT-1`, `PC-2`, `PT-2`, …, `EOP`). Each generated point description now includes the key-station label (e.g. `PC-1 STA 137+42.18 OFF 20' RT`). Updated the agent’s system prompt and the global JSON schema doc so the model knows these capabilities exist and stops misrouting them to COGO.",
            "📄 Sheet View — bearing & distance annotations now render on viewports. Drawing Canvas was rendering the italic mid-line `bearing / distance` labels for every annotated line (boundary deeds, agent output, manual lines), but Sheet View’s viewport renderer only drew the line geometry, so the same parcel that read fully annotated on canvas dropped silently to bare line segments when viewed/exported in Sheet View. Added matching label emission to both `buildVpSvg` (live sheet preview) and `renderVpAt` (PDF export) — same skip rule (omit for `isCurve`), same flip-to-readable-orientation logic, and `labelRotation` + `labelOffset` are honored. Font size auto-scales to a ~2-ft target in world units, clamped 4–9 px on screen and 5–12 px in PDF, with a white stroke halo so text stays legible over crossing lines.",
            "📄 Deed Summary panel — shade in place + standard header color. Added the same shade-in-place behavior the Shrinkwrap and Inclusion Boundaries panels got in v26.05.26.3: the header bar stays draggable at its current position, click the horizontal bar to shade (collapses to just the header), chevron-down to restore. Also changed the panel header from the off-brand emerald green (`bg-emerald-900/50` / `text-emerald-200`) to the standard floating-panel chrome (`bg-gray-900/60` / `text-gray-200`) so it visually matches every other draggable panel in the app.",
            "↕️ Curve annotation — Ctrl+drag to reposition. The B+D label on straight lines was already Ctrl+drag-able (offset persisted in `labelOffset`), but the curve `R / L / Δ` text stack was pinned at `radius × 1.3` from the arc midpoint with no way to move it — labels of adjacent curves often overlapped on tight reverse curves. Now: curve labels honor the same `labelOffset` field, and the Ctrl+drag mousedown hit-test also walks curve lines. Rendering caches each curve label's world-space hit box per frame, so the drag picks up exactly the visible text block and updates `labelOffset` through the same `onUpdateLineLabelOffset` callback already used for B+D — meaning the curve offset persists with the line / deed and survives reloads.",
            "🔑 DevOps console — API key usage tab. New `🔑 API Keys` tab between Subscribers and Agents shows the most recent successful API key authentications: timestamp, key name, owner user id, tier, endpoint (METHOD + path), and source IP. Backend records a usage event in a 500-entry in-memory ring buffer every time `validateAPIKey` succeeds (Bearer or `X-API-Key` header path), with request context captured by `extractToken`. Events are also persisted fire-and-forget into a new Firestore `apikey_usage` collection (durable across restarts). New endpoint `GET /api/devops/apikey-usage?limit=N` (devops-token protected, max 500) prefers Firestore and falls back to memory; response includes `source` so the admin knows which served. Cloud Run also now mounts the `DEVOPS_PASSWORD` and `GMAIL_PASSWORD` secrets from Secret Manager, which previously weren't wired into the service env, so the login surface had no password to compare against and failed every attempt.",
            "📐 Stationing & CL agent — single-point requests no longer crash. A request like \"give me a lightpost point at 13+00 75' left\" was rejected client-side with `Invalid stationing parameters from AI - missing: interval`, because the host required `interval` even when no station range was implied. The validator now treats `startStation` alone (no `interval`, no `endStation`) as a valid single-station request and emits one point per offset at exactly that station. `interval` is still required when an `endStation` is given. Updated the CL agent's JSON schema doc and added a worked single-point example to the system prompt so the model knows it can omit `interval` for one-off stake requests.",
        ],
    },
    {
        version: "26.05.26.4",
        date: "May 26, 2026",
        highlights: [
            "🌱 Soils Agent — SSURGO fetch fixed (HTTP 400 ‘Invalid URL’). The Esri Living Atlas hosted feature service we were using (`USA_Soils_Map_Units_2`) was retired and the unsuffixed sibling now requires an ArcGIS Online token, so every Fetch Soil Map Units click was returning ‘SSURGO error 400: Invalid URL’. Rewrote `soilsService.fetchSsurgoSoils` to go straight to the authoritative public source — USDA NRCS Soil Data Access (SDA) — using the spatial-index-optimized `SDA_Get_Mupolygonkey_from_intersection_with_WktWgs84` stored procedure joined to `mupolygon` + `mapunit` to pull WKT geometries and attributes (MUKEY/MUSYM/MUNAME/FARMLNDCL/MUACRES) in one POST. Added a WKT POLYGON/MULTIPOLYGON parser, bbox finite/degenerate guards, and richer error messages with SDA response details. CORS-friendly and no auth required.",
        ],
    },
    {
        version: "26.05.26.3",
        date: "May 26, 2026",
        highlights: [
            "💡 Concierge — pulsing bulb launcher + persistent floating dialog. The public ‘Ask LandSurv.ai’ concierge is no longer a full input bar on the home screen — it’s now just the yellow pulsing lightbulb (same scale as the in-bar bulb) placed directly to the right of the LandSurv.ai™ logo. Clicking it opens a sharp 720×640 floating dialog (portal’d to `document.body`, ring-1 cyan accent, layered glow shadow, gradient header with bulb badge). The dialog is fully draggable, can be shaded in place via a new shade button in the header (collapses to just the header without losing position), and lives in a module-level store + `<ConciergeOverlay />` mounted at App root — so the dialog, its position, and the chat history all follow the user across every screen instead of unmounting when leaving home.",
            "🪟 Shrinkwrap + Inclusion Boundaries panels — shade in place. Both panels now shade in-place (header stays draggable at its current position) instead of docking to the bottom. Click the horizontal bar in the header to shade, chevron-down to expand. State is per-panel so each is independent.",
            "👁 Gimbal Vision HUD — closed by default. The Gimbal Vision HUD no longer opens automatically on app load. It still auto-opens when a new file is loaded or when a Civil Drafter scan starts, but otherwise stays out of the way until invoked.",
            "🛡 `[CACP RESULT]` parse-crash guard. The model-response JSON extractor (`extractBalancedJson`) used to grab the first `[…]` it saw and crash with ‘Unexpected token C, [CACP RESULT] is not valid JSON’. It now try-parses every candidate and skips bracketed protocol markers (`[CACP RESULT]`, `[OK]`, etc.) before settling on the real JSON payload.",
            "🌐 Dev proxy — graceful backend-offline behavior. The Vite dev proxy used to bubble `ECONNREFUSED` to the browser as raw 500s when the Express backend wasn’t running (noisy DevTools red text for `/api/streets`, `/api/devops/public/global-settings`, `/api/debug/log`). It now intercepts socket-level errors and returns shape-valid degraded JSON per endpoint (e.g. `[]` for `/api/streets`, `{ settings:{}, version:0, degraded:true }` for global-settings), tagged with an `X-Dev-Proxy-Degraded: 1` header. Production behavior is unchanged.",
        ],
    },
    {
        version: "26.05.26.2",
        date: "May 26, 2026",
        highlights: [
            "🔐 DevOps console — security hardening. The `/api/devops/login` and `/api/devops/request-mfa` endpoints now (a) accept a dedicated `DEVOPS_PASSWORD` env var so the admin console credential can be rotated independently of `GMAIL_PASSWORD` (legacy fallback preserved for backward compatibility), (b) compare passwords with `crypto.timingSafeEqual` instead of `!==` to eliminate timing-oracle leakage, and (c) enforce a per-IP rate limit of 10 attempts per 15-minute sliding window (returns 429 + Retry-After). No frontend changes — existing devops login UI works unchanged.",
            "📋 Home screen — new Job Info dialog (from .1). 3-section row (Job Info │ Set Projection │ Settings), teal modal capturing Client / Site / Job Scope / Topo+Stakeout, persisted in the existing `JobInfo` slot of the .lsvz bundle.",
            "🎡 Smooth horizontal marquees (from .1). Set Projection and the concierge placeholder scroll seamlessly via `lsa-marquee` CSS, with a globe icon leading every Set Projection and a yellow lightbulb leading every concierge prompt.",
            "🧱 Sheet View polish (from .1). 90% initial viewport, 8-direction edge-drag resize, Ctrl/Cmd-drag pan.",
        ],
    },
    {
        version: "26.05.26.1",
        date: "May 26, 2026",
        highlights: [
            "📋 Home screen — new Job Info dialog. Added a dedicated 3-section row below the menu bar (Job Info │ Set Projection │ Settings). The Job Info button opens a teal modal capturing shared project metadata: Client (Name / Address / Email / Phone), Site (Address / Municipality), Job Scope, Zoning District, Desired Use, and Topo / Stakeout checkboxes. All fields are optional and persist inside the existing `JobInfo` slot of the .lsvz bundle, making the data available to every agent that already consumes `jobInfo` (Civil Drafter, Boundary, CAD Manager, Zoning, etc.). The duplicate Projection and Settings buttons were removed from the upper menu bar so this row is the single source of truth for those actions.",
            "🎡 Smooth horizontal marquees. The home-screen ‘Set Projection’ button and the ‘Ask LandSurv.ai’ concierge placeholder no longer flip between rotating words — both now scroll seamlessly using a new CSS marquee (`lsa-marquee` + edge fade mask in `index.html`). The globe icon scrolls in front of every ‘Set Projection’ instance, and a yellow lightbulb leads every ‘Ask our LandSurv.ai Concierge general questions’ instance. The static lightbulb button on the concierge input bar is unchanged.",
            "🧱 Sheet View polish (carried from this cycle). Viewports now open at 90% of the sheet, support 8-direction edge‑drag resize with anchored corners (min 0.5″), and Ctrl/Cmd-drag inside a viewport pans the world coordinates instead of moving the viewport itself.",
        ],
    },
    {
        version: "26.05.25.1",
        date: "May 25, 2026",
        highlights: [
            "📐 Deed Reader — corner descriptions restored at draft. When the Boundary Agent (Deed Reader) returns a deed with corner monumentation (e.g. 'iron pin found', '1/2\" rebar set'), those descriptions now flow all the way through to the canvas: drafted boundary points are labeled with the call's `toDescription` instead of falling back to the generic `calc'd pt`. Root cause: the per-point description map was keyed by the AI's raw point labels (P1, P2, …) while the boundary calls reference the CACP-renumbered point numbers — the lookup silently missed every entry. Fixed by translating each AI label through `aiToCacpMap` and double-keying the description map.",
            "✏️ Boundary Draft — no more spurious 'Replace existing geometry?' prompt. Clicking Draft on a second tract after drafting the first one was triggering a confirm dialog that named the prior deed, leading users to think they had to delete the first deed before they could draw the second. The prompt is now removed: re-drafting the same boundary is idempotent (replaces only that file's own drawn points/lines), and drafting a different boundary never touches the first one's geometry.",
        ],
    },
    {
        version: "26.05.19.4",
        date: "May 19, 2026",
        highlights: [
            "🏠 Structures Agent CORS fix. NSI API calls now route through the backend proxy `/api/nsi/structures` instead of calling the USACE server directly from the browser. This resolves the CORS block that prevented Fetch FEMA Structures from working in production.",
            "📈 Profile Agent — client-side generation panel. New floating sky-blue panel (Profile Generator) opens automatically when the Profile & Cross Section Agent is activated. Enter from/to point numbers and click Generate Profile — no AI round-trip required. The profile is computed entirely client-side using the same TIN surface intersection algorithm. Shows elevation range, length, and point count. Export CSV button included.",
            "🗺️ Street Name Labels. New feature in the Structures Agent panel: 'Fetch Street Names' queries OpenStreetMap road data for the inclusion boundary area (via backend proxy `/api/streets`) and places bold blue text labels on the plan, each aligned to the bearing of the corresponding road centerline. Labels are saved in the .lsvz bundle under `streetLabels`.",
        ],
    },
    {
        version: "26.05.19.3",
        date: "May 19, 2026",
        highlights: [
            "📐 Contour Generations — mathematical representation. Contours now store their data as ContourGeneration objects with IsoPath[] (polylines at each elevation), not just raw SurveyLine segments. Multiple generations can coexist on the canvas simultaneously, each independently shown/hidden, color-coded, named, and saved inside the .lsvz bundle.",
            "🔄 Auto-regeneration on point removal. When survey points are removed from the surface, all ContourGeneration objects auto-regenerate in the background without requiring a manual re-generate. The mathematical representation (IsoPaths) is always in sync with the current point set.",
            "🗂️ Contour Generations Manager. New floating panel (amber accent) lists all generations with show/hide toggle, color cycling, opacity slider, rename (double-click), delete, and a 'Manage Generations' button in the agent toolbar. Opens automatically after the first generation and on .lsvz load.",
            "🌐 ESRI/State contour blend mode. Each ContourGeneration can enable 'Blend with ESRI/State Contours' — when active and an inclusion boundary is selected, ESRI contour line segments whose midpoint falls inside the polygon are suppressed. The result is 100% survey contours inside the inclusion and 100% ESRI outside. Draw blend curves at the boundary to transition smoothly.",
            "🤖 Claude 4.7 via Vertex AI. New agent model option accessible via the ✦ toolbar button. Settings panel (orange accent) mirrors the Gemini 3 controls interface. Configure model (Sonnet 4.7 / Opus 4 / Haiku 4), Vertex AI region, temperature, max tokens, and extra system instructions. Requests route through the /api/claude backend proxy — the frontend never holds raw GCP tokens.",
            "💾 ContourGeneration objects persist in .lsvz under the `contourGenerations` key.",
        ],
    },
    {
        version: "26.05.19.2",
        date: "May 19, 2026",
        highlights: [
            "🐛 Fix: missing `isGpsStakeoutFloatingVisible` / `isGpsCollectFloatingVisible` state declarations caused a blank load in build 3b5002c8. Unicode em-dash (\\u2014) in source file prevented earlier multi_replace from inserting them.",
            "🐛 Fix: `HomeIcon` missing from InitialAgentSelection import (structures agent card blank load in build 15ef56e).",
        ],
    },
    {
        version: "26.05.19.1",
        date: "May 19, 2026",
        highlights: [
            "📡 GPS Rover floating panels. Two independent FloatingPanels — Stakeout (blue accent) and Collect (emerald accent) — persist as HUDs across agent context changes. Both show a live signal quality bar (Excellent/Good/Fair/Poor based on GPS accuracy in feet) instead of the tab bar when in locked-tab mode. The home-screen agent card CTA buttons open their respective floating panel.",
            "🗺 FEMA FIRMETTE. The FEMA Flood agent can now fetch an 850×1100 PNG FIRMETTE from the NFHL MapServer, store it as a base64 data URL in `SessionState.floodFirmette`, and view it in a floating panel. The image persists in the .lsvz bundle.",
            "🔧 Shrinkwrap hull-vertex fix. The canvas was highlighting ALL source points including interior ones. Fixed to derive hull vertices only from the unique endpoints of the current hull lines.",
        ],
    },
    {
        version: "26.05.18.1",
        date: "May 18, 2026",
        highlights: [
            "🎨 Drafting Style Library — new CAD Manager sub-tool for training the Civil Drafter. Accessible via Views → Drafting Style Library. Upload example DXF files grouped by feature type (Roads, Buildings, Utilities, Boundaries, Vegetation, Water, Topography, Annotations). The client-side DXF parser extracts the full layer table with entity counts, entity types, linetypes, and ACI color swatches — no server round-trip required.",
            "✏️ Per-entry description: write plain-English conventions for each feature type (e.g. 'Roads are drafted with two parallel LWPOLYLINE on layer V-ROAD-EDGE, centerline on V-ROAD-CL with DASHDOT linetype'). Add layer annotations that pin specific notes to individual layer names. Upload reference images/screenshots as visual context.",
            "🤖 Civil Drafter training injection: everything in the library — descriptions, layer tables, layer annotations — is compiled into a DRAFTING STYLE LIBRARY block and injected verbatim into the Civil Drafter's system instruction at session start. The 'Preview Civil Drafter Context' button shows the exact text the agent will receive.",
            "💾 Library persists in the .lsvz session file and survives save/load/reset cycles.",
            "🔧 Build fix: resolved esbuild incompatibility with inline `import()` type expressions in function signatures in `geminiService.ts` and `App.tsx`. Also fixed a pre-existing unescaped backtick in the Boundary Agent system instruction that was silently breaking production builds.",
        ],
    },
    {
        version: "26.05.17.41",
        date: "May 18, 2026",
        highlights: [
            "🏗️ CAD Manager — layer authorship via CACP. New owned skills `cad_create_layer` (upsert a code + pointLayer + lineLayer + lineType triple into the loaded standard) and `cad_ensure_default_layers` (idempotently seed DEED → L-DEED-BOUNDARY, INCL → L-INCLUSION, EXCL → L-EXCLUSION, BRKL → L-BREAKLINE). Existing codes update in place; case-insensitive on `code`. If no standard is loaded, a minimal one is seeded automatically so authored codes have a home.",
            "📦 Boundary Agent (Deed Reader) is now authorized to author layers. System prompt updated to delegate to `cad_create_layer` whenever a deed describes a feature without a matching layer (riparian reserve, conservation easement, uncommon easement types). Standard property boundaries first try `cad_get_layer_for_code({code:'DEED'})` and only fall through to authorship when the resolution returns `unknown` — no more invented hard-coded layer strings.",
            "🎯 Draw Boundary auto-seeds default boundary codes on entry. Switched the lookup from `PROP` to `DEED` and calls `ensureDefaultBoundaryCodes()` first, so the first-ever press of Draw Boundary now lands on a real CAD-Manager-managed layer (L-DEED-BOUNDARY) instead of a magic string.",
        ],
    },
    {
        version: "26.05.17.40",
        date: "May 18, 2026",
        highlights: [
            "🗂️ Boundary Editor — quick visibility list. The editor now has a collapsible 'All Boundaries' rail just under the dropdown that lists every BoundaryFile as a one-line row with eye/select/count chips. Toggle Visible/Hidden on any boundary in a single click — no more dropdown→select→toggle dance when you have multiple deeds open.",
            "📎 Associate Points to a Boundary. New 'Associate Points' row in the Boundary Editor: tap '+ Selected (#PN)' to attach the currently-picked canvas point, or paste a comma-separated PN list. Associated points hide together with the boundary, persist in the .lsvz BoundaryFile under `associatedPointIds`, and unbundle with a tiny × on each chip. Hiding a boundary now also hides its drawn points + lines AND any user-associated points (via the new `SurveyPoint.hidden` flag, filtered in `visiblePoints`), not just the editor overlay.",
            "🎯 Draw Boundary — auto zoom-to-extents. After pressing 'Draw Boundary', the canvas auto-fits the new geometry so you actually see it instead of having to hunt the viewport (common when POB resolved to (0,0) or an off-screen location).",
        ],
    },
    {
        version: "26.05.17.39",
        date: "May 18, 2026",
        highlights: [
            "🟩 Inclusion Boundary Manager — name, store, show/hide, adjust, and delete inclusion polylines. New floating panel (auto-opens with every COGO shrinkwrap) lists every group of `type:'inclusion'` lines as a named entry (Shrinkwrap N / Inclusion N). Per-row controls: radio set-active, double-click rename, Visible/Hidden toggle (filters through `visibleLines` so the boundary disappears from canvas AND DXF export), Rename, Delete (with confirm), and an Adjust button on shrinkwrap-origin boundaries that reopens them in the live Shrinkwrap editor so you can exclude / restore points and the hull recomputes on the fly.",
            "🎯 Boundary selector in Contour & Flood panels. When more than one inclusion boundary exists, both Contour Generation and the Flood Zone Agent show a green 'Inclusion Boundary' dropdown plus a 'Manage…' link to open the manager. Choosing a specific boundary scopes contour/flood operations to that one polyline; leaving it on 'All' uses every inclusion line as before. Implemented via a non-rendering `activeInclusionBoundaryRef` so the existing handlers don't need to recreate on every active-boundary change.",
            "🔁 Multi-shrinkwrap coexistence. Every shrinkwrap session now gets its own unique `polylineId = shrinkwrap_<ts>_<rand>`, so starting a new shrinkwrap no longer wipes the previous one. The recompute effect filters by `polylineId` instead of `layer`, and Clear Shrinkwrap removes just that session's lines. Hidden state is preserved across hull recomputation — toggle a boundary off, exclude a point, the boundary stays hidden until you toggle it back.",
            "🧹 COGO Agent chat is now line-emission-free. Strengthened the COGO system prompt to forbid `lines:[…]` and `points:[…]` in chat JSON output, and added a defensive guard in `App.tsx` that suppresses any chat-emitted lines from the COGO Agent — its only line-producing channel is the `cogo_shrinkwrap` CACP skill, which routes through the typed-inclusion recompute effect. This fixes the bug where shrinkwrapping occasionally produced extra regular black lines alongside the green inclusion hull.",
            "✏️ New types: `SurveyLine.hidden?: boolean` (filtered in `visibleLines`) and `InclusionBoundary { id, name, polylineId }`. Both persist into .lsvz via the existing session-state serializer — your boundary names, hide-state, and active-boundary selection survive save/load.",
        ],
    },
    {
        version: "26.05.17.37",
        date: "May 18, 2026",
        highlights: [
            "🟢 Shrinkwrap polishes — the COGO Agent's `cogo_shrinkwrap` now emits inclusion-typed lines (no bearing/distance labels on the hull) and auto-opens a floating Shrinkwrap panel docked to the right edge after the polyline is drawn. The panel surfaces source-point count, hull-vertex count, the target layer, and a live list of currently-excluded points with one-click Restore / Restore All.",
            "👆 Exclude-by-click. While the Shrinkwrap panel is open, clicking a hull vertex on the canvas exposes an 'Exclude from shrinkwrap' action; the convex hull recomputes immediately and the polyline updates without a round-trip through the chat. Excluded points stay in the source list (so you can put them back) but are dropped from the live hull calculation.",
            "🧹 Clear Shrinkwrap. A single button purges the polyline from the canvas and ends the session — no leftover lines, no leftover layer noise.",
        ],
    },
    {
        version: "26.05.17.36",
        date: "May 18, 2026",
        highlights: [
            "🧮 COGO Agent joins CACP. Registered two owned skills in the Agent Registry — `cogo_inverse` (bearing & distance between two point numbers) and `cogo_shrinkwrap` (2D convex hull around the supplied or all-visible points, drawn as a closed polyline). Peer agents can now ask COGO for inverses and boundary hulls programmatically via `askPeer` instead of dragging the user into the COGO chat.",
            "🟦 'Calc' CTA on the COGO Agent card. New cyan pulsing action button — one click jumps you straight into the COGO workspace ready to dictate inverse calls or 'shrinkwrap the site' without going through the upload/intro screen.",
        ],
    },
    {
        version: "26.05.17.20",
        date: "May 17, 2026",
        highlights: [
            "🎨 Homepage polish round — the privacy callout was 'too loud' and the action buttons didn't carry the agent's color. Fixed both: new `PrivacyRotator` component replaces the green glowing pill with a subtle dark glassy chip that rotates through 'No Sign-Ups → No Logins → No Cloud Storage' in soft cyan every ~2.4s (no smiley, no green dot), and the three existing CTAs were recolored to match their agent's homepage card — Boundary Editor stays green, Load Points went red→yellow, and New Standards went lavender→indigo. New per-color shimmer/pulse keyframes (`pulse-yellow-cta`, `pulse-indigo-cta`, `pulse-fuchsia-cta`, `pulse-sky-cta`) live alongside the original red/green/lavender in `index.html`.",
            "✨ Two new agent CTAs join the family: 🟪 fuchsia 'AI Draw' on the Civil Drafter card (one-click into the Civil Drafter agent — same as clicking the card, but surfaces what the agent actually does), and 🔵 sky-blue 'New Profile' on the Profile & Cross Section card (jumps straight into the workspace, no upload screen). Both pulse + shimmer in their agent color.",
            "🤝 Profile & Cross Section is now CACP-enabled. Registered in the Agent Registry with two skills — `generate_profile` (elevation profile along a SurveyLine or between two point numbers, configurable sample interval) and `generate_cross_section` (perpendicular section at a centerline station with left/right offsets). Peer agents can now request profiles/sections programmatically instead of bouncing the user into the Profile workspace.",
            "🗺️ Chester County, PA added to the GIS Boundary parcel dropdown. Wired up the verified ArcGIS REST endpoint `services.arcgis.com/G4S1dGvn7PIgYd6Y/.../Parcels_owners/FeatureServer/0` with UPI as parcel ID (with PIN_COMMON / PIN_MAP / PIN_ASMNT fallbacks) and OWN1/OWN2 as owner fields.",
            "🔌 DevOps Console connectivity — the panel was failing 'Failed to save global settings' and the legal-signatures tab returned empty because the backend was trying to talk to a Postgres database that was never wired up in Cloud Run. New `firestoreStore.ts` shim transparently routes global-settings reads/writes and legal-signature CRUD to Firestore when available (with a Postgres fallback preserved for any future migration), so agent retire / agent reorder / banner edits actually persist world-wide and captured signatures show up in the Legal tab.",
            "🔨 Bug squash: hotfixed a TDZ regression where the new Flood Agent CACP `useEffect` was declared above its `handleFetchFloodZones` const — the minified bundle crashed at boot with `Cannot access 'GE' before initialization` and the entire app stopped mounting. Moved the effect after the const declarations and shipped.",
        ],
    },
    {
        version: "26.05.17.19",
        date: "May 17, 2026",
        highlights: [
            "💜 Lavender 'New Standards' CTA on the CAD Manager card. Third in the pulsing-action-button family (red 'Load Points', green 'Boundary Editor', now lavender 'New Standards'). Click it to bypass the upload/intro screen entirely and drop straight into the CAD Standards Manager interface — the agent session is kicked, the chat is initialized in the background, and you land on the standards editor in a single click. Same shimmer + pulse animation as the red and green CTAs, just in violet-400→purple-500→violet-600 gradient with an `rgba(167,139,250)` glow to telegraph 'instant action, skip the prelude'.",
            "🔀 Civil 3D Plugin card moved after DXF Analyzer on the homepage. The plugin entry now sits with its CAD-tooling neighbors (DXF Analyzer → Civil 3D Plugin) instead of leading the card grid, putting the actual surveying agents (Boundary, Point Editor, RAW Crawler, Civil Drafter) front-and-center for first-time visitors.",
            "↕️ Admin-controlled agent ordering — homepage cards AND sidebar menu. New DevOps Console section on the Agents tab with two side-by-side reorder lists (🏠 Homepage Cards / 📑 Sidebar Menu). Move any agent up/down with ▲/▼ arrow buttons and the new order persists to the world via `agentOrderHome` / `agentOrderSidebar` fields on the Postgres `global_settings` table. Every connected client picks up the new order within ≤60s on already-open tabs (instant on next boot) via the existing `subscribeGlobalSettings` channel. Agents missing from the saved order fall through to the static default at the end — so adding a new agent in code automatically appears at the bottom of every custom order without breaking anything. Per-list 'Reset' button clears the override and restores the static default.",
            "😊 Privacy pill is now impossible to miss. The 'No sign-ups · no logins · no cloud storage' message on the homepage header and Welcome modal got a major glow-up: bumped from tiny muted-gray text to bold white at `text-sm/text-base`, wrapped in a green-to-emerald gradient pill with a green-400 border and a soft 18-22px green glow, prefixed with a 😊 smiley, and the green status dot now pulses. First-time visitors can see the local-first promise from across the room.",
        ],
    },
    {
        version: "26.05.17.18",
        date: "May 17, 2026",
        highlights: [
            "🟢 Boundary Editor CTA on the homepage. The Boundary Agent card now sports a pulsing green 'Boundary Editor' button — the green twin of the red 'Load Points' button on the Point Editor card. Click it to skip the deed-paste step entirely and drop straight into a blank manual-entry boundary session with the floating Boundary Editor open and a POB seeded at the origin. Same shimmer + pulse animation as the red CTA, just in alerting emerald-green to telegraph 'instant action, no AI required'.",
            "🔒 Privacy-first messaging laced through the opening. The homepage header now carries a small unobtrusive pill under the tagline: 'No sign-ups · no logins · no cloud storage — your project (.lsvz) stays on your device.' Same line appears in the Welcome modal so first-time visitors immediately understand the local-first model: there is no account to create, no server to upload to, and the .lsvz session file lives on the user's disk — LandSurv.ai is a browser-side tool that touches the network only for the AI calls and public-data lookups it performs on the user's behalf.",
        ],
    },
    {
        version: "26.05.17.17",
        date: "May 17, 2026",
        highlights: [
            "⚖️ Legal language correction — LandSurv.ai no longer reads as if a Professional Land Surveyor (P.L.S.) license is required to use the tool. The first-time signature gate, the agreement checkbox, and the legal.landsurv.ai 'Intended Use' section have all been rewritten to make clear that anyone may use the platform — surveyors, engineers, students, GIS analysts, planners, property owners, real-estate pros, and the curious public. The verification requirement still stands for regulated work (legal, regulatory, boundary, design, construction), but it is framed as the user's responsibility rather than as a precondition for access. Name field placeholder updated from 'Jane Smith, P.L.S.' to plain 'Jane Smith'.",
            "✍️ Legal signatures now flow through to the backend and DevOps Console. New Postgres table `legal_signatures` (name, email, signature PNG dataURL, agreement version, signed_at, IP, user-agent) backed by `POST /api/legal/sign` (public, payload-validated, 500KB signature cap). The SignatureForm fires the POST in the background on submit — the localStorage record still drives gate dismissal so a backend outage never blocks first-click. New DevOps Console tab ✍️ Legal lists every captured signature in reverse-chrono order with name, email, version, IP, and an inline thumbnail of the actual drawn signature; click the thumbnail for an enlarged modal preview with full user-agent and IP.",
        ],
    },
    {
        version: "26.05.17.16",
        date: "May 17, 2026",
        highlights: [
            "🌊 New Flood Zone Agent. Looks up FEMA National Flood Hazard Layer (NFHL) polygons for any project area and drops the regulatory floodplain rings straight onto the canvas as a flood layer. Mirrors the Contour Agent's two-mode UX: type a free-text description (geocoded via Nominatim, e.g. 'Lower Merion Township, PA' or '123 Main St, Norristown, PA') OR draw an Inclusion boundary on the canvas first and the agent uses its bbox. Hits ArcGIS REST endpoint MapServer/28 (S_FLD_HAZ_AR), reprojects client-side into the project EPSG, and tags every segment with its FEMA zone code so each zone (FEMA-FLOOD-AE, FEMA-FLOOD-X, FEMA-FLOOD-VE, …) becomes its own CAD layer for independent styling and visibility control. New SurveyLine type `'flood'` renders cyan-dashed on the canvas to read distinctly from amber parcel boundaries and gray contours. Live result panel shows polygon counts per zone code (AE, AH, AO, VE, X, X-Shaded, etc.) with a one-click 'Clear flood lines' undo.",
            "🪟 Floating dialog pilot — components/FloatingPanel.tsx. The Flood Agent panel is the first dialog that lives in a draggable, viewport-bounded floating card instead of the docked sidebar. Grab the gray header bar to reposition (pointer events: mouse + touch + pen), and the panel auto-clamps to the viewport so it can't get dragged off-screen on window resize. Built as a reusable wrapper (any child component goes inside), explicitly intended as the pattern we'll migrate other tool dialogs to going forward so the canvas stays the star of the screen.",
        ],
    },
    {
        version: "26.05.17.15",
        date: "May 17, 2026",
        highlights: [
            "🛠️ Hotfix: WMS image loader was missing its Promise.all and closing braces from the v26.05.17.14 corsProxy refactor — `npm run build` rejected DrawingCanvas.tsx with `Expected ';' but found ')'` at line 717. Re-closed the .map(async layer => …) callback, added the (await Promise.all(imagePromises)).filter(Boolean) collector, and Cloud Build now goes green end-to-end. Apologies to anyone who hit the red FAILURE in their build history.",
            "⚖️ Legal page rebranded to match the homepage. legal.landsurv.ai now wears the official cyan-Surv / green-.ai header on the same gray-800 canvas as the main app — no more amber-on-gradient mismatch. Copy tightened to a tad briefer while staying authoritative, and a new green Pennsylvania-Based Compliance Commitment callout explicitly states that as a Pennsylvania-based business, LandSurv.ai is invested in complying with all applicable rules and regulations (63 Pa. C.S. § 501 et seq. and every parallel state-board statute).",
            "✍️ First-time legal agreement gate. New components/LegalAgreementGate.tsx blocks the very first agent click after splash + API key: name + email + drawn signature + 'I acknowledge' checkbox, summary of terms, link back to the full legal.landsurv.ai page. Signature is persisted to localStorage under `landsurv-legal-agreement-v1` with timestamp, version stamp, signature PNG dataURL and user-agent — so the gate appears exactly once per device. The same form is embedded on legal.landsurv.ai (#sign section) so a redirected user can complete it without leaving the page. Backend audit POST is best-effort via a future /api/legal/sign endpoint.",
            "⛰️ TIN MVP — Triangulated Irregular Network as a first-class object. New types.ts TinSurface mirrors BoundaryFile (id, name, createdAt, vertices, triangles[][3], hidden, color, sourcePointIds) and is added to SessionState.tinSurfaces so it persists in .lsvz. New services/TinService.ts ships a self-contained Bowyer-Watson Delaunay triangulator (no external dep), barycentric Z-interpolation via sampleElevationAt(tin, e, n), and a sampleElevationsForPoints(tin, points) helper that returns updated points with TIN-derived elevations + sampled/skipped counts. UI surfacing (canvas wireframe overlay, Data Visibility toggle, contour-panel 'Create TIN' button, point-selection 'Sample Z from TIN' action) is wired in the next drop — this release lands the math + persistence layer.",
        ],
    },
    {
        version: "26.05.17.14",
        date: "May 17, 2026",
        highlights: [
            "🗺️ Four more PA counties for tax-parcel overlay — Bucks, Berks, Lehigh, and Philadelphia. Boundary Agent → County Parcels now lists Montgomery + Bucks + Berks + Lehigh + Philadelphia. Each entry was probed live against the ArcGIS REST endpoint to confirm geometry type (esriGeometryPolygon), spatial reference, and field names: Bucks uses PARCEL_NUM / OWNER1+OWNER2 on wkid 3857; Berks uses PROPID / NAME1 on wkid 2272 (PA State Plane South); Lehigh's polygon fabric is FeatureServer/1 (not /0 — that's a point layer) with PIN on wkid 2272; Philly uses DOR_Parcel's `parcel` field on wkid 3857.",
            "🛰️ WMS layers now actually display. Root cause: api.allorigins.win started returning 408 Request Timeout in early May, so the WMS pipeline's hard-coded proxy silently failed — img.onerror fired, the image was discarded, and no UI error surfaced. Built a new utils/corsProxy.ts helper with a prioritized proxy chain (api.codetabs.com → api.allorigins.win → corsproxy.io) that tries each in turn for both JSON capabilities calls AND binary image tiles. DrawingCanvas's WMS image loader and utils/wms.ts's GetCapabilities call both swap to the helper. Adding/reordering proxies is now a one-line change in the PROXIES array.",
        ],
    },
    {
        version: "26.05.17.13",
        date: "May 17, 2026",
        highlights: [
            "🟧 Boundary Object is now a real first-class object. The Deed Reader no longer auto-plots a parallel stack of white SurveyLines under the amber overlay — the BoundaryFile IS the visual representation (single amber dashed polyline showing the misclosure leg). The misclosure leg is what gets saved to .lsvz and what the editor table edits. Use 'Draw Boundary' in the editor when you're ready to commit it to real CAD-Manager-styled linework (layer / color / linetype from your standard); the original Boundary Object stays alongside as a preview and can be hidden with one click. No more duplicate geometry, no more white noise under the real layers.",
            "↔️ Translate + Rotate a Boundary Object before drawing. The editor now has a Transform row (ΔE, ΔN, Rot°, Reset) — pan and spin the entire boundary about its POB and the amber preview moves live on canvas. When you then click 'Draw Boundary', the linework is committed with the transform baked in, so you can drop a deed onto an existing point or align it to an existing monument in seconds.",
            "🧮 Typed deed lines (breakline / inclusion / exclusion / contour / parcel) still draw immediately the way they always did — only the closed boundary traverse defers to the Boundary Object.",
        ],
    },
    {
        version: "26.05.17.12",
        date: "May 17, 2026",
        highlights: [
            "🧠 LandSurv.ai super-brain — CACP + LSVZ unified into a Project Knowledge Base. New services/KnowledgeBase.ts is a single, queryable, persistent fact store every agent reads from and writes to. Boundary Agent parses a deed and the parser auto-extracts deedMetadata (owner / parcelId / book / page) AND scans every line description for right-of-way calls (regex covers '33\' ROW', 'ROW = 33 feet', '33 ft wide right-of-way') and pins each one as a deed.row fact keyed by street name. Zoning Agent's get_zoning_requirements handler auto-pins district / front+side+rear setbacks / maxHeight / minLotArea / lotCoverage as zoning.requirements facts. Every fieldbook entry mirrors to the KB so the audit trail is queryable. So now: ask Civil Drafter to draw the 33' ROW along Main Street → it reads the fact from the KB (which Boundary Agent recorded earlier) and draws it. No re-prompt, no re-parse, no second API call.",
            "🔍 Agents can recall and search the KB autonomously. Every CACP-enabled agent's system prompt now gets a fresh 'PROJECT KNOWLEDGE BASE' block listing the 30 most recent facts grouped by category, and a new {recallFact:{category,subject,predicate,query,reason}} JSON tool call that the App.tsx parser dispatches to knowledgeBase.search/queryFacts and re-runs the original request with the answer prepended as context. The LSVZ Orchestrator now exposes two new CACP skills — kb_query and kb_record — so any agent can also hit the KB via askPeer. Window devtools hook __kb (.all/.recent/.query/.search/.stats/.summary) for live introspection.",
            "💾 Knowledge Base persists with .lsvz. SessionState gained a knowledgeFacts array — every fact travels with the session, so closing and re-opening the workspace restores the full shared memory across all agents (deed ROW widths, zoning lookups, parcel ids, monuments).",
            "🔧 DevOps Console resilience: when the admin global-settings GET fails (cold backend, migration in flight), the Agents tab now falls back to defaults so the retire-agent checkboxes stay interactive instead of locking up. The error banner still shows so the failure is visible.",
        ],
    },
    {
        version: "26.05.17.11",
        date: "May 17, 2026",
        highlights: [
            "🤝 CACP autonomy upgrade — agents now know about each other and delegate automatically. Every CACP-enabled agent's system prompt gets an auto-generated 'Available Peer Agents' manifest listing every peer's skills + input schema, plus a 'Recently Obtained Information' block that surfaces the most recent 5 cached peer answers so an agent reuses them without re-asking. The Boundary Agent specifically got an explicit 'When You Don't Know Something' rule that maps setbacks / max-height / lot-coverage / min-lot-area requests to the Zoning Agent's get_zoning_requirements skill. Agents can now emit a {askPeer:{skillId,payload,reason}} JSON tool call; the App.tsx response parser dispatches it via the new interAgentComm.askPeer() helper (auto-routes via agentRegistry.findOwnerOfSkill), then re-runs the original query with the peer's answer prepended as context — the user sees a single ✅ CACP card followed by the finished task. Zoning Agent's get_zoning_requirements handler now caches every result with a 10-min TTL so the Boundary Agent reuses fresh lookups instantly. Net effect: ask the Boundary Agent to draw setbacks → it sees the recent zoning answer in its prompt and just draws them (no manual hand-off).",
        ],
    },
    {
        version: "26.05.17.10",
        date: "May 17, 2026",
        highlights: [
            "🏛️ County GIS tax-parcel overlay — Boundary Agent now ships with a parcel fetcher that mirrors the contour service: pick a county (starting with Montgomery County, PA via gis.montcopa.org), choose Inclusion mode (uses a polygon you drew with the canvas Inclusion tool) or Describe mode (free-text geocoded via Nominatim), and parcel polygons render as amber lines tagged layer='COUNTY-PARCEL'. Handles ArcGIS REST service-info → reproject bbox → query → reproject back, returns parcel IDs + owner names in a side list, and warns on transfer-limit truncation. PARCEL_GIS_SERVICES registry is the single place to add more counties.",
        ],
    },
    {
        version: "26.05.17.09",
        date: "May 17, 2026",
        highlights: [
            "🌎 DevOps moved to the server. Retired-agent toggles, the announcement banner, and the new maintenance kill switch now live in a Postgres-backed global_settings table and propagate to every browser within ~60 s (the public read endpoint is unauthenticated and cached for 10 s, fail-open on DB errors). The DevOps Console gained a 🌎 Global tab with banner editor, maintenance mode, raw JSON viewer, and a full 20-entry audit history (time / version / by / IP / diff). The Dashboard tab now shows live ops cards — health, subscribers, global version + retired count, last push. Writes use optimistic concurrency (expectedVersion → 409 on conflict) and every change is audit-logged.",
            "✏️ Annotation notes now move like point descriptions. Ctrl+drag the leader/note to reposition per-point, Shift+click to mirror it left ↔ right. Overrides live on the point (annotationOffset) so they persist in .lsvz and survive zoom/pan. Mirroring right-aligns the text so the underline still reads naturally toward the bend.",
            "🚪 Boundary Agent rename polish: fixed broken handleLogout refs in the DevOps Console (would have crashed on logout).",
        ],
    },
    {
        version: "26.05.17.08",
        date: "May 17, 2026",
        highlights: [
            "🏛️ Deed Reader & Plotter is now the Boundary Agent — same engine, broader scope. Comprehensive rename across the UI (home-screen card, sidebar, help, chat headers, CACP activity log, settings, sitemap, roadmap), the public concierge chatbot, the agent registry, the system prompts (with a naming note so the model still answers to the old names), and SEO/OG meta. The deed.landsurv.ai landing page stays live as a redirect-style notice (same URL, renamed content) until a dedicated boundary.landsurv.ai page ships. .lsvz session files remain fully backward-compatible — the underlying AgentType enum value is unchanged.",
            "📖 About page — unified & rewritten. The two competing About sections (\"Welcome to LandSurv.ai\" and the orphan \"Introducing LandSurv.ai\" inside ForwardThinkingPageContent) have been consolidated into a single, professional About that covers the full current scope: Boundary Agent, CAD Manager + Annotate Manager + Symbol Manager, GNSS RINEX post-processing, AR View, Civil Drafter, bidirectional Civil 3D sync, the freemium Load Points flow, the .lsvz container format, the BYOK privacy model, and the engineering/mathematical foundations underneath the AI layer.",
        ],
    },
    {
        version: "26.05.17.07",
        date: "May 17, 2026",
        highlights: [
            "✨ Annotate Manager — AI Assist: Added an AI-assist box in the rule editor. Type a natural-language feature (e.g. 'sanitary invert' or 'fire hydrant') and Gemini (2.5-flash) drafts a full rule skeleton — name, match terms with wildcards, leader-note template with the right {placeholder} tokens, category (existing vs proposed), and a sensible leader offset. Skeleton lands directly in the editor where you can tweak before saving. Gated by API key: shows a hint to add a Gemini key in Settings when offline, the pure-pattern editor remains fully usable without one.",
        ],
    },
    {
        version: "26.05.17.06",
        date: "May 17, 2026",
        highlights: [
            "🔓 Point Editor Works Without a Gemini Key: The Point Editor no longer throws an Initialization Error when you click 'Load Points' on a fresh browser with no API key configured. The chat side of the agent is now best-effort — if there's no key, we silently skip the AI hookup and you still get full client-side point upload, parsing and display. Add a key in Settings later to unlock chat / COGO / plot.",
            "🎨 Load Points button right-sized: shrunk to match the CACP badge dimensions so it sits cleanly under the Point Editor card title instead of dominating the whole card.",
        ],
    },
    {
        version: "26.05.17.05",
        date: "May 17, 2026",
        highlights: [
            "📝 Annotate Manager — New CAD Manager view for leader-line notes that automatically attach themselves to points whose description matches a rule. Built on the same matching engine as the Symbol Manager (wildcards, longest-term-wins, isDefault fallback), so a rule like *inv* will tag every invert without touching the rest of the file. Each rule has: name, Existing/Proposed category, match terms, a note template with {description} / {elevation} / {pointNumber} / {northing} / {easting} / {layer} placeholders, world-unit leader offset, per-rule color and per-rule scale.",
            "📏 Global Annotation Scale Slider — Added next to the Symbol Scale slider in the canvas Annotation Scale flyout, and also in the Annotate Manager itself. Behaves identically to the symbol slider: global value multiplies per-rule scale, so finalScale = global × rule.scale.",
            "💧 Starter Rules Included — Two starter rules ready to seed with one click: Invert (matches *inv*, prints 'INV={elevation}\\n{description}') and Utility Pole (matches *pole*, *pp*, prints 'UTILITY POLE\\n{description}'). Use them as templates for your own.",
            "💾 Session-Persisted — Rules and global scale serialize into .lsvz alongside Symbols, so loading a saved session restores your annotation library exactly as you left it.",
        ],
    },
    {
        version: "26.05.17.04",
        date: "May 17, 2026",
        highlights: [
            "🔴 Load Points — Instant Point Upload from the Home Screen: The Point Editor card now sports a pulsing red 'Load Points' button. Click it and you go straight into the Point Editor with the upload picker already open. Drop a .csv / .txt (P,N,E,Z,D) and your points render immediately — fully client-side parsing, no AI inference, no sign-in, no API key required. Works even when the cloud / CACP layer is offline, so prospective users can see their data in the viewer on the very first click.",
        ],
    },
    {
        version: "26.05.17.03",
        date: "May 17, 2026",
        highlights: [
            "📏 Global Symbol Scale Slider \u2014 New slider in the canvas toolbar's Annotation Scale flyout (right under Dimension Scale) that applies a global multiplier to every symbol on the canvas. Pair it with a per-symbol Scale Factor in the Symbol Manager to get exactly the size you want without re-editing every entry.",
            "🩹 Per-Symbol Scale Override No Longer Resets on View Switch: Two bugs were ganging up on the per-symbol Scale Factor in the Symbol Manager. (a) The slider only persisted when you clicked 'Update Symbol' \u2014 so adjusting and bouncing to another view threw the change away. Slider now live-saves while you drag, no button click required. (b) Symbols mirrored from the CAD Manager standard were re-initialized to 1\u00d7 every time the standard reloaded (which happens whenever you switch views). The mirror now carries forward whatever scale you set, so your override sticks across view switches and standard refreshes.",
        ],
    },
    {
        version: "26.05.17.02",
        date: "May 17, 2026",
        highlights: [
            "✨ Symbol Generation \u2014 Better Brain, Better Drawings: AI symbol generation now runs on gemini-2.5-pro instead of -flash, with a tightened prompt that explicitly distinguishes outline geometry from solid fills. The previous model was stuffing complex line-art icons (like the wheelchair) entirely into the fillPath, producing a solid silhouette with no readable detail. New rules: fillPath is reserved for small accents (center dots, letter glyphs) and EVERYTHING else \u2014 frames, wheels, figures, hatching \u2014 goes in svgPath as outlines. Added a wheelchair example to the prompt so the model has a worked reference for multi-element line-art symbols. Generation takes a beat longer but the results are notably crisper and more recognizable.",
        ],
    },
    {
        version: "26.05.17.01",
        date: "May 17, 2026",
        highlights: [
            "📐 Multi-Tract Deeds \u2014 One Boundary Object Per Description: Parsing a deed with multiple tracts/descriptions now spawns a separate boundary file for each one instead of cramming every leg into a single object. Each tract is auto-named from the deed's parcel ID (or owner / filename) with a 'Tract N' suffix when there's more than one, e.g. 'BK 006 PG 0614 - Tract 1', '- Tract 2', etc. Show/hide, rename, closure-report, write-legal and draw all work independently per tract \u2014 so you can isolate, edit, or hide each parcel without disturbing its neighbors. Tract detection chains the from\u2192to graph and emits a boundary file every time a loop closes (or a terminal chain runs out of next-edges).",
            "✏️ Draw Boundary Onto Linework: New Draw Boundary button in the Boundary Editor toolbar. Click it and the selected boundary's calls get rendered onto the canvas as real survey points + lines on the configured layers \u2014 perfect for boundaries loaded from CSV or hand-entered that have no backing geometry. POB resolution prefers an existing point with the matching number; falls back to a per-file POB override; finally anchors at (0,0). Layer resolution uses your loaded CAD Manager standard if available (deed/property layer via resolveCode), else falls back to L-DEED-BOUNDARY for lines and V-NODE for points. Re-drawing a previously-drawn boundary prompts to replace the prior geometry so you don't get duplicates. Honours both straight calls (bearing/distance) and curves (radius/arc length + tangent bearing).",
        ],
    },
    {
        version: "26.05.16.16",
        date: "May 17, 2026",
        highlights: [
            "🧹 CAD Standards \u2014 Refresh Wipes the Slate Again: Yesterday's persistence fix swung too far. The editor's Save button was auto-writing to localStorage and the page was auto-restoring the last session on mount, so a hard refresh wouldn't clear stale data. Reverted both auto-behaviors: editor Save now only commits to the in-memory context (so view switches still keep your edits), and a page refresh starts with a clean slate. The explicit Save Session and Load Session buttons remain the only paths in and out of disk storage \u2014 nothing sticks unless you ask for it. Includes a one-time cleanup that wipes any sessions silently auto-saved by v26.05.16.15.",
        ],
    },
    {
        version: "26.05.16.15",
        date: "May 17, 2026",
        highlights: [
            "🐛 CAD Standards — Surveyor Roster (Round 3, Actually Fixed): The previous two rounds wired the save path and the remount rehydration, but users were still seeing surveyors disappear after a Standards → Canvas → Standards trip. Root cause: on every remount, the `CadManagerPage` mount effect was auto-loading the last session from `localStorage` and dispatching that stale snapshot back into the context — overwriting the in-memory edits (which only the editor's Save button persists to context, not to disk). Fix: the mount loader now only restores from disk when the context is empty. If the context already holds a live standard, it's left alone and just adopts the existing session ID. Additionally, the editor's Save button now also writes through to `localStorage` when a session is active, so edits survive a full page reload, not just in-app navigation.",
            "🔎 CAD Standards — Searchable Layer / Linetype / Category Dropdowns: When you click into a Point Layer, Line Layer, Linetype, or Category cell, you now get an autocomplete list of every value already in use on the standard. Just start typing to filter (substring match, case-insensitive), use ↑/↓ to highlight, Enter or click to commit. The list is pulled live from the codes in the editor (and, for Linetype, also from the standard's defined linetypes), so picking the right one across a 193-layer standard takes a second instead of scrolling. Tab still advances to the next column.",
        ],
    },
    {
        version: "26.05.16.14",
        date: "May 17, 2026",
        highlights: [
            "🐛 CAD Standards — Surveyor Roster Survives Page Navigation: Follow-up to yesterday's persistence fix. Even with the save path fully wired, leaving the Standards view for the Canvas view (and coming back) was showing empty surveyors again. Root cause: `CadManagerPage` unmounts on every visual-panel switch, dumping its local `currentStandard` state. The CadManager context (mounted at App level) was holding the saved data correctly, but the page never rehydrated from it on remount. Added a sync effect that pulls `state.standard` from the context into local state whenever the context's reference changes — so navigation, reloads from session storage, and external edits all flow through cleanly. Your team's surveyors + aliases now stick around between Standards/Canvas/AR/etc.",
        ],
    },
    {
        version: "26.05.16.13",
        date: "May 16, 2026",
        highlights: [
            "🐛 CAD Standards — Team Codes Now Actually Persist: Critical fix — adding surveyors to the Team Codes roster (and accepting their code matches) was being silently dropped every time the Standards editor closed. Root cause: `surveyorCodeSession` and `f2fSettings` were never saved as part of the `StandardDefinition`. Now both travel with the standard, are hydrated on editor open, and round-trip cleanly through save. Plus: close-without-saving now prompts a confirmation if you have unsaved changes; the per-row surveyor-alias dropdown auto-resets when the currently-selected surveyor is removed; and orphaned `surveyorAliases` entries are garbage-collected when their owning surveyor is deleted (no more stale references).",
        ],
    },
    {
        version: "26.05.16.12",
        date: "May 16, 2026",
        highlights: [
            "✍️ CAD Standards — Editable Surveyor Aliases: The per-surveyor alias cell in the CAD Standards editor is now click-to-edit. Pick a surveyor from the column header dropdown, click any — (or existing alias) in their column, type the surveyor's code, Enter to save / Escape to cancel / blur to commit. Clearing the field removes their alias for that master code. Honours the existing undo/redo stack, so a bad keystroke is one Ctrl+Z away. No more re-uploading a code file just to fix one alias.",
        ],
    },
    {
        version: "26.05.16.11",
        date: "May 16, 2026",
        highlights: [
            "🔎 Find Points by Description: The canvas Zoom menu now has a second option — **Find Points** — next to the existing Zoom to Point. Type something like 'show me sign points', 'iron pins', or 'EP' and a floating panel lists every matching point (filtered live across description, point number, and CAD layer). Click any result to zoom to it; the panel stays open so you can sweep through all matches in sequence. Natural-language prefixes like 'show me' / 'find' / 'where are' are stripped automatically so the surveyor can type the way they'd ask an agent. Results are capped at 200 to keep huge jobs snappy.",
        ],
    },
    {
        version: "26.05.16.10",
        date: "May 16, 2026",
        highlights: [
            "⚡ Live Streaming Canvas Preview: As any agent writes its JSON response, points and lines now appear on the canvas the moment each `{ ... }` object closes — you no longer wait for the whole answer to finish before seeing geometry. A new partial-JSON parser walks the streaming text every ~120ms, extracts whatever `points` / `lines` objects are already complete, and merges them into `DrawingCanvas` as a transparent overlay. Preview points + lines are cleared when the stream finishes (the authoritative parser commits the final, corrected geometry), if you hit Stop, or on error. Works for every agent that emits points/lines (Deed Reader, RAW Crawler, Civil Drafter, Civil Plan Expert, GIS, Image Analyzer, COGO, etc.).",
            "⚡ Civil Drafter — Skip the Upload If You Already Have Points: If you've loaded points (RAW Crawler, Point Editor, a saved session, anywhere) and then switch to the Civil Drafter agent, you no longer get bounced to the file-upload screen. The agent now auto-initializes against the points already on the canvas, drops you straight into the canvas view with the chat panel open, and is ready for 'draw the road edges' style prompts. If a DXF training template is active it's still applied. Falls back to the upload screen only if no points are loaded.",
        ],
    },
    {
        version: "26.05.16.09",
        date: "May 16, 2026",
        highlights: [
            "🔗 Symbol Library Unification: CAD Standards and the Symbols view now share one library. Any symbol you assign to a code in the CAD Standards view (uploaded DXF, AI-generated, or picked from the preset library) is mirrored into the App's `customSymbols` store automatically — so it immediately shows up in the Symbols view, auto-applies on the drawing canvas via the shared `utils/symbolResolver`, and is findable via the CACP `cad_resolve_symbol_for_code` skill. Mirrored entries are tagged with id prefix `cadmgr:` so they round-trip cleanly alongside user-uploaded symbols without colliding. One library, two views, zero duplication.",
        ],
    },
    {
        version: "26.05.16.08",
        date: "May 16, 2026",
        highlights: [
            "🎨 CAD Manager → Agent + CAD Standards View: The CAD Manager is now a first-class chat agent like Deed Reader or Zoning Agent — ask it about layer naming, description keys, symbol strategy, NCS/AIA conventions, or why a specific code isn't resolving. Its previous full-page content has been re-framed as the new **CAD Standards** view (View tab → CAD Standards), which the agent treats as its canvas. The View menu's old \"CAD Manager\" entry is now \"CAD Standards\". Clicking the CAD Manager agent on the home screen auto-initializes the chat with a CACP-aware system prompt that knows about every skill the agent exposes.",
            "🔗 CACP Symbol Resolver: Two new Cross-Agent Communications Protocol skills are now exposed by the CAD Manager Agent — `cad_resolve_symbol_for_code` (single lookup) and `cad_auto_apply_symbols` (batch). Both use the same fuzzy matcher the canvas uses at render time (exact-name → associated-terms regex with wildcards → default fallback), so any agent can ask \"what symbol should code MAG get?\" and get the same answer the drawing already shows. The matcher logic now lives in a shared utility `utils/symbolResolver.ts` so the canvas and the CACP handlers stay in lockstep.",
            "🧹 Symbol Resolver Refactor: Extracted the canvas's per-point symbol matcher into a reusable `buildSymbolMatchers` + `resolveSymbol` pair. The canvas behavior is unchanged — same regex ordering, same wildcard support, same word-boundary anchoring — but now any code path (CACP handlers, future Auto-Apply preview panel, DXF export) can ask the same question and get the same answer.",
        ],
    },
    {
        version: "26.05.16.07",
        date: "May 16, 2026",
        highlights: [
            "🧭 Fix Now — Surveyor-Smart Multi-Tangent Inference: The closing-curve solver now thinks like a surveyor. For any curve missing its chord bearing, the auto-solver first checks whether the curve geometrically closes the polygon back to POB (Pass 0: inverse from curve-start to POB must match 2·R·sin(Δ/2)). If not, Pass 1 builds a candidate list of tangent hypotheses — entry tangent (from the previous leg, the old behavior), exit tangent (from the next leg's bearing), AND for closing curves the exit tangent equals the FIRST call's bearing leaving POB (because the polygon flows continuously through POB). Each candidate's chord endpoint is projected forward and scored by distance to its expected target; whichever lands closest wins, and the applied-fix log names which tangent strategy was used. This fixes the common deed pattern where the closing curve is tangent at the POB end (not the prior leg) — exactly the case where the old solver produced a geometrically valid but bearing-wrong chord.",
        ],
    },
    {
        version: "26.05.16.06",
        date: "May 16, 2026",
        highlights: [
            "🧠 Fix Now — Geometric Curve Solver: The Closure Investigator's \"Fix Now\" button now derives a curve's missing chord bearing GEOMETRICALLY from its inbound tangent + central angle (Δ = arc/radius) — closure no longer required. Tangent bearing is auto-inferred from the previous straight leg's outbound direction when missing or set to the default `N00°00'00\"E` placeholder. This handles the very common case where a deed has only Radius / Arc / Direction for a curve and the user hasn't filled in chord bearing yet.",
            "📢 Fix Now — Better Failure Feedback: When Fix Now can't auto-fix everything, the modal now stays open with the remaining ambiguities AND the toast names the first blocking issue (e.g. \"curve missing radius\", \"2 unknown legs\") so the surveyor knows exactly what to type in next, instead of getting a vague \"couldn't fix anything\" message and an empty screen.",
        ],
    },
    {
        version: "26.05.16.05",
        date: "May 16, 2026",
        highlights: [
            "🔧 Closure Investigator — Fix Now: The Investigate Closure modal now sports an amber \"Fix Now\" button that doesn't just point out problems — it actually back-propagates fixes into the boundary object. It iteratively (a) auto-closes an open polygon by computing the closing leg via inverse COGO from the propagated final point back to the POB, and (b) solves any remaining single-unknown leg or curve chord bearing. Each applied fix is logged to the fieldbook, and the modal re-investigates afterward so you see only what still needs human attention. The original \"Apply Single-Leg Fix\" button is still there when a single-unknown auto-solve is pre-computed.",
        ],
    },
    {        version: "26.05.16.04",
        date: "May 16, 2026",
        highlights: [
            "📐 DXF Contour Export Fix — CAD-Compatible LWPOLYLINEs: PASDA (and every other ESRI / state contour fetch) was emitting contour polylines without the AutoCAD-required `AcDbEntity` / `AcDbPolyline` subclass markers and entity handles. Modern AutoCAD, Civil 3D, BricsCAD, and friends silently DROP malformed entities on import — so users were getting DXFs with zero contour lines. Each contour LWPOLYLINE now ships with a unique handle (group 5), the entity subclass marker, the polyline subclass marker, and the elevation group code 38 in the canonical order — every CAD app reads them as true 3D polylines at the correct elevation.",
            "⛰️ Profile Through Contours: The Profile & XS agent now intersects the requested profile line with every contour `SurveyLine` in the session and emits an elevation sample at each crossing. Previously the algorithm only looked at survey *points*, so cutting a profile through a tile that contained only PASDA / state-DEP contour data returned an empty chart. Each contour segment is solved analytically (2D parametric intersection) against the profile line; intersections inside both segments contribute a (station, elevation) point.",
        ],
    },
    {        version: "26.05.16.03",
        date: "May 16, 2026",
        highlights: [
            "\uD83E\uDE84 Point Editor Quick-Entry: When points already exist in the session (from Deed Reader, Civil Plan Expert, GIS, an imported .lsvz, etc.), clicking the Point Editor agent now skips the upload screen entirely and opens the Point List panel ready for new entries \u2014 no extra clicks, no \"Start Empty Session\" detour.",
        ],
    },
    {
        version: "26.05.16.02",
        date: "May 16, 2026",
        highlights: [
            "\uD83D\uDD0E Investigate Closure (NEW): Amber button on the Boundary Editor footer scans the traverse for missing/ambiguous data and surfaces every issue in a modal \u2014 open polygon, missing legs, incomplete curves, missing chord bearings, multiple unknowns. When exactly one leg is solvable, the modal offers a one-click Apply Auto-Fix.",
            "\uD83E\uDDE9 Generic Ambiguity Model: The PDF-only \"uncertainty\" pattern has been generalized into a new `Ambiguity` type usable across PDF parsing, deed reading, and closure investigations. Each ambiguity carries source, kind, reason, severity, location, and an optional proposed auto-fix payload.",
            "\uD83D\uDCE1 CACP Broadcast: Closure investigations now broadcast `closure_investigation` events via CACP so the activity indicator pulses and other agents can listen in. (Future: contribute auto-fix proposals from peer agents.)",
            "\uD83D\uDCDC Legal Writer View (NEW): \"Write Legal\" no longer just downloads a .txt \u2014 it opens a dedicated Legal Writer view that replaces the canvas in the Deed Reader agent. Press the Back-to-Canvas or monitor button to return, just like other agent views.",
            "\uD83C\uDFA8 Legal Writer Standardization Panel: Side panel lets you pick a preset (Default, Pennsylvania, Texas, Concise), toggle heading / acreage / POB-coords blocks, add free-text surveyor notes, and upload example legal descriptions to teach the writer your firm\u2019s style.",
            "\u270F\uFE0F Legal Writer Inline Edit: The generated description is shown in an editable monospaced textarea \u2014 tweak inline, then Copy or Download as `.txt`.",
        ],
    },
    {
        version: "26.05.16.01",
        date: "May 16, 2026",
        highlights: [
            "🐛 Curve Input Stability: Fixed long-standing bug where clicking between curve detail fields (radius \u2194 chord distance \u2194 chord bearing) would silently mutate user-entered values. Two root causes fixed: (1) `handleCommit` in BoundaryEditor now bails on no-op blurs (no spurious state updates when value unchanged); (2) `propagateBoundaryCalls` now respects user-entered chord bearing / chord distance / tangent bearing instead of unconditionally recomputing them from radius + arc on every propagation tick. Also corrected a latent type bug where `chordDistance.toFixed(2)` was writing a string into a `number` field.",
            "\uD83C\uDFE0 Homepage Header Buttons: Release Log and Report-a-Bug buttons added to the homepage header bar (top-right) for one-click access \u2014 no scrolling, no menu diving.",
            "\uD83D\udcDc New Release Log Icon: Replaced the sparkles icon with a custom clock-over-LOG glyph that reads instantly as \"changelog over time.\"",
            "\u2696\uFE0F Boundary Closure Report Button: Footer of the BoundaryEditor now has an emerald \"Closure Report\" button. If exactly one bearing or distance is missing (including a curve\u2019s chord bearing), the auto-solver fills it in via inverse COGO and generates a full closure report.",
            "\uD83D\uDCDC Legal Writer Button: Footer of the BoundaryEditor now has an indigo \"Write Legal\" button that emits a conventional metes-and-bounds description (`BEGINNING at...`, `THENCE...`, `the said point being the POINT OF BEGINNING`, optional acreage) as a downloadable `.txt`.",
            "\uD83C\uDF9B\uFE0F DMS Bearing Input: New composite `[N|S] [D]\u00B0 [M]' [S]\" [E|W]` cell in the BoundaryEditor bearing column \u2014 quadrant toggles flip between cyan and rose, Tab/Space/`.` advance fields.",
            "\u2702\uFE0F Tab Double-Jump Fix: Tab in BoundaryEditor cells no longer skips a column (was firing both manual focus advance + browser default).",
            "\uD83D\uDD22 Unique To-Point Numbers: Adding consecutive boundary rows now produces 2 \u2192 3 \u2192 4 instead of 2 \u2192 2 \u2192 2 (PointAgent now sees in-flight call endpoints).",
            "\u2705 Clearer Validity Column: The cryptic red \u2717 in the OK column is now replaced with explicit `brg?` / `dist?` / `\u2014 \u2014` yellow hints and a tooltip naming what\u2019s missing.",
            "\uD83D\uDCAA BoundaryEditor Add-Row Crash Fix: Adding a row after the first complete B&D no longer crashes the closure summary on partially-filled rows.",
        ],
    },
    {
        version: "26.05.15.07",
        date: "May 15, 2026",
        highlights: [
            "🐛 Profile Agent Field Names: Rewrote the Profile agent system prompt to use explicit JSON field names (`from` / `to` instead of a vague `identifiers` array). Added a parser fallback so responses using `identifiers:[\"A\",\"B\"]` still work.",
            "🐛 Report a Bug in Header: Bug report link (GitHub Issues) added directly to the top header bar next to Help — no need to open the side menu.",
            "📋 Release Log in Header: Release log link added to the top header bar for quick access.",
        ],
    },
    {
        version: "26.05.15.06",
        date: "May 15, 2026",
        highlights: [
            "📐 DXF Contour Export — 3D Elevated Polylines: Contour lines (both ESRI-fetched and locally generated) now export as DXF `LWPOLYLINE` entities with group code `38` (elevation) set to the correct Z value. Every CAD application reads these as true 3D entities at the correct height above datum — essential for surface modeling and Civil 3D import.",
            "🔗 DXF Contour Export — Joined Polylines: Contiguous contour segments are chained end-to-end before export. Thousands of 2-point LINE fragments become continuous polylines grouped by (layer, elevation), dramatically reducing entity count and file size.",
            "🔧 DXF Injection Fix: Contour polylines are now correctly injected inside the ENTITIES section of the DXF file. The previous version searched for the last `ENDSEC` marker which closed the OBJECTS section — entities placed there were silently ignored by all CAD apps.",
        ],
    },
    {
        version: "26.05.15.05",
        date: "May 15, 2026",
        highlights: [
            "⚡ Profile Agent Token Fix: Contour and ESRI lines are now excluded from the Profile agent's system prompt context. After a PASDA fetch, 50 000+ contour segments were being serialised into the prompt, instantly hitting the 1 M token limit. The profile is computed entirely client-side — the agent only needs survey point numbers and centerline geometry.",
        ],
    },
    {
        version: "26.05.15.04",
        date: "May 15, 2026",
        highlights: [
            "🗺️ PASDA Contour Layer Fix: Layer 0 of the PASDA PAMAP_Contours MapServer is 'Pa Counties' — a polygon layer that returns rings, not paths. Updated the PA state entry to use Layer 1 (Contour_Mosaic_North) and Layer 2 (Contour_Mosaic_South), which are the actual LiDAR-derived 2ft contour polylines. Added 'Elevation' to the elevation-field candidates list (PASDA's field name).",
            "🌐 State ESRI Service Picker: New dropdown in the ESRI REST Contour section — choose a US state to see curated, pre-tested layer cards. Pin a layer with one click. States without a confirmed service show a link to their GIS portal. PA (PASDA PAMAP 2ft) fully configured; all 50 states + DC registered.",
            "🧠 Civil Drafter — Gemini 3 Panel: The experimental Gemini 3 settings panel (thinking level, media resolution, temperature, max tokens, system-prompt addendum) now appears for the Civil Drafter agent, matching the existing Civil Plan Expert panel.",
        ],
    },
    {
        version: "26.05.15.03",
        date: "May 15, 2026",
        highlights: [
            "🌐 WMS Manager Fix: `corsproxy.io` went down with an SSL/TLS failure, breaking WMS map loading, GIS layer fetching, and ESRI REST queries. Switched all 10 CORS proxy calls across 4 files (utils/wms.ts, DrawingCanvas.tsx, App.tsx, GisInput.tsx) to `api.allorigins.win` which is live and verified working.",
        ],
    },
    {
        version: "26.05.15.02",
        date: "May 15, 2026",
        highlights: [
            "🗺️ ESRI Contour Alignment Fix: When description mode is used and survey points already exist in the project, the query bbox is automatically clipped to the survey-points extent (plus a 20% buffer) instead of using the full Nominatim bbox (e.g. an entire county). This prevents the ESRI service from hitting its feature-transfer limit and returning contours from only a random corner of the area.",
            "⚠️ ESRI Transfer Limit Warning: If the service's exceededTransferLimit flag is set (features were capped), a 10-second warning banner now tells the user to switch to Inclusion mode for full coverage.",
            "🔍 ESRI Debug: Sample vertex coordinates (raw 3857 + converted project-space) are now logged to the browser console (open DevTools → Console, filter [DEBUG-ESRI]) for quick alignment verification without requiring server-side log access.",
        ],
    },
    {
        version: "26.05.15.01",
        date: "May 15, 2026",
        highlights: [
            "🗺️ ESRI Contour Fetch: Fixed coordinate pipeline — service is always queried with outSR=nativeWkid (guaranteed supported by the service), then each path vertex is converted client-side to the project coordinate system via proj4. Eliminates silent 0-feature responses when the project uses a custom internal EPSG code.",
            "🐛 ESRI Inclusion Mode: Fixed 'inclusionLines is not defined' ReferenceError that prevented inclusion-boundary fetches from running.",
            "🔌 Backend Debug Logging: New /api/debug/log endpoint (POST) writes structured ESRI fetch diagnostics to Cloud Logging stdout and a rolling in-memory buffer. GET /api/debug/logs?tag=ESRI returns up to 200 recent entries — readable via curl or PowerShell without redeploying.",
            "🗺️ ESRI SR Detection Fix: Service native spatial reference is now correctly read from extent.spatialReference for layer endpoints (/MapServer/N), in addition to the top-level spatialReference for service endpoints (/MapServer).",
            "🌍 ESRI Description Mode Fix: Nominatim WGS84 bbox is now preserved through the full pipeline — prior code pre-converted to project coordinates before the native-SR check, breaking coordinate input for all projected services.",
        ],
    },
    {
        version: "26.05.13.09",
        date: "May 13, 2026",
        highlights: [
            "🖱️ Boundary Editor: Now draggable — grab the header to reposition the panel anywhere on screen.",
            "📐 Boundary Editor COGO fix: Editing bearing or distance now correctly propagates all downstream points without moving the POB. Line geometry (fromPt/toPt) is also kept in sync for correct rendering in all display modes.",
            "🖊️ Draw Boundary Line: Second click on canvas computes bearing & distance automatically via inverse COGO — snaps to an existing point if within threshold, otherwise uses raw world coords.",
        ],
    },
    {
        version: "26.05.13.08",
        date: "May 13, 2026",
        highlights: [
            "📐 Boundary File Editor: Deed reader now auto-creates a boundary file when a boundary is plotted. Edit bearings/distances in a floating spreadsheet overlay — changes propagate through the traverse via forward COGO, updating all downstream points and canvas linework live.",
            "✏️ Draw Boundary Line Tool: New tool in the drawing menu — click an existing point to set the start, enter a bearing and distance, confirm to create the next point/line. Chains automatically for sequential call entry.",
        ],
    },
    {
        version: "26.05.13.07",
        date: "May 13, 2026",
        highlights: [
            "🐛 Civil Plan Expert × Gemini 3 Drawing Fix: Vertex chats no longer inherit the legacy `thinkingBudget` config (Gemini 3 only accepts `thinkingLevel`). Sending the 2.x shape silently produced empty responses, which is why no points/lines were drawn — now defaults to `thinkingLevel: HIGH` and the JSON handoff works.",
            "🔍 Backend Diagnostics: /api/vertex/stream now logs per-chunk part counts, finishReason, and a loud EMPTY RESPONSE warning when the model returns zero text — surfaces silent safety blocks or config rejections.",
        ],
    },
    {
        version: "26.05.13.06",
        date: "May 13, 2026",
        highlights: [
            "🧪 Gemini 3 Panel for Deed Reader: The experimental thinking-level / media-resolution / temperature / max-tokens / system-prompt-addendum panel now appears for the Deed Reader & Plotter agent too — anywhere Gemini 3 Flash Preview is selected.",
            "📜 Civil Plan Expert CACP Manifest: Civil Plan Expert is now formally registered with CACP — declares civil_plan_expert_extract, civil_plan_expert_status, and civil_plan_expert_set_draw_mode skills with full input/output schemas.",
            "🔍 Click-to-Inspect Manifests: The CACP badge in the chat header is now a button — click it to open a modal that shows the agent's full skill manifest (pretty view + raw JSON + copy-to-clipboard).",
        ],
    },
    {
        version: "26.05.13.05",
        date: "May 13, 2026",
        highlights: [
            "🧠 Thought Signatures: Gemini 3 reasoning continuity is now preserved across multi-turn chats — backend captures every part (including opaque `thoughtSignature` tokens) and the client round-trips them verbatim on the next turn, as required by the Gemini 3 spec.",
            "📦 Richer History: VertexChat stores the full model-turn parts array instead of a flattened text blob, so subsequent turns send the model exactly what it expects to see.",
            "🔍 Diagnostics: Backend and client both log signature counts per response so handoff regressions are visible.",
        ],
    },
    {
        version: "26.05.13.04",
        date: "May 13, 2026",
        highlights: [
            "🐛 JSON Handoff Fix: Civil Plan Expert via Gemini 3 sometimes returns raw JSON without ```json fences — added a balanced-bracket fallback extractor so the scene/drawing actually renders.",
            "🧠 Thought-Part Skipping: Vertex proxy now walks `candidates[0].content.parts` directly and ignores `thought` parts, so streaming aggregation captures all answer text even when chunks contain only reasoning.",
            "🔍 Diagnostics: VertexChat logs aggregated length + first 300 chars and whether a ```json fence was detected; backend logs total chunks/chars per request.",
        ],
    },
    {
        version: "26.05.13.03",
        date: "May 13, 2026",
        highlights: [
            "🧪 Experimental Gemini 3 Controls: New floating panel appears for the Civil Plan Expert when Gemini 3 Flash Preview is selected — exposes thinking level, media resolution, temperature, max output tokens, and a system-prompt addendum.",
            "💾 Persisted Settings: Panel state is saved to localStorage and applied per-request to the Vertex backend (generationConfig + thinkingConfig + mediaResolution).",
            "⚠️ Power-User Warning: Temperature defaults to 1.0 (Gemini 3 recommended); panel surfaces a warning if you change it.",
        ],
    },
    {
        version: "26.05.13.02",
        date: "May 13, 2026",
        highlights: [
            "🐛 PayloadTooLarge Fix: Bumped Express body limit and nginx client_max_body_size to 200MB so the Civil Plan Expert can stream multi-MB PDFs to Vertex without 500 errors.",
            "📡 Streaming UX: Disabled nginx proxy buffering on /api/vertex/* so chunks arrive incrementally.",
        ],
    },
    {
        version: "26.05.13.01",
        date: "May 13, 2026",
        highlights: [
            "🚀 Vertex AI Integration: Added Gemini 3 Flash (Preview) via a new Cloud Run backend proxy authenticated by Application Default Credentials — no client API key needed for Vertex models.",
            "🧠 Smart Routing: Model picker calls automatically route gemini-3.x models through Vertex (/api/vertex/stream) and keep gemini-2.5.x on the existing public API path.",
            "🛠️ New Endpoint: backend/src/routes/vertex.ts streams NDJSON chunks; services/vertexChat.ts mirrors the @google/genai Chat surface used by the app.",
            "🧹 Cleanup: Removed broken 'gemini-3-flash' references that 404'd on selection (the correct preview ID is gemini-3-flash-preview).",
        ],
    },
    {
        version: "26.05.12.04",
        date: "May 12, 2026",
        highlights: [
            "🐛 Civil Plan Expert: Fixed `currentBatchPoints is not defined` scope bug that broke line generation.",
            "📍 Lines-Only Mode: Point lookup table is now populated even when the agent draw mode is set to Lines only.",
        ],
    },
    {
        version: "26.05.12.03",
        date: "May 12, 2026",
        highlights: [
            "🎨 Human-Drafter Logic: Civil Plan Expert now decides intelligently when to draw lines (close parcel boundaries, leave road centerlines open, skip scattered shots) instead of mechanical sequential connection.",
            "🔗 Label Remapping: AI-assigned labels (e.g. W.P.1) are now mapped to the app's sequential CACP point numbers so line from/to references resolve correctly.",
        ],
    },
    {
        version: "26.05.12.02",
        date: "May 12, 2026",
        highlights: [
            "🎛️ Agent Draw Mode Toggle: New drawing-toolbar button cycles between Points + Lines / Points only / Lines only — agent output is filtered to honor the selected mode.",
        ],
    },
    {
        version: "26.05.12.01",
        date: "May 12, 2026",
        highlights: [
            "📜 Legal Page: New in-app legal page plus the legal.landsurv.ai subdomain.",
            "⚖️ Concierge Disclaimer: Added an anti-practice-of-law disclaimer to the concierge experience.",
            "📱 Mobile Menu: Top menu bar now wraps cleanly on narrow screens.",
        ],
    },
    {
        version: "26.05.11.09",
        date: "May 11, 2026",
        highlights: [
            "🔢 Sequential CACP Numbers: Civil Plan Expert points are renumbered into the app's CACP sequence on import.",
            "🧬 Coordinate Dedup: Duplicate-point detection now compares coordinates instead of AI-assigned labels.",
        ],
    },
    {
        version: "26.05.08.01",
        date: "May 8, 2026",
        highlights: [
            "🔑 API Key Required: Removed default built-in API key — users must supply their own Google AI Studio key.",
            "🧹 Trial Timer Removed: Eliminated the 4hr-on/4hr-off trial cycle system entirely.",
            "💬 Updated Messaging: AppLockOverlay, C3D Connect panel, and Settings all reflect the new API key model.",
            "💰 Cost Savings: Cloud Run now uses CPU throttling (CPU only allocated during requests).",
        ],
    },
    {
        version: "26.01.15.02",
        date: "January 15, 2026",
        highlights: [
            "📏 Dynamic Column Widths: Code legend columns now auto-size based on longest text in each column.",
            "📐 Smart Width Calculation: Scans all codes before rendering to calculate optimal column widths.",
            "🎯 Minimum Widths: Columns have intelligent minimums to ensure readability.",
            "C3D Connector: v26.01.15.02 - Dynamic column width calculation for code legends.",
        ],
    },
    {
        version: "26.01.15.01",
        date: "January 15, 2026",
        highlights: [
            "🤖 AI Layer Analysis Chat: When creating standards from pulled layers, AI now asks clarifying questions about layer naming conventions before generating.",
            "💬 Interactive Q&A: Answer questions about prefixes (C-, V-, X-), suffixes, and layer purposes to help AI understand your standards.",
            "✨ Smart Pattern Detection: AI analyzes common prefixes, delimiters, and naming patterns in your layers.",
            "🧪 Unit Tests: Added 23 new tests for LayerAnalysisChat component.",
            "C3D Connector: v26.01.15.01 - AI-powered layer analysis for standard creation.",
        ],
    },
    {
        version: "26.01.14.05",
        date: "January 14, 2026",
        highlights: [
            "🔧 Backend Routing Fix: Backend now forwards 'result' messages from C3D to webapp as 'tool_result'.",
            "📋 Timeout Fix: Pull layers and refresh drawings no longer timeout.",
            "🔄 Editor.WriteMessage Fix: Removed Editor.WriteMessage calls from WinForms event handlers (caused eNotApplicable).",
            "C3D Connector: v26.01.14.05 - Backend routing for tool results.",
        ],
    },
    {
        version: "26.01.14.04",
        date: "January 14, 2026",
        highlights: [
            "🔧 Pull Layers Fix: Fixed layer extraction not returning data to webapp.",
            "📋 Drawing List Fix: Auto-populate drawings list when thin client opens.",
            "🔄 Async Response Handling: WebSocket now properly waits for C3D command results.",
            "⚡ Event Wiring: Connected RefreshDrawingsRequested and DrawingSelected events.",
            "C3D Connector: v26.01.14.04 - Fixed pull layers functionality.",
        ],
    },
    {
        version: "26.01.14.03",
        date: "January 14, 2026",
        highlights: [
            "🔗 Pull Layers from C3D: New tab to extract layer definitions from open Civil 3D drawings.",
            "📋 Drawing Selector: Dropdown in thin client to switch between open drawings.",
            "🔄 Layer-to-Code Conversion: Create standards from existing drawing layers automatically.",
            "⚡ Open Drawings API: New commands for get_open_drawings, get_layers_from_drawing, set_active_drawing.",
            "C3D Connector: v26.01.14.03 - Drawing selector and layer extraction features.",
        ],
    },
    {
        version: "26.01.14.02",
        date: "January 14, 2026",
        highlights: [
            "📊 Code Legend: Split Symbol into 3 columns - Symbol (geometry), Sym Name, Sym Layer.",
            "🎨 Layer Naming Convention: Improved legend header layout with cleaner formatting.",
            "⚙️ Symbol Geometry Toggle: Option to include/exclude symbol geometry in legend push.",
            "🔧 Common Symbol Library: Built-in SVG paths for common survey symbols (benchmark, iron rod, etc).",
            "C3D Connector: v26.01.14.02 - Enhanced legend formatting and symbol columns.",
        ],
    },
    {
        version: "26.01.14.01",
        date: "January 14, 2026",
        highlights: [
            "🔄 Version Sync: Unified version format (YY.MM.DD.NN) across all components.",
            "📋 Deployment Process: Enhanced build documentation with complete version checklist.",
            "C3D Connector: v26.01.14.01 - Version alignment with webapp.",
        ],
    },
    {
        version: "26.01.10.01",
        date: "January 10, 2026",
        highlights: [
            "👥 CAD Manager Surveyor Collaboration: Match surveyor codes to master codes with 3-tab interface.",
            "🔍 AI Code Matching: Semantic search with abbreviation expansion for code matching.",
            "➕ Create Master Codes: Add new master codes for unmatched surveyor codes.",
            "📊 Surveyor Alias Column: View surveyor code overrides per selected surveyor in spreadsheet.",
            "🔄 Symbol Regeneration Options: Choose to regenerate single symbol or all missing symbols.",
            "C3D Connector: v26.01.10.01 - Surveyor collaboration and code matching enhancements.",
        ],
    },
    {
        version: "26.01.08.01",
        date: "January 8, 2026",
        highlights: [
            "📋 Code Legend Linetype Column: Legend now shows Linetype column with pattern names.",
            "🎨 Legend Linetype Patterns: Sample lines in legend display actual linetype patterns.",
            "🔄 Auto-Load Linetypes: Creates custom linetypes in drawing before legend creation.",
            "C3D Connector: v26.01.08.01 - Legend text scaling fix (4 ft text).",
        ],
    },
    {
        version: "26.01.07.02",
        date: "January 7, 2026",
        highlights: [
            "🔄 Auto-Generate Linetypes: AI Standards Builder now auto-generates linetype definitions from codes.",
            "📊 Smart Linetype Lookup: Maps code linetypes (FENCE, WATER, SEWER) to full definitions.",
            "🏗️ Linetype Merging: Generated linetypes automatically populate the Linetypes tab.",
            "C3D Connector: v26.01.07.02 - Auto-generated linetypes from standards.",
        ],
    },
    {
        version: "26.01.07.01",
        date: "January 7, 2026",
        highlights: [
            "🔗 Linetype-Layer Association: Assign specific linetypes to individual codes in CAD Manager.",
            "📊 Spreadsheet Linetype Column: New 'Linetype' column in the standards spreadsheet editor.",
            "📋 Legend Linetype Column: Code legend now displays linetype assignments.",
            "🏗️ C3D Layer Linetypes: Layers created in Civil 3D automatically receive their assigned linetype.",
            "📤 Export Integration: Linetype associations exported with standards and pushed to C3D.",
            "C3D Connector: v26.01.07.01 - Layer linetype assignment from CAD Manager standards.",
        ],
    },
    {
        version: "26.01.06.02",
        date: "January 6, 2026",
        highlights: [
            "🎨 Linetype Support: CAD Manager now resolves linetypes (DASHED, FENCELINE, HIDDEN) from standards.",
            "📊 Layer Post-Processing: Civil Drafter lines automatically get correct layer from CAD Manager standard.",
            "🔍 Fuzzy Code Matching: Case-insensitive matching and partial code support (e.g., 'EP BLDG' → 'EP').",
            "🖌️ Canvas Linetypes: DrawingCanvas renders 15+ CAD linetypes (dashed, dotted, center, phantom, etc.).",
            "⬆️ C3D Linetype Push: Lines pushed to Civil 3D now include linetype property.",
            "🧪 New Tests: 20 unit tests for lineType resolution and layer matching.",
            "C3D Connector: v26.01.06.02 - Polylines now receive linetype from CAD Manager.",
        ],
    },
    {
        version: "26.01.06.01",
        date: "January 5, 2026",
        highlights: [
            "🧹 TypeScript Cleanup: Fixed type union handling for fromPt/toPt with proper type guards.",
            "🛠️ Centerline Push Fix: Changed to use pis array instead of non-existent segments property.",
            "📝 CodeDefinition Fix: Corrected layer → pointLayer in CadManagerContext.",
            "🔧 Type Declarations: Added global.d.ts for window.interAgentComm types.",
            "📍 GPS Stakeout: Simplified to pure GPS tool (removed chat panel).",
            "C3D Connector: v26.01.05.01 - All components aligned on new daily version.",
        ],
    },
    {
        version: "26.01.04.02",
        date: "January 4, 2026",
        highlights: [
            "✨ DXF Training Templates: Mark any DXF file as 'For Training' in File Manager to teach Civil Drafter your drafting conventions.",
            "📚 Template Learning: Civil Drafter analyzes training DXF to learn layer naming, line types, colors, and feature organization.",
            "🔧 Civil Drafter Session Fix: Agent now properly restores canvas view when loading saved .lsvz sessions.",
            "🎨 Branding Update: Civil Drafter file upload heading styled to match LandSurv.ai brand colors.",
            "⚡ Civil 3D Plugin: Download button now skips landing page and goes directly to download.",
            "C3D Connector: v26.01.04.01 - Training templates are webapp-only feature.",
        ],
    },
    {
        version: "26.01.04.01",
        date: "January 4, 2026",
        highlights: [
            "ℹ️ Agent Info Icons: New info button (ⓘ) on each agent card links to dedicated SEO landing page.",
            "🏗️ Civil Drafter Landing Page: New civildrafter.landsurv.ai subdomain with comprehensive agent documentation.",
            "🔗 SEO Infrastructure: Added Civil Drafter to sitemap.xml, robots.txt, and sitemap page content.",
            "C3D Connector: v26.01.04.01",
        ],
    },
    {
        version: "26.01.03.01",
        date: "January 3, 2026",
        highlights: [
            "🎯 Point Editor C3D Integration: Full Civil 3D connection for point creation, sync, and management.",
            "📍 New MCP Tools: get_cogo_points, sync_points_batch, delete_cogo_points for comprehensive point control.",
            "🔄 Batch Point Sync: Sync multiple points between webapp and Civil 3D in a single operation.",
            "🗑️ Point Deletion: Remove COGO points from drawings via Point Editor commands.",
            "📊 Point Filtering: Query points by number ranges or specific point numbers.",
            "C3D Connector: v26.01.03.01 - Point Editor now C3D-enabled with full point management.",
        ],
    },
    {
        version: "26.01.02.02",
        date: "January 2, 2026",
        highlights: [
            "🤖 New Agent: Civil Drafter - Intelligent road corridor recognition with parallel lines (never crossing).",
            "🧠 Civil Drafter uses Gemini 3 Flash Preview model with 8192-token thinking budget for enhanced precision.",
            "🎨 Model Display: Current AI model name shown in sidebar (replaces Settings button).",
            "⚙️ Settings Access: Now accessible via North Arrow click with 'Settings' tooltip.",
            "📊 Model Config Popup: Click model name to view current model details and agent information.",
            "C3D Connector: v26.01.02.02 - Civil Drafter agent ready for C3D connection.",
        ],
    },
    {
        version: "26.01.01.04",
        date: "January 1, 2026",
        highlights: [
            "🧠 Ultimate Debug Panel: Real-time monitoring of inter-agent communication, AI thoughts, and connector logs.",
            "🔗 REST & WebSocket APIs: Full remote access to debug data for custom dashboards and integrations.",
            "� Multi-Tract Deed Fix: Multiple separate parcels from one document now render as isolated polylines without incorrect connections.",
            "📍 Bearing & Distance Rotation: Bearing and distance text now split into separate MTEXT objects with rotation parallel to deed lines.",
            "📝 API Documentation: Complete endpoint reference with JavaScript, Python, and cURL examples.",
            "🎥 Video Tutorial: Comprehensive 15-minute walkthrough with real-world debugging scenarios.",
        ],
    },
    {
        version: "26.01.01.03",
        date: "January 1, 2026",
        highlights: [
            "📐 Deed Polyline Enhancements: Scaled parcel owner text sized proportionally to lot boundary.",
            "📍 Bearing & Distance Annotations: Each deed line now shows bearing (N/S DD°MM'SS\"E/W) and distance in feet.",
            "🗂️ Organized Layer Structure: Deed elements placed on three color-coded layers (boundary, label, annotations).",
            "🔗 Inter-Agent Communication: New MCP server pattern for agents to communicate through LSVZ Meta-Agent.",
            "🔐 Document Lock Fix: Fixed eLockViolation error preventing polyline creation in Civil 3D.",
            "C3D Connector: v26.01.01.03 - Deed-to-C3D with bearing/distance, proper layers, smart text scaling.",
        ],
    },
    {
        version: "26.01.01.2",
        date: "January 1, 2026",
        highlights: [
            "🚀 Deed Reader Integration: Push deed boundaries directly to Civil 3D as polylines.",
            "🎆 Enhanced C3D Connection: Red/green status indicator on C3D-enabled agents.",
            "📏 New Feature: Linetype Manager in CAD Manager - Upload .lin files, generate via AI, push to Civil 3D.",
            "🔧 DevOps Console: New Debug Settings tab with welcome screen toggle for testing.",
            "🔄 Version Sync: All components (webapp, DLL, MSI) now use unified date-based versioning.",
            "C3D Connector: v26.01.01.2 - Deed-to-C3D push with debug logging, import_deed_polyline command.",
        ],
    },
    {
        version: "26.01.01.1",
        date: "January 1, 2026",
        highlights: [
            "🎆 Happy New Year 2026! Version numbering now follows YY.MM.DD.revision format.",
            "📏 New Feature: Linetype Manager in CAD Manager - Upload .lin files, generate via AI, push to Civil 3D.",
            "🔧 DevOps Console: New Debug Settings tab with welcome screen toggle for testing.",
            "C3D Connector: v26.01.01.1 - New load_linetypes tool for pushing custom linetypes.",
        ],
    },
    {
        version: "1.60.4",
        date: "December 30, 2025",
        highlights: [
            "🎆 Major Feature: Webapp-to-Civil 3D Layer Push - Push CAD Manager layers directly to Civil 3D drawings!",
            "🔧 Fix: Document locking for layer creation - LockDocument() now properly acquired for database modifications.",
            "🔧 Fix: ThreadMarshaler wraps all commands - ExecuteCommand runs on main UI thread for thread-safe operations.",
            "🎄 NYE Theme: Colorful fireworks replace Christmas decorations (Dec 26 - Jan 1).",
            "🎄 Holiday Settings: Override holiday theme from Settings panel for testing.",
            "C3D Connector: v25.12.30.4 - Layer legend generator, description key push, full layer push.",
            "MSI: Updated download page with latest connector version.",
        ],
    },
    {
        version: "1.60.0",
        date: "December 29, 2025",
        highlights: [
            "UI: C3D Connect button on homepage with pulsing status indicator.",
            "UI: Styled connection button matches sidebar design - green/red dot shows connection state.",
            "Fix: Download link in C3D Connect dialog now goes to connector-download.landsurv.ai.",
            "Fix: Local frontend dev server now uses production backend API.",
            "C3D Connector: Version 25.12.29.4 - Layer push improvements.",
        ],
    },
    {
        version: "1.58.9",
        date: "December 29, 2025",
        highlights: [
            "Major Fix: C3D WebSocket connection detection - webapp now properly shows green 'C3D Connected' when DLL connects.",
            "Architecture: Refactored WebSocket server to use noServer mode with manual path routing for /c3d and /c3d/webapp-sync.",
            "Fix: C3DConnectPanel no longer auto-closes when opened from sidebar - shows existing session token.",
            "Backend: Single WebSocket server handles both C3D client and webapp-sync connections via upgrade event routing.",
            "Backend: Added comprehensive WebSocket connection tests (8 tests) for token validation and client notification.",
            "C3D Client: Version 25.12.29.3 - Synced with webapp connection improvements.",
        ],
    },
    {
        version: "1.58.8",
        date: "December 29, 2025",
        highlights: [
            "DLL Update: C3D Connector v25.12.29.1 with create_layer and create_layers_batch commands.",
            "Fix: C3D debug dialog now stays open (click outside to close).",
            "Feature: Direct layer export to Civil 3D when C3D client is connected.",
        ],
    },
    {
        version: "1.58.7",
        date: "December 28, 2025",
        highlights: [
            "Fix: Webapp now detects when C3D client connects - sidebar and CAD Manager show live connection status.",
            "Backend: Webapp sync WebSocket notifies frontend when C3D client connects/disconnects.",
            "Backend: On webapp connect, immediately notifies if C3D client is already connected.",
        ],
    },
    {
        version: "1.58.6",
        date: "December 28, 2025",
        highlights: [
            "Feature: Turbo Mode toggle in StandardsBuilder - Switch between Gemini 2.5 Flash (fast) and Gemini 2.5 Pro (smarter).",
            "Feature: Direct layer export to Civil 3D - Push layers directly to your drawing when connected.",
            "UI: Green 'Push Layers to C3D' button appears when connected to Civil 3D.",
            "UI: Connection status indicator in CAD Manager export panel.",
            "C3D Connector: Added create_layer and create_layers_batch commands for direct layer creation.",
            "Backend: New /api/cad-manager/c3d/create-layers endpoint for layer creation.",
        ],
    },
    {
        version: "1.58.5",
        date: "December 28, 2025",
        highlights: [
            "Fix: CAD Manager state now syncs to Civil 3D via WebSocket connection.",
            "Fix: C3D Connect panel receives codes, layers, and aliases from CAD Manager.",
            "C3D Connector: Enhanced debug logging shows full session token, URL, and environment.",
            "C3D Connector: New build v25.12.28.1 with improved connection diagnostics.",
        ],
    },
    {
        version: "1.58.0",
        date: "December 28, 2025",
        highlights: [
            "Feature: User-Editable Cells with Locking - Click any cell in the spreadsheet to edit inline, Tab to move between columns.",
            "Feature: Locked Fields (🔒) - User edits are marked as 'locked' and protected from AI regeneration.",
            "Feature: Smart AI Merge - When regenerating standards, AI preserves all user-edited fields while updating everything else.",
            "Feature: Unlock Dialog - Click the 🔒 icon to unlock a field and allow AI to modify it again (with confirmation).",
            "Feature: Edit Tracking - Locked cells store original value and timestamp for audit trail.",
            "UI: Locked cells highlighted with amber background, lock icon appears on hover.",
            "UI: Footer shows count of locked cells and updated help text for cell editing.",
            "Data: CodeDefinition type extended with userEdits field for persistent edit tracking.",
            "Tests: New unit tests for user edits persistence and multi-field locking.",
        ],
    },
    {
        version: "1.57.0",
        date: "January 2, 2025",
        highlights: [
            "Major Feature: CAD Manager Session Management - Save and load multiple standards lists with full chat history.",
            "Sessions: Create, rename, duplicate, and delete named sessions with timestamps and metadata.",
            "Chat History: AI conversation with StandardsBuilder is now persisted and restored with each session.",
            "Import/Export: Download sessions as JSON files for backup or sharing, import sessions from files.",
            "Quick Actions: Save (Ctrl+S), Load, and New Session buttons in the header with session name display.",
            "C3D Connection: Improved connection button with pulsing animation - red (disconnected) / green (connected).",
            "UI Polish: New ThinkingAnimation with colorful shimmer effect and rotating survey-themed status messages.",
            "Layout Fix: StandardsBuilder now properly fills available space to the bottom of the window.",
            "Storage: Sessions persist to localStorage with automatic active session tracking.",
            "Tests: Comprehensive unit test coverage for session storage functionality.",
        ],
    },
    {
        version: "1.55.0",
        date: "December 26, 2025",
        highlights: [
            "Major Feature: CAD Manager - AI-powered code matching system for survey data standardization.",
            "Standards Parsing: Upload markdown files defining code standards with descriptions and layer assignments.",
            "AI Inference: Vertex AI / Gemini Flash suggests master codes with confidence scores and reasoning.",
            "Learning System: Alias mappings learn from user corrections - improves matching accuracy over time.",
            "DXF Integration: Resolved codes automatically apply to generated CAD files with proper layers.",
            "Workflow: Upload standards → Upload survey → AI suggests matches → Review/correct → Learn → Export.",
            "Frontend: StandardUpload, SurveyUpload, ReviewModal, CadManagerPage components with drag-and-drop.",
            "Backend: CadManagerAI service with Vertex AI integration for semantic code analysis.",
            "Persistence: LsvzPersistence stores learned aliases in encrypted .lsvz project files.",
            "C3D Integration: New commands (get_survey_codes, apply_code_aliases) for automated code application.",
            "Type Safety: Full TypeScript coverage with shared type definitions across frontend/backend.",
            "Navigation: CAD Manager available in Agents list and Views tab with layers icon.",
        ],
    },
    {
        version: "1.53.1",
        date: "December 17, 2025",
        highlights: [
            "Bug Fix: GetAllEntities tool now properly handles entity iteration errors without crashing.",
            "Bug Fix: JSON responses from C# tools are now correctly parsed before passing to Gemini AI.",
            "Improvement: Better null checking for Database and BlockTable access.",
            "Improvement: Individual entity property errors no longer break the entire function.",
            "Improvement: Added detailed error tracking with processed/skipped entity counts.",
            "Improvement: Stack trace logging for better debugging of tool failures.",
            "C# Client: Version 25.12.17.01 - Improved error resilience.",
            "Result: Tool calling now works reliably for querying drawing entities and calculating areas.",
        ],
    },
    {
        version: "1.53.0",
        date: "December 16, 2025",
        highlights: [
            "Major Feature: AI Function Calling for Civil 3D! AI can now actually query and modify drawings instead of just giving advice.",
            "Backend: 12 new tool definitions for Gemini function calling - get_drawing_info, get_all_entities, get_entity_properties, calculate_area, get_layers, measure_distance, count_entities, select_entities_by_text, create_line_segment, create_cogo_point, zoom_to_entity, zoom_extents.",
            "Backend: Multi-turn conversation loop - AI executes tools and feeds results back for intelligent responses.",
            "Backend: System prompt instructs AI to use tools for drawing queries rather than generic advice.",
            "C# Client: 9 new tool implementations - GetAllEntities, GetEntityProperties, CalculateArea, GetLayers, MeasureDistance, CountEntities, SelectEntitiesByText, ZoomToEntity, ZoomExtents.",
            "Civil 3D Plugin: Version 25.12.16.03 - Full function calling support.",
            "Example: Ask 'what is the sq ft of buildings?' and AI queries drawing entities, calculates areas, returns actual numbers.",
            "Architecture: Tool execution via WebSocket - Backend sends commands to C# client, awaits results, feeds to AI.",
        ],
    },
    {
        version: "1.52.0",
        date: "December 16, 2025",
        highlights: [
            "Critical Fix: Civil 3D Chat 403 Errors - Resolved SDK version mismatch causing Gemini API authentication failures.",
            "Backend: Updated to @google/genai v1.14.0 - Migrated from deprecated @google/generative-ai v0.24.1 to match webapp SDK.",
            "Root Cause: Backend C3D handler used old SDK that failed with 403 while webapp used new SDK that worked with same API key.",
            "Civil 3D Plugin: Version 25.12.16.1 - Updated DLL and MSI version numbers.",
            "Webapp: Version 1.52.0 - Updated all version references across frontend.",
            "Architecture: Shared API Key - C3D chat now uses webapp's shared API key (no per-user keys needed).",
            "Enhancement: Consistent SDK - Both webapp and C3D backend now use identical @google/genai package for reliability.",
            "Deployment: us-west1 - Fixed region targeting to ensure correct Cloud Run deployment.",
        ],
    },
    {
        version: "1.51.0",
        date: "December 15, 2025",
        highlights: [
            "Major Feature: Session Token Authentication for Civil 3D! Replaced API key system with secure session-based tokens (LSC-XXXXX-XXXXX format).",
            "Feature: Trial Timer Synchronization - Civil 3D plugin respects web app trial timer; when trial pauses, plugin connection pauses.",
            "Feature: Token Generation Panel - New C3DConnectPanel component for one-click session token generation from web interface.",
            "UI: Updated Landing Pages - connector-download.landsurv.ai and civil3d.landsurv.ai now include 5-step installation guide with integrated token generation.",
            "Backend: Session Management API - New endpoints for token creation, validation, and trial state synchronization.",
            "Security: 24-Hour Token Expiry - Session tokens automatically expire after 24 hours for enhanced security.",
            "Civil 3D Plugin: Versioned Releases - MSI now includes version number in filename (LandsurvConnector-v25.12.15.02.msi).",
            "Fix: Production Endpoint - All WebSocket connections now point to correct production backend (wss://beta-landsurv-ai-y55gmt77ga-uw.a.run.app/c3d).",
            "Fix: ConfigurationManager Default URL - Corrected persistent old endpoint issue in plugin configuration.",
            "Deployment: Docker Layer Caching - Build times reduced from 6-7 minutes to 3-4 minutes with cache optimization.",
            "Enhancement: Anonymous Trial Access - No login required; session tokens seamlessly link Civil 3D plugin to browser session.",
        ],
    },
    {
        version: "1.5.0",
        date: "December 9, 2025",
        highlights: [
            "Major Feature: Civil 3D Cloud Integration! Direct integration with Autodesk Civil 3D via C3DMCP (Civil 3D Model Context Protocol) server.",
            "Feature: Cloud Brain to Civil 3D Connector - .NET Framework plugin for real-time bidirectional communication.",
            "Feature: AI-Powered Civil 3D Commands - Execute survey operations and drawing manipulations through natural language AI prompts.",
            "Feature: WebSocket-Based Communication - Secure real-time messaging between Civil 3D plugin and cloud backend server.",
            "Feature: COGO Point Creation - Create survey points in Civil 3D from AI-generated coordinates with full metadata.",
            "Feature: Line Segment Drawing - Generate line work automatically through AI analysis and coordinate extraction.",
            "Feature: Drawing Information Queries - Retrieve Civil 3D drawing metadata and coordinate systems programmatically.",
            "Infrastructure: Node.js + Express.js backend with Google Vertex AI (Gemini 1.5 Pro) integration for intelligent command routing.",
            "Security: HMAC-SHA256 authentication tokens and license key validation for secure client-server communication.",
            "Deployment: Full staging support with 0.1.0-alpha build ready for Google Cloud Run deployment with demo mode (no GCP credentials required).",
        ],
    },
    {
        version: "1.40.0",
        date: "November 27, 2025",
        highlights: [
            "Major Feature: Title Search Agent! Trace property ownership history and establish chain of title through deed analysis.",
            "Feature: Multi-Deed Analysis - Upload multiple deed documents to build complete ownership timeline.",
            "Feature: Chain of Title - Chronologically ordered ownership transfers with grantor/grantee tracking.",
            "Feature: Lien Detection - Identifies mortgages, tax liens, judgments, mechanic's liens, and easements.",
            "Feature: Title Status Assessment - AI evaluates title as 'clear', 'issues', or 'pending-review' based on findings.",
            "UI: Three-Panel Interface - Separate tabs for Chain of Title, All Deeds, and Liens with detailed information.",
            "UI: Status Indicators - Color-coded badges for lien status (active=red, released=green, satisfied=blue).",
            "Data Extraction: Automatically extracts grantor, grantee, recording dates, consideration amounts, book/page references.",
            "Quality: Comprehensive AI instructions for title examination following real estate industry standards.",
            "Enhancement: Deed metadata and bearing/distance labels now display in italic for better visual distinction.",
        ],
    },
    {
        version: "1.38.0",
        date: "November 17, 2025",
        highlights: [
            "Feature: AR View Integration! AR agent now has a dedicated visual panel accessible from the sidebar Views menu.",
            "Feature: AR View Button - Click 'AR View' in the Views section of the sidebar to open augmented reality visualization on compatible devices.",
            "Feature: Point Selection in AR - Survey points now render in AR space and can be selected for interaction in the AR environment.",
            "Fix: RINEX Tools Now Visible! GNSSProcessingPanel properly integrated into chat toolchest for RINEX/GNSS agent.",
            "Enhancement: AR View supports WebXR on Meta Quest and other compatible AR devices with graceful fallback on non-AR browsers.",
            "Fix: Mobile Scrolling Fully Restored - Reverted to baseline viewport configuration for reliable scrolling across all pages.",
            "Enhancement: Touch-action manipulation enabled for natural mobile interactions without zoom prevention issues.",
            "Testing: Verified AR View rendering, RINEX toolchest display, and mobile scrolling across all pages.",
            "Infrastructure: All changes committed to main branch and ready for Cloud Run deployment.",
            "Deployment: Build 3ea6275 with full AR integration and RINEX toolchest fixes.",
        ],
    },
    {
        version: "1.36.1",
        date: "November 15, 2025",
        highlights: [
            "UI Enhancement: Welcome screen mobile responsiveness improved! Cards now scale properly on small screens with responsive padding and font sizes.",
            "UI Enhancement: Go Home button added to RINEX premium feature dialog for easier navigation on mobile and desktop.",
            "Feature Enhancement: All agent and info cards now display in one continuous grid (no separation between agent types and action cards).",
            "Drawing Canvas: Extended rubberbanding visual feedback to all 4 drawing modes - Polylines, Breaklines, Inclusion, Exclusion polygons.",
            "Drawing Canvas: Cursor tracking now works for all drawing modes (previously polylines-only) for consistent user experience.",
            "UI Polish: Drawing mode flyout menus now close automatically when a mode button is clicked.",
            "Technologies Page: Updated with RINEX Agent information and GNSS processing capabilities.",
            "Testing: Added comprehensive test suite for drawing canvas with 44 tests covering all modes, rubberbanding, and UI controls.",
            "Testing: Added 7 new tests for RINEX premium feature Go Home button functionality and navigation flow.",
            "Deployment: All changes deployed to Cloud Run with zero TypeScript errors.",
        ],
    },
    {
        version: "1.35.0",
        date: "November 14, 2025",
        highlights: [
            "Major Feature: RINEX Agent for GNSS Post-Processing! Process GPS/GLONASS/Galileo/BeiDou observation files with accurate positioning.",
            "Algorithm: Single Point Positioning (SPP) with least-squares optimization for precise coordinate computation.",
            "Technology: Real RINEX 2.11 and 3.03 file parsing with full metadata extraction and epoch-by-epoch observation processing.",
            "Coordinate System: WGS84 transformations (ECEF ↔ LLH) and local ENU frame conversions for precise positioning.",
            "Quality Metrics: DOP calculations (GDOP, PDOP, HDOP, VDOP, TDOP) for solution quality assessment.",
            "Output Formats: Export results as GeoJSON (mapping), CSV (analysis), KML (Google Earth), or JSON (full details).",
            "Infrastructure: Complete microservices architecture with Express API Gateway and Python Flask worker service.",
            "Backend Stack: Docker orchestration with Redis job queue for scalable GNSS processing.",
            "Frontend Integration: New RINEX Agent UI panel with file upload, configuration, progress tracking, and results visualization.",
            "Documentation: 2,200+ lines of comprehensive documentation covering architecture, API specs, and developer guides.",
        ],
    },
    {
        version: "1.34.0",
        date: "November 14, 2025",
        highlights: [
            "UI Enhancement: Agent tools buttons now display in the active agent's theme color for better visual consistency.",
            "Documentation: Added Google Vision API and Google Document AI to Technologies page for transparency about OCR capabilities.",
            "Documentation: Technologies page now organized by category (Framework, Build & Testing, APIs, Document Processing, Geospatial).",
            "Testing: Added comprehensive DXF Export test suite with 46 tests covering all export functionality.",
            "Quality: Full test suite now includes 436 tests (434 passing + 2 skipped) covering core utilities.",
            "Infrastructure: Continued refinement of agent UI consistency and documentation.",
        ],
    },
    {
        version: "1.33.0",
        date: "November 14, 2025",
        highlights: [
            "Infrastructure: Deployment verification update - separate frontend (nginx) and backend (Node.js) services on Cloud Run.",
            "Fix: Frontend now correctly points to deployed backend service at landsurv-backend-237999774959.us-west1.run.app.",
            "Enhancement: Backend environment variables properly configured with Stripe API keys and price IDs.",
            "Deployment: Frontend at beta-landsurv-ai-y55gmt77ga-uw.a.run.app serving latest build.",
            "Status: Both services running in us-west1 region with health checks passing.",
        ],
    },
    {
        version: "1.32.0",
        date: "November 13, 2025",
        highlights: [
            "Critical Fix: Civil Plan Expert coordinate extraction now 100% accurate! AI no longer reorders table rows based on coordinate values.",
            "Enhancement: Emphatic 'DO NOT REORDER' instructions prevent AI from 'helpfully' sorting coordinates by Northing/Easting values.",
            "Enhancement: Visual verification system - AI uses plan drawing to verify extracted NUMBER VALUES but never reorders rows.",
            "Fix: Disabled overly aggressive row swap correction that was scrambling correctly extracted coordinates.",
            "Fix: Expanded UTM Easting range validation to 3M to support all US coordinate zones (was limited to 1M).",
            "Quality: All 11 work points now extract in exact table order with perfect coordinate accuracy.",
            "Documentation: Clear instructions that table row order is ground truth - AI role is transcription, not organization.",
        ],
    },
    {
        version: "1.31.0",
        date: "November 13, 2025",
        highlights: [
            "Feature: Advanced Coordinate Correction System! Automatically detects and fixes OCR extraction errors.",
            "Correction: Digit Transposition - Fixes misread first/last digits (e.g., 388351 → 380351).",
            "Correction: Precision Enhancement - Ensures all coordinates have 4+ decimal places for surveying accuracy.",
            "Correction: Outlier Detection - Uses statistical analysis to identify and fix anomalous coordinates using neighboring points.",
            "Enhancement: Hybrid OCR Analysis - Combines Google Document AI with client-side correction for coordinate extraction.",
            "Dev Feature: Coordinate validation pipeline now tracks all corrections made with confidence scoring.",
            "Note: Row swap correction initially included but later disabled in v1.32.0 due to over-correction issues.",
        ],
    },
    {
        version: "1.30.0",
        date: "November 13, 2025",
        highlights: [
            "Feature: Server-Side OCR Integration! Backend now processes documents with optional Google Document AI and Tesseract.js fallback.",
            "Feature: Coordinate Extraction Enhancements! Improved table parsing and coordinate validation for Civil Plan Expert agent.",
            "Infrastructure: Deployed to Google Cloud Run with OCR endpoints at /api/ocr/document-ai and /api/ocr/batch-process.",
            "Enhancement: Three-tier OCR fallback strategy - Google Document AI → Tesseract.js → Manual entry for maximum reliability.",
            "Dev Feature: Optional Google Document AI dependency - system gracefully degrades to client-side processing if not configured.",
            "Documentation: Comprehensive OCR implementation guide and deployment configuration included.",
        ],
    },
    {
        version: "1.29.0",
        date: "November 13, 2025",
        highlights: [
            "Feature: Compute Credits System! Purchase credits through Stripe to power AI operations (1K, 5K, 10K packages).",
            "Enhancement: Header now displays available credits balance instead of trial countdown when credits are purchased.",
            "Bug Fix: Fixed credit amount calculation - purchases now correctly add the intended amount (no more 3x multiplier).",
            "Enhancement: Real-time localStorage sync for credits - updates instantly when returning from checkout.",
            "Dev Feature: Superuser mode (password: s3cur3s3cur3) now clears purchased credits for development testing.",
            "Infrastructure: Backend deployed to Cloud Run with Stripe webhook integration for payment processing.",
        ],
    },
    {
        version: "1.28.0",
        date: "November 10, 2025",
        highlights: [
            "Bug Fix: Fixed critical session load issue where loaded workspaces appeared blank. Canvas now defaults to visible when loading sessions.",
            "Enhancement: GPS Stakeout Agent now prompts for projection selection on entry if not set. Prevents errors during stakeout operations.",
            "Enhancement: GPS Stakeout welcome message now displays current projection (state + zone name) for confirmation.",
            "Quality: Cloud Run deployment updated with latest bug fixes and enhancements.",
            "Infrastructure: Application successfully deployed to Google Cloud Run with full feature set.",
        ],
    },
    {
        version: "1.27.0",
        date: "November 2024",
        highlights: [
            "New Feature: Extend Line Tool! Click a line to select it, then click a target line or point to extend it automatically.",
            "New Feature: Line Type Color Coding in header - Pink for breaklines, green for inclusion lines, red for exclusion lines, yellow for normal lines.",
            "Enhancement: Tool instructions moved to main header for better visibility and cleaner canvas view.",
            "Enhancement: Smart extend tool determines which end of the line to extend based on your click location.",
            "UI/UX: Blue header banner shows extend mode instructions with clear two-step workflow.",
        ],
    },
    {
        version: "1.26.0",
        date: "Current Beta",
        highlights: [
            "Refactoring Phase 6 Complete: Final application-level state migrated to AppStateContext.",
            "Architecture: 100% state migration complete - all useState hooks moved to dedicated context providers (FileStateContext, ChatStateContext, UIStateContext, CanvasStateContext, AppStateContext).",
            "Performance: Reduced App component from ~80 useState hooks down to 0, dramatically improving code maintainability and testability.",
            "Code Quality: Application state (job info, settings, active agents, text editor state, timing) now properly organized in AppStateContext.",
            "Strangler Pattern: Successfully completed context-based state management refactoring across all phases (1-6).",
        ],
    },
    {
        version: "1.25.0",
        date: "November 2024",
        highlights: [
            "Refactoring Phase 5 Complete: Canvas and geometry state migrated to CanvasStateContext for improved code organization.",
            "Performance: Reduced state management complexity from ~80 useState hooks down to 12 in the main App component.",
            "Architecture: All canvas, geometry, WMS, symbols, contours, GPS, and PDF highlight state now centralized in dedicated context providers.",
            "Code Quality: Better separation of concerns with FileStateContext, ChatStateContext, UIStateContext, and CanvasStateContext.",
        ],
    },
    {
        version: "1.24.0",
        date: "November 2024",
        highlights: [
            "New View: Layer Manager! A centralized panel to control the visibility of all points, lines, attributes, and map overlays on the canvas.",
        ],
    },
    {
        version: "1.23.0",
        date: "Current Beta",
        highlights: [
            "New Agent: Profile & Cross Section! Generate elevation profiles along lines or centerlines using natural language commands.",
            "New Feature: The Profile & Cross Section view now includes a visual chart to display the generated profile.",
            "New Feature: Added the ability to save generated profiles as CSV files to the File Manager for later use.",
            "Enhancement: The Profile & Cross Section agent is now integrated into the LSVZ session file, saving chat history and profile data.",
        ],
    },
    {
        version: "1.22.0",
        date: "Current Beta",
        highlights: [
            "New Feature: Polyline Drawing Tool. You can now draw lines and polylines by clicking from point to point on the canvas.",
            "New Feature: Breakline Support. When drawing a polyline, you can now tag it as a 'Breakline' to enforce sharp elevation changes in the contouring model.",
            "Enhancement: Breakline color updated to a vibrant hot pink for better visibility on the canvas.",
            "Contouring Fix: Resolved an issue where contouring artifacts (voids) would appear when survey points were very close to a breakline. The algorithm now uses a tolerance-based check to correctly handle shared points.",
            "UI/UX: The cursor now changes to a crosshair when in drawing mode for better precision.",
            "Fixes: A series of stability improvements for the drawing canvas, including fixes for annotation scaling and DXF export functions.",
        ],
    },
    {
        version: "1.21.0",
        highlights: [
            "New Agent: Contouring Agent! Generate accurate topographic lines from project points using a client-side Delaunay triangulation (TIN) model.",
            "New Feature: Symbol Manager. Create custom point symbols using AI or by importing geometry from a DXF file.",
            "UI/UX: Added floating toolbars to the Drawing Canvas and PDF Viewer for easier access to view-specific tools.",
            "Enhancement: Improved WMS support and introduced the ability to download map areas for offline use.",
        ],
    },
    {
        version: "1.20.0",
        highlights: [
            "New Agent: GIS Agent! Added support for GeoJSON files, including automatic plotting and AI analysis.",
            "Enhancement: The Point Editor now supports attaching photos to points, either from your device's camera or by uploading a file.",
            "Enhancement: Upgraded PDF processing pipeline for more robust text extraction and to enable multimodal analysis by the AI.",
        ],
    },
    {
        version: "1.19.0",
        highlights: [
            "New Agent: Image Analyzer! Upload site photos for AI-powered description and tagging.",
            "Feature: Added 'Info & Help' menu to the sidebar for easier access to documentation, release notes, and support.",
        ],
    },
    {
        version: "1.18.0",
        highlights: [
            "Major Upgrade: Introduced the LSVZ Meta-Agent, a high-level AI that can reason about the entire project session.",
            "Enhancement: Revamped chat message display to separate the AI's 'thinking' process from the final result, providing greater transparency.",
            "UI/UX: Implemented a responsive three-panel layout and a mobile-friendly slide-out sidebar.",
        ],
    },
    {
        version: "1.17.0",
        highlights: [
            "New Agent: Civil Plan Expert! The AI can now read and interpret multi-page civil engineering plans in PDF format.",
            "Feature: Introduced AI-powered uncertainty highlighting for PDF documents, allowing the AI to flag smudged or illegible areas.",
        ],
    },
    {
        version: "1.16.0",
        highlights: [
            "New Agent: GPS Stakeout! Use your device's built-in GPS for real-time point stakeout and topographic data collection.",
            "Feature: Added State Plane Coordinate System selection in Settings to enable projection-aware GPS functions.",
        ],
    },
    {
        version: "1.15.0",
        highlights: [
            "New Agent: DXF Analyzer. Upload .dxf files to query their contents and visualize geometry.",
            "Feature: Added DXF export functionality, allowing canvas data to be saved as a .dxf file.",
            "UI/UX: Redesigned the initial agent selection screen for a more intuitive start to new projects.",
        ],
    },
    {
        version: "1.14.0",
        highlights: [
            "New Agent: Stationing & CL. Define horizontal alignments (centerlines) by PI and perform station/offset calculations.",
            "Feature: Point Editor now supports organizing points into separate, toggleable lists.",
        ],
    },
];

export const ReleaseLogContent: React.FC = () => {
    return (
        <div className="space-y-8">
            {releases.map(release => (
                <section key={release.version}>
                    <div className="flex items-baseline gap-3 border-b border-gray-700 pb-2 mb-3 light-theme:border-gray-300">
                        <h3 className="text-xl font-bold text-blue-300">{`Version ${release.version}`}</h3>
                        {release.date && <span className="text-sm text-gray-400 light-theme:text-gray-500">{release.date}</span>}
                    </div>
                    <ul className="list-disc list-inside space-y-2 text-gray-300 light-theme:text-gray-600">
                        {release.highlights.map((item, index) => (
                            <li key={index}>{item}</li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
};
