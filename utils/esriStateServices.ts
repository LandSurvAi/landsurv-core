/**
 * Registry of publicly-available ESRI REST contour services by US state.
 *
 * Adding a new state:
 *   1. Find the ArcGIS REST MapServer or FeatureServer layer URL for that state's
 *      official contour dataset.
 *   2. Add a { name, url, intervalFt, attribution, notes? } entry to `layers`.
 *   3. Test the URL by fetching <url>?f=json — confirm it returns geometry features.
 *
 * States without a confirmed service keep `layers: []` and provide `portalUrl`
 * so users can discover URLs themselves and paste them via the custom URL input.
 */

export interface EsriContourLayer {
  /** Human-readable display name shown in the UI */
  name: string;
  /** Full ArcGIS REST layer URL (e.g. …/MapServer/0) */
  url: string;
  /** Contour interval in feet (if known) */
  intervalFt?: number;
  /** Data source / licensing attribution */
  attribution: string;
  /** Optional caveats e.g. coverage notes */
  notes?: string;
}

export interface EsriStateEntry {
  /** Full state name */
  state: string;
  /** Two-letter postal abbreviation */
  abbr: string;
  /**
   * Confirmed, live ESRI REST layers for this state.
   * Empty array = not yet configured → show coming-soon UI.
   */
  layers: EsriContourLayer[];
  /** Link to the state GIS portal so users can manually browse services */
  portalUrl?: string;
}

export const ESRI_STATE_SERVICES: EsriStateEntry[] = [
  {
    state: 'Alabama', abbr: 'AL', layers: [],
    portalUrl: 'https://experience.arcgis.com/experience/aff5ce23522341ac909fba8e3db41d2e/',
  },
  {
    state: 'Alaska', abbr: 'AK', layers: [],
    portalUrl: 'https://gis.data.alaska.gov/',
  },
  {
    state: 'Arizona', abbr: 'AZ', layers: [],
    portalUrl: 'https://azgeo.az.gov/',
  },
  {
    state: 'Arkansas', abbr: 'AR', layers: [],
    portalUrl: 'https://www.geostor.arkansas.gov/',
  },
  {
    state: 'California', abbr: 'CA', layers: [],
    portalUrl: 'https://gis.data.ca.gov/',
  },
  {
    state: 'Colorado', abbr: 'CO', layers: [],
    portalUrl: 'https://geodata.colorado.gov/',
  },
  {
    state: 'Connecticut', abbr: 'CT', layers: [],
    portalUrl: 'https://ct.gov/deep/cwp/view.asp?a=2698&q=322898',
  },
  {
    state: 'Delaware', abbr: 'DE', layers: [],
    portalUrl: 'https://firstmap.delaware.gov/',
  },
  {
    state: 'District of Columbia', abbr: 'DC', layers: [],
    portalUrl: 'https://opendata.dc.gov/',
  },
  {
    state: 'Florida', abbr: 'FL', layers: [],
    portalUrl: 'https://www.fgdl.org/metadataexplorer/explorer.jsp',
  },
  {
    state: 'Georgia', abbr: 'GA', layers: [],
    portalUrl: 'https://data.georgiaspatial.org/',
  },
  {
    state: 'Hawaii', abbr: 'HI', layers: [],
    portalUrl: 'https://geoportal.hawaii.gov/',
  },
  {
    state: 'Idaho', abbr: 'ID', layers: [],
    portalUrl: 'https://gis-idaho.hub.arcgis.com/',
  },
  {
    state: 'Illinois', abbr: 'IL', layers: [],
    portalUrl: 'https://clearinghouse.isgs.illinois.edu/',
  },
  {
    state: 'Indiana', abbr: 'IN', layers: [],
    portalUrl: 'https://www.indianamap.org/',
  },
  {
    state: 'Iowa', abbr: 'IA', layers: [],
    portalUrl: 'https://geodata.iowa.gov/',
  },
  {
    state: 'Kansas', abbr: 'KS', layers: [],
    portalUrl: 'https://kansasgis.org/',
  },
  {
    state: 'Kentucky', abbr: 'KY', layers: [],
    portalUrl: 'https://kygeonet.ky.gov/',
  },
  {
    state: 'Louisiana', abbr: 'LA', layers: [],
    portalUrl: 'https://lagic.lsu.edu/',
  },
  {
    state: 'Maine', abbr: 'ME', layers: [],
    portalUrl: 'https://www.maine.gov/geolib/',
  },
  {
    state: 'Maryland', abbr: 'MD', layers: [],
    portalUrl: 'https://geodata.md.gov/',
  },
  {
    state: 'Massachusetts', abbr: 'MA', layers: [],
    portalUrl: 'https://www.mass.gov/orgs/massgis-bureau-of-geographic-information',
  },
  {
    state: 'Michigan', abbr: 'MI', layers: [],
    portalUrl: 'https://www.michigan.gov/emergingtech/0,4568,7-150-79574_79576---,00.html',
  },
  {
    state: 'Minnesota', abbr: 'MN', layers: [],
    portalUrl: 'https://www.mngeo.state.mn.us/',
  },
  {
    state: 'Mississippi', abbr: 'MS', layers: [],
    portalUrl: 'https://www.maris.state.ms.us/',
  },
  {
    state: 'Missouri', abbr: 'MO', layers: [],
    portalUrl: 'https://msdis.missouri.edu/',
  },
  {
    state: 'Montana', abbr: 'MT', layers: [],
    portalUrl: 'https://geoinfo.msl.mt.gov/',
  },
  {
    state: 'Nebraska', abbr: 'NE', layers: [],
    portalUrl: 'https://www.nebraskamap.gov/',
  },
  {
    state: 'Nevada', abbr: 'NV', layers: [],
    portalUrl: 'https://clearinghouse.nbmg.unr.edu/',
  },
  {
    state: 'New Hampshire', abbr: 'NH', layers: [],
    portalUrl: 'https://www.granit.unh.edu/',
  },
  {
    state: 'New Jersey', abbr: 'NJ', layers: [],
    portalUrl: 'https://njgin.nj.gov/njgin/index.jsp',
  },
  {
    state: 'New Mexico', abbr: 'NM', layers: [],
    portalUrl: 'https://rgis.unm.edu/',
  },
  {
    state: 'New York', abbr: 'NY', layers: [],
    portalUrl: 'https://cugir.library.cornell.edu/',
  },
  {
    state: 'North Carolina', abbr: 'NC', layers: [],
    portalUrl: 'https://www.nconemap.gov/',
  },
  {
    state: 'North Dakota', abbr: 'ND', layers: [],
    portalUrl: 'https://www.nd.gov/gis/',
  },
  {
    state: 'Ohio', abbr: 'OH', layers: [],
    portalUrl: 'https://ogrip.oit.ohio.gov/',
  },
  {
    state: 'Oklahoma', abbr: 'OK', layers: [],
    portalUrl: 'https://www.spatialreference.org/ref/epsg/?search=oklahoma',
  },
  {
    state: 'Oregon', abbr: 'OR', layers: [],
    portalUrl: 'https://oregon-geo.hub.arcgis.com/',
  },
  {
    // ── CONFIRMED ──────────────────────────────────────────────────────────
    state: 'Pennsylvania', abbr: 'PA',
    portalUrl: 'https://www.pasda.psu.edu/',
    layers: [
      {
        name: 'PAMAP 2ft Contours (South PA)',
        url: 'https://services.pasda.psu.edu/arcgis/rest/services/PAMAP_Contours/MapServer/2',
        intervalFt: 2,
        attribution: 'Pennsylvania Spatial Data Access (PASDA) / PAMAP Program',
        notes: 'LiDAR-derived 2-foot contours — southern PA mosaic. Use Inclusion mode for parcel-scale queries.',
      },
      {
        name: 'PAMAP 2ft Contours (North PA)',
        url: 'https://services.pasda.psu.edu/arcgis/rest/services/PAMAP_Contours/MapServer/1',
        intervalFt: 2,
        attribution: 'Pennsylvania Spatial Data Access (PASDA) / PAMAP Program',
        notes: 'LiDAR-derived 2-foot contours — northern PA mosaic. Use Inclusion mode for parcel-scale queries.',
      },
    ],
  },
  {
    state: 'Rhode Island', abbr: 'RI', layers: [],
    portalUrl: 'https://www.rigis.org/',
  },
  {
    state: 'South Carolina', abbr: 'SC', layers: [],
    portalUrl: 'https://www.dnr.sc.gov/maps.html',
  },
  {
    state: 'South Dakota', abbr: 'SD', layers: [],
    portalUrl: 'https://opendata.sdgis.gov/',
  },
  {
    state: 'Tennessee', abbr: 'TN', layers: [],
    portalUrl: 'https://www.tngis.org/',
  },
  {
    state: 'Texas', abbr: 'TX', layers: [],
    portalUrl: 'https://tnris.org/',
  },
  {
    state: 'Utah', abbr: 'UT', layers: [],
    portalUrl: 'https://gis.utah.gov/',
  },
  {
    state: 'Vermont', abbr: 'VT', layers: [],
    portalUrl: 'https://vcgi.vermont.gov/',
  },
  {
    state: 'Virginia', abbr: 'VA', layers: [],
    portalUrl: 'https://vgin.vdem.virginia.gov/',
  },
  {
    state: 'Washington', abbr: 'WA', layers: [],
    portalUrl: 'https://geo.wa.gov/',
  },
  {
    state: 'West Virginia', abbr: 'WV', layers: [],
    portalUrl: 'https://wvgis.wvu.edu/data/data.php',
  },
  {
    state: 'Wisconsin', abbr: 'WI', layers: [],
    portalUrl: 'https://www.sco.wisc.edu/',
  },
  {
    state: 'Wyoming', abbr: 'WY', layers: [],
    portalUrl: 'https://wyoming.gov/gis',
  },
];

/** Quick lookup by abbreviation */
export const getStateEntry = (abbr: string): EsriStateEntry | undefined =>
  ESRI_STATE_SERVICES.find(s => s.abbr === abbr);
