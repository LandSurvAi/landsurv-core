/**
 * Factory for creating agent landing page components with SEO
 * Simplifies adding structured data to all agent pages
 */

export interface AgentMetadata {
  name: string;
  title: string;
  description: string;
  shortDescription: string;
  url: string;
}

export const createAgentSEOSchema = (metadata: AgentMetadata) => {
  return {
    product: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: metadata.name,
      description: metadata.description,
      url: metadata.url,
      image: 'https://landsurv.ai/favicon-512.png',
      brand: { '@type': 'Brand', name: 'LandSurv.ai' },
      manufacturer: { '@type': 'Organization', name: 'LandSurv.ai', url: 'https://landsurv.ai' },
    },
    breadcrumb: {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'LandSurv.ai', item: 'https://landsurv.ai' },
        { '@type': 'ListItem', position: 2, name: 'Agents', item: 'https://landsurv.ai?page=agents' },
        { '@type': 'ListItem', position: 3, name: metadata.name, item: metadata.url },
      ],
    },
  };
};

/**
 * Hook to inject agent SEO schemas
 */
export const useAgentSEO = (metadata: AgentMetadata) => {
  const { product, breadcrumb } = createAgentSEOSchema(metadata);

  const script1 = document.createElement('script');
  script1.type = 'application/ld+json';
  script1.textContent = JSON.stringify(product);
  document.head.appendChild(script1);

  const script2 = document.createElement('script');
  script2.type = 'application/ld+json';
  script2.textContent = JSON.stringify(breadcrumb);
  document.head.appendChild(script2);

  return () => {
    if (script1.parentNode) script1.parentNode.removeChild(script1);
    if (script2.parentNode) script2.parentNode.removeChild(script2);
  };
};
