/**
 * arcgisDataSources — curated catalog of public ArcGIS REST servers.
 *
 * A small, hand-maintained set of well-known, agency-published endpoints that
 * are useful to surveyors (boundaries, PLSS, flood, contours, parcels). Every
 * entry is verified to answer `?f=json`. Endpoints here are server/folder
 * roots or service roots — the GIS Agent's server browser drills into them.
 *
 * For the full community-maintained list of 7,500+ federal/state/county/city
 * ArcGIS servers, see the MappingSupport report (link below). We link to it
 * instead of copying it: that list is © Joseph Elfelt and its license does
 * not allow redistribution inside a commercial product.
 */

export interface GisDataSource {
  name: string;
  /** ArcGIS REST endpoint — server root, folder, service root, or layer. */
  url: string;
  description: string;
}

export interface GisDataSourceCategory {
  category: string;
  sources: GisDataSource[];
}

export const MAPPING_SUPPORT_LIST_URL =
  'https://mappingsupport.com/p/surf_gis/list-federal-state-county-city-GIS-servers.pdf';

export const ARCGIS_DATA_CATALOG: GisDataSourceCategory[] = [
  {
    category: 'Federal',
    sources: [
      {
        name: 'US Census Bureau — TIGERweb',
        url: 'https://tigerweb.geo.census.gov/arcgis/rest/services',
        description: 'State, county, tract and place boundaries; roads and hydrography from MAF/TIGER.',
      },
      {
        name: 'USGS — The National Map (vector overlays)',
        url: 'https://carto.nationalmap.gov/arcgis/rest/services',
        description: 'Contours, hydrography, transportation, structures, and government unit boundaries.',
      },
      {
        name: 'USGS — The National Map (basemaps)',
        url: 'https://basemap.nationalmap.gov/arcgis/rest/services',
        description: 'USGS topographic basemap and imagery services.',
      },
      {
        name: 'FEMA — National Flood Hazard Layer',
        url: 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer',
        description: 'Flood zones (SFHA), floodways, BFEs, and cross sections from the NFHL.',
      },
      {
        name: 'BLM — Geocommunicator',
        url: 'https://gis.blm.gov/arcgis/rest/services',
        description: 'Public Land Survey System (PLSS) townships/sections, surface management agency, and federal lands.',
      },
      {
        name: 'US Forest Service — Enterprise Data Warehouse',
        url: 'https://apps.fs.usda.gov/arcx/rest/services/EDW',
        description: 'National forest ownership, trails, recreation sites, and motor vehicle use maps.',
      },
      {
        name: 'National Park Service — Public Data',
        url: 'https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services',
        description: 'Park boundaries, trails, buildings, and points of interest.',
      },
    ],
  },
  {
    category: 'State / County / City',
    sources: [
      {
        name: 'King County, WA — GIS Services',
        url: 'https://gismaps.kingcounty.gov/arcgis/rest/services',
        description: 'Parcels, property, hydrography, and environment layers for the Seattle metro area.',
      },
      {
        name: 'Los Angeles County, CA — Public GIS',
        url: 'https://public.gis.lacounty.gov/public/rest/services',
        description: 'Countywide parcels (Assessor), boundaries, and infrastructure.',
      },
      {
        name: 'Hennepin County, MN — GIS',
        url: 'https://gis.hennepin.us/arcgis/rest/services',
        description: 'Parcels, property, and natural resources for the Minneapolis area.',
      },
      {
        name: 'State of Oregon — GEOHub Navigator',
        url: 'https://navigator.state.or.us/arcgis/rest/services',
        description: 'Statewide framework data: boundaries, transportation, hydrography, elevation.',
      },
      {
        name: 'City of Chicago, IL — GIS',
        url: 'https://gisapps.cityofchicago.org/arcgis/rest/services',
        description: 'City boundaries, wards, parcels, and public works data.',
      },
    ],
  },
  {
    category: 'Demo / Training (Esri)',
    sources: [
      {
        name: 'Esri Sample Server (browse all)',
        url: 'https://sampleserver6.arcgisonline.com/arcgis/rest/services',
        description: 'Esri training server with dozens of small demo services.',
      },
      {
        name: 'USA States (direct layer)',
        url: 'https://sampleserver6.arcgisonline.com/arcgis/rest/services/USA/MapServer/2',
        description: 'State polygons — quick polygon/line rendering test.',
      },
      {
        name: 'USA Major Cities (direct layer)',
        url: 'https://sampleserver6.arcgisonline.com/arcgis/rest/services/USA/MapServer/0',
        description: 'Point layer of major US cities.',
      },
      {
        name: 'World Cities (direct layer)',
        url: 'https://sampleserver6.arcgisonline.com/arcgis/rest/services/SampleWorldCities/MapServer/0',
        description: 'Point layer of world cities.',
      },
    ],
  },
];
