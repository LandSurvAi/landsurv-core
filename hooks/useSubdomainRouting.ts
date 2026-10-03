import { useEffect } from 'react';

/**
 * Custom hook for handling initial routing based on subdomain.
 * CRITICAL: Determines whether to show main app, landing page, or XML sitemap.
 * 
 * @param setPageMode - Function to set the page mode ('app', 'landing', or 'xml_sitemap')
 * @param setLandingContent - Function to set the landing page configuration
 * @param landingPageConfig - Configuration mapping subdomains to landing page configs
 */
export function useSubdomainRouting(
  setPageMode: (mode: 'app' | 'landing' | 'xml_sitemap') => void,
  setLandingContent: (config: any) => void,
  landingPageConfig: Record<string, any>
) {
  useEffect(() => {
    if (window.location.pathname === '/sitemap' || window.location.pathname === '/sitemap.xml') {
      setPageMode('xml_sitemap');
      return;
    }

    const hostname = window.location.hostname.toLowerCase();
    const subdomain = hostname.split('.')[0];
    const config = landingPageConfig[subdomain as keyof typeof landingPageConfig];

    if (config) {
      setPageMode('landing');
      setLandingContent(config);
    } else {
      setPageMode('app');
    }
  }, [setPageMode, setLandingContent, landingPageConfig]);
}
