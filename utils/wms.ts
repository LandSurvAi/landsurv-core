import { type WmsService, type WmsLayerInfo } from '../types.ts';
import { fetchViaProxy } from './corsProxy.ts';

const parseXml = (xmlString: string): Document => {
    const parser = new DOMParser();
    return parser.parseFromString(xmlString, "application/xml");
};

const getElementText = (element: Element | null, tagName: string): string => {
    if (!element) return '';
    const child = element.querySelector(`:scope > ${tagName}`);
    return child?.textContent?.trim() || '';
};


const getSupportedCrs = (layer: Element): string[] => {
    const crsElements = Array.from(layer.querySelectorAll(':scope > CRS, :scope > SRS'));
    return crsElements.map(el => el.textContent?.trim() || '').filter(Boolean);
};


export const fetchWmsCapabilities = async (url: string): Promise<WmsService> => {
    const capabilitiesUrl = new URL(url);
    capabilitiesUrl.searchParams.set('service', 'WMS');
    capabilitiesUrl.searchParams.set('request', 'GetCapabilities');
    
    // Use the prioritized CORS-proxy helper (codetabs → allorigins → corsproxy.io).
    // A single hard-coded proxy here repeatedly broke when one provider had an
    // outage. The helper logs each failure and tries the next.
    const response = await fetchViaProxy(capabilitiesUrl.toString());
    if (!response.ok) {
        throw new Error(`Failed to fetch WMS capabilities: ${response.statusText}`);
    }
    const xmlString = await response.text();
    const xmlDoc = parseXml(xmlString);
    
    const errorNode = xmlDoc.querySelector('ServiceException');
    if (errorNode) {
        throw new Error(`WMS Service Error: ${errorNode.textContent || 'Unknown error'}`);
    }
    
    const serviceElement = xmlDoc.querySelector('Service');
    const capabilityElement = xmlDoc.querySelector('Capability');
    
    if (!serviceElement || !capabilityElement) {
        throw new Error('Invalid GetCapabilities response: Missing Service or Capability section.');
    }
    
    const rootLayerElement = capabilityElement.querySelector('Capability > Layer');
    if (!rootLayerElement) {
        throw new Error('Invalid GetCapabilities response: No root layer found.');
    }

    const layers: WmsLayerInfo[] = Array.from(rootLayerElement.querySelectorAll(':scope > Layer'))
        .filter(layerEl => layerEl.querySelector(':scope > Name')) // Only include layers with a Name
        .map(layerEl => {
            const bboxElement = layerEl.querySelector('LatLonBoundingBox') || layerEl.querySelector('BoundingBox[CRS="EPSG:4326"]');
            const bbox: [number, number, number, number] = bboxElement ? [
                parseFloat(bboxElement.getAttribute('minx') || '0'),
                parseFloat(bboxElement.getAttribute('miny') || '0'),
                parseFloat(bboxElement.getAttribute('maxx') || '0'),
                parseFloat(bboxElement.getAttribute('maxy') || '0'),
            ] : [ -180, -90, 180, 90 ];

            return {
                name: getElementText(layerEl, 'Name'),
                title: getElementText(layerEl, 'Title'),
                abstract: getElementText(layerEl, 'Abstract'),
                supportedCrs: getSupportedCrs(layerEl),
                bbox: bbox,
            };
        }).filter(layer => layer.name && layer.title);

    return {
        url,
        title: getElementText(serviceElement, 'Title'),
        version: xmlDoc.documentElement.getAttribute('version') || '1.3.0',
        layers,
    };
};
