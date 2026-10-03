import React from 'react';
import { PublicSubdomainShell } from './PublicSubdomainShell.tsx';

/**
 * standards.landsurv.ai — Industry Standards & Specifications
 *
 * Comprehensive reference for all industry standards, technical specifications,
 * and data format documentation used by LandSurv.ai across surveying, GIS,
 * civil engineering, and CAD workflows.
 */

const Section: React.FC<{ title: string; children: React.ReactNode; accent?: string }> = ({
  title,
  children,
  accent = 'text-blue-400',
}) => (
  <section className="mb-5 rounded-2xl border border-white/[0.08] bg-slate-950/35 p-6 sm:p-7">
    <h2 className={`text-xl font-bold ${accent}`}>{title}</h2>
    <div className="text-gray-300 space-y-3 leading-relaxed text-[15px]">{children}</div>
  </section>
);

const Bullet: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex items-start gap-2">
    <span className="text-blue-400 mt-0.5">•</span>
    <span>{children}</span>
  </li>
);

const StandardCard: React.FC<{
  title: string;
  description: string;
  status: 'supported' | 'partial' | 'planned';
  link?: string;
}> = ({ title, description, status, link }) => {
  const statusColor = {
    supported: 'bg-green-500/20 border-green-500/50 text-green-300',
    partial: 'bg-amber-500/20 border-amber-500/50 text-amber-300',
    planned: 'bg-blue-500/20 border-blue-500/50 text-blue-300',
  };

  const statusLabel = {
    supported: '✓ Supported',
    partial: '◐ Partial Support',
    planned: '◯ Planned',
  };

  return (
    <div className="mb-4 rounded-xl border border-white/[0.08] bg-slate-900/55 p-5 transition-colors hover:border-cyan-400/25">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-lg font-semibold text-gray-100">{title}</h3>
        <span className={`px-3 py-1 rounded text-xs font-semibold border ${statusColor[status]}`}>
          {statusLabel[status]}
        </span>
      </div>
      <p className="text-gray-300 text-sm mb-3">{description}</p>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 text-sm font-medium underline"
        >
          Learn more →
        </a>
      )}
    </div>
  );
};

export function StandardsSubdomainPage() {
  return (
    <PublicSubdomainShell
      eyebrow="Reference library"
      title="Industry Standards & Specifications"
      description="A standards-aware foundation for surveying, geospatial, civil-engineering, and CAD workflows."
      contentClassName="max-w-5xl"
    >
        <div className="mb-5 rounded-2xl border border-blue-400/20 bg-blue-950/25 p-6">
          <p className="font-bold text-blue-300 mb-1">Standards Compliance Across Surveying & GIS</p>
          <p className="text-blue-100/85 text-sm leading-relaxed">
            LandSurv.ai implements industry-standard specifications for land surveying, geospatial data,
            civil engineering, and CAD workflows. This reference documents all supported standards, their
            integration level, and implementation status. For technical questions, contact{' '}
            <a href="mailto:standards@landsurv.ai" className="text-blue-300 hover:underline">
              standards@landsurv.ai
            </a>.
          </p>
        </div>

        <Section title="1. Surveying & Coordinate Standards">
          <StandardCard
            title="NAD83 / WGS84 Coordinate Systems"
            description="Support for North American Datum 1983 (NAD83) and World Geodetic System 1984 (WGS84) geographic and projected coordinate systems with full EPSG projection database integration."
            status="supported"
          />
          <StandardCard
            title="State Plane Coordinates (SPCS)"
            description="All 50 U.S. states and territories supported via EPSG database. Automatic zone detection based on geometry or manual specification."
            status="supported"
            link="https://www.ngs.noaa.gov/CORS/"
          />
          <StandardCard
            title="UTM (Universal Transverse Mercator)"
            description="Full UTM zone support with automatic zone detection and coordinate transformation capabilities."
            status="supported"
          />
          <StandardCard
            title="Local Grid Systems"
            description="Custom coordinate system definitions via Proj4 parameters. Support for arbitrary linear transformations and site-specific coordinate systems."
            status="supported"
          />
          <StandardCard
            title="GNSS Processing (RINEX)"
            description="Support for RINEX 2.11 and 3.x format for raw GNSS observations. Post-processing via RTKLIB with RTK and PPP capabilities."
            status="supported"
            link="https://igs.bkg.bund.de/ntrip/download"
          />
          <StandardCard
            title="International Standards (ISO 19100 Series)"
            description="Geographic Information standards alignment including metadata, data quality, and feature catalogs."
            status="partial"
          />
        </Section>

        <Section title="2. Data Exchange Formats" accent="text-green-400">
          <StandardCard
            title="DXF (Drawing Exchange Format)"
            description="Support for DXF R2000-R2021 formats. Full layer, linetype, block, and attribute support. Real-time DXF analysis and manipulation."
            status="supported"
            link="https://images.autodesk.com/adsk/files/autocad_2021_pdf_dxf-reference_enu.pdf"
          />
          <StandardCard
            title=".RAW Point File Format"
            description="LandSurv.ai native format for survey points and observations. Documented, open specification for point exchange."
            status="supported"
            link="https://lsvz.landsurv.ai"
          />
          <StandardCard
            title="Deed Format (.DEED)"
            description="LandSurv.ai native format for deed boundary and title data encoding."
            status="supported"
          />
          <StandardCard
            title="GeoJSON (RFC 7946)"
            description="GeoJSON support for vector feature exchange with Web GIS and mapping applications."
            status="supported"
            link="https://tools.ietf.org/html/rfc7946"
          />
          <StandardCard
            title="GeoTIFF / COG (Cloud Optimized GeoTIFF)"
            description="Support for georeferenced raster imagery. Cloud-optimized layout for efficient access."
            status="supported"
            link="https://www.cogeo.org/"
          />
          <StandardCard
            title="GPX (GPS Exchange Format)"
            description="Full GPX 1.1 support for track logs, waypoints, and route exchange with field equipment and mapping platforms."
            status="supported"
            link="https://www.topografix.com/GPX/1_1/"
          />
          <StandardCard
            title="LAS / LAZ (Point Cloud)"
            description="LAS 1.2-1.4 and LAZ compressed format support for lidar and point cloud data."
            status="supported"
            link="https://www.asprs.org/divisions-committees/lidar-division/laser-las-file-format-exchange-activities"
          />
          <StandardCard
            title="ESRI Shapefile"
            description="Read/write support for ESRI shapefiles including attribute tables and spatial indexing."
            status="supported"
          />
          <StandardCard
            title="SHP → GeoJSON Conversion"
            description="Automatic conversion between ESRI Shapefile and GeoJSON formats with attribute preservation."
            status="supported"
          />
          <StandardCard
            title=".3DS / .DWG (Civil 3D Exchange)"
            description="Integration with Autodesk Civil 3D via the LandsurvConnector plugin. Native DWG support pending."
            status="partial"
            link="https://civil3d.landsurv.ai"
          />
        </Section>

        <Section title="3. GIS & Mapping Standards" accent="text-purple-400">
          <StandardCard
            title="OGC WMS (Web Map Service)"
            description="Client-side WMS layer support for remote imagery and basemap services. Compatible with USGS, NOAA, and commercial WMS endpoints."
            status="supported"
            link="https://www.ogc.org/standards/wms"
          />
          <StandardCard
            title="OGC WFS (Web Feature Service)"
            description="WFS support for querying and downloading vector features from OGC-compliant servers."
            status="partial"
            link="https://www.ogc.org/standards/wfs"
          />
          <StandardCard
            title="ESRI REST API"
            description="Integration with ESRI ArcGIS Online and ArcGIS Server via REST endpoints. Layer query and feature access."
            status="supported"
            link="https://developers.arcgis.com/rest/"
          />
          <StandardCard
            title="Tile Map Service (TMS)"
            description="TMS v1.0.0 endpoint support for raster tile layer access."
            status="supported"
            link="https://wiki.osgeo.org/wiki/Tile_Map_Service_Specification"
          />
          <StandardCard
            title="OGC GeoPackage"
            description="Read support for GeoPackage (SQLite-based) vector and raster data containers."
            status="partial"
            link="https://www.ogc.org/standards/geopackage"
          />
          <StandardCard
            title="USGS Data Standards"
            description="Integration with USGS data services including NED, NLCD, and Hydrography datasets."
            status="supported"
            link="https://www.usgs.gov/faqs/what-are-open-and-freely-available-geospatial-data-sources"
          />
          <StandardCard
            title="NAIP Imagery"
            description="National Agriculture Imagery Program (NAIP) raster support via USGS/Microsoft Azure."
            status="supported"
            link="https://www.fsa.usda.gov/programs-and-services/aerial-photography/imagery-programs/naip-overview/"
          />
        </Section>

        <Section title="4. Civil Engineering & Surveying Conventions" accent="text-yellow-400">
          <StandardCard
            title="Stationing & Centerline"
            description="Standard surveying stationing conventions. Centerline alignment definition and stationing calculations."
            status="supported"
          />
          <StandardCard
            title="Bearing & Distance"
            description="Azimuth, bearing angle, and distance calculations with support for magnetic declination corrections."
            status="supported"
          />
          <StandardCard
            title="Curve Geometry"
            description="Horizontal and vertical curve calculations including spiral transitions, tangent breaks, and closure reporting."
            status="supported"
          />
          <StandardCard
            title="COGO (Coordinate Geometry)"
            description="Inverse/forward calculations, traverse closure analysis, and least-squares adjustment."
            status="supported"
            link="https://en.wikipedia.org/wiki/Coordinate_geometry"
          />
          <StandardCard
            title="Cross-Section Analysis"
            description="Profile generation, cross-section cuts, and volume calculations from survey data."
            status="supported"
          />
          <StandardCard
            title="Contour Generation"
            description="TIN-based and gridded contour line generation with user-defined interval control."
            status="supported"
          />
          <StandardCard
            title="Slope Analysis & Classification"
            description="Steepness and slope aspect calculations with terrain classification."
            status="supported"
          />
        </Section>

        <Section title="5. Standards Documentation & Specifications" accent="text-indigo-400">
          <StandardCard
            title="LSVZ Format Documentation"
            description="Complete technical specification for LandSurv.ai's native .lsvz file format."
            status="supported"
            link="https://lsvz.landsurv.ai"
          />
          <StandardCard
            title="CACP (Cross-Agent Communications Protocol)"
            description="Open specification for inter-agent and multi-system communication in the LandSurv.ai ecosystem."
            status="supported"
            link="https://cacp.landsurv.ai"
          />
          <StandardCard
            title="Proj4 / Proj String Definition"
            description="Custom coordinate system definitions using Proj4 syntax for specialized coordinate systems."
            status="supported"
            link="https://proj.org/"
          />
          <StandardCard
            title="RFC Standards Compliance"
            description="JSON (RFC 7158), UTF-8 encoding (RFC 3629), and HTTP/HTTPS protocols per IETF standards."
            status="supported"
          />
        </Section>

        <Section title="6. Professional Practice Standards">
          <StandardCard
            title="RICS (Royal Institution of Chartered Surveyors)"
            description="Professional practice guidance for surveying. LandSurv.ai compliance with RICS standards documented in legal disclosures."
            status="partial"
            link="https://www.rics.org/"
          />
          <StandardCard
            title="ACSM Standards (American Congress on Surveying and Mapping)"
            description="U.S. surveying and mapping standards alignment."
            status="partial"
            link="https://www.acsm.net/"
          />
          <StandardCard
            title="Professional Liability Disclaimers"
            description="All surveying and engineering outputs carry professional practice disclaimers. Not a substitute for licensed surveyor review."
            status="supported"
            link="https://legal.landsurv.ai"
          />
        </Section>

        <Section title="7. Security & Data Standards" accent="text-red-400">
          <StandardCard
            title="FIPS 140-2 Cryptography"
            description="Support for FIPS 140-2 validated cryptographic modules in government compliance mode."
            status="partial"
            link="https://csrc.nist.gov/projects/cryptographic-module-validation-program/"
          />
          <StandardCard
            title="AES-256 Encryption"
            description="AES-256 bit encryption for sensitive session and data storage."
            status="supported"
          />
          <StandardCard
            title="TLS 1.2+ (RFC 5246, RFC 8446)"
            description="Transport Layer Security 1.2 and TLS 1.3 for all client-server communication."
            status="supported"
            link="https://tools.ietf.org/html/rfc8446"
          />
          <StandardCard
            title="JWT (JSON Web Tokens - RFC 7519)"
            description="JWT-based authentication for API access and session management."
            status="supported"
            link="https://tools.ietf.org/html/rfc7519"
          />
          <StandardCard
            title="OAuth 2.0 (RFC 6749)"
            description="OAuth 2.0 support for third-party integrations and federated identity."
            status="supported"
            link="https://tools.ietf.org/html/rfc6749"
          />
        </Section>

        <Section title="8. Implementation Roadmap" accent="text-pink-400">
          <p className="text-sm mb-4">
            Planned standards support and enhancement areas:
          </p>
          <ul className="space-y-2 text-sm">
            <Bullet>Full OGC WFS 2.0 implementation for advanced feature querying</Bullet>
            <Bullet>Native .DWG and .DWF (Autodesk) format support (currently via Civil 3D plugin)</Bullet>
            <Bullet>GeoPackage write support for mobile offline workflows</Bullet>
            <Bullet>ISO 19100 series full compliance with complete metadata framework</Bullet>
            <Bullet>Vector Tiles (MVT) for optimized client-side rendering</Bullet>
            <Bullet>3D model formats (gITF 2.0, OBJ) for terrain and volumetric visualization</Bullet>
            <Bullet>MicroStation DGN format support</Bullet>
            <Bullet>Extended FedRAMP authorization support and audit trail documentation</Bullet>
          </ul>
        </Section>

        <Section title="9. Standards References & Links" accent="text-gray-300">
          <ul className="space-y-2 text-sm">
            <Bullet>
              OGC Standards Portal: <a className="text-blue-400 hover:underline" href="https://www.ogc.org/standards" target="_blank" rel="noopener noreferrer">https://www.ogc.org/standards</a>
            </Bullet>
            <Bullet>
              PROJ Coordinate Reference Systems: <a className="text-blue-400 hover:underline" href="https://proj.org/" target="_blank" rel="noopener noreferrer">https://proj.org/</a>
            </Bullet>
            <Bullet>
              EPSG Geodetic Parameter Dataset: <a className="text-blue-400 hover:underline" href="https://www.epsg-registry.org/" target="_blank" rel="noopener noreferrer">https://www.epsg-registry.org/</a>
            </Bullet>
            <Bullet>
              USGS Data Services: <a className="text-blue-400 hover:underline" href="https://www.usgs.gov/programs/VHP/what_are_data_services" target="_blank" rel="noopener noreferrer">https://www.usgs.gov/</a>
            </Bullet>
            <Bullet>
              IETF Standards (RFC): <a className="text-blue-400 hover:underline" href="https://tools.ietf.org/" target="_blank" rel="noopener noreferrer">https://tools.ietf.org/</a>
            </Bullet>
            <Bullet>
              NIST Standards & Guidelines: <a className="text-blue-400 hover:underline" href="https://csrc.nist.gov/" target="_blank" rel="noopener noreferrer">https://csrc.nist.gov/</a>
            </Bullet>
          </ul>
        </Section>

        <Section title="10. Questions & Contact" accent="text-gray-300">
          <p className="text-sm text-gray-400">
            Have questions about standards support or want to request a new standard?
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Standards & Technical Questions: <a className="text-blue-400 hover:underline" href="mailto:standards@landsurv.ai">standards@landsurv.ai</a>
          </p>
          <p className="text-sm text-gray-400">
            General Support: <a className="text-blue-400 hover:underline" href="mailto:support@landsurv.ai">support@landsurv.ai</a>
          </p>
          <p className="text-xs text-gray-500 mt-4">
            Last updated: August 6, 2026.
          </p>
        </Section>
    </PublicSubdomainShell>
  );
}

export default StandardsSubdomainPage;
