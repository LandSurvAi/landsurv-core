/**
 * SEO Structured Data Generation Utility
 * Generates JSON-LD markup for rich results and search engine optimization
 */

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

/**
 * Generate Organization structured data (for main app)
 */
export const generateOrganizationSchema = () => {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'LandSurv.ai',
    description: 'AI-powered toolkit for surveying and civil engineering tasks',
    url: 'https://landsurv.ai',
    logo: 'https://landsurv.ai/favicon-512.png',
    sameAs: [
      'https://github.com/msersen/LandSurv.ai-Refactored',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Support',
      url: 'https://landsurv.ai',
    },
  };
};

/**
 * Generate SoftwareApplication structured data
 */
export const generateSoftwareApplicationSchema = (title: string, description: string, url: string) => {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: title,
    description: description,
    url: url,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };
};

/**
 * Generate Product structured data for agent landing pages
 */
export const generateProductSchema = (
  name: string,
  description: string,
  url: string,
  imageUrl?: string
) => {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: name,
    description: description,
    url: url,
    image: imageUrl || 'https://landsurv.ai/favicon-512.png',
    brand: {
      '@type': 'Brand',
      name: 'LandSurv.ai',
    },
    manufacturer: {
      '@type': 'Organization',
      name: 'LandSurv.ai',
    },
  };
};

/**
 * Generate BreadcrumbList structured data
 */
export const generateBreadcrumbSchema = (items: BreadcrumbItem[]) => {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
};

/**
 * Generate FAQPage structured data
 */
export const generateFAQSchema = (faqs: FAQItem[]) => {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
};

/**
 * Generate WebPage structured data
 */
export const generateWebPageSchema = (
  title: string,
  description: string,
  url: string,
  imageUrl?: string
) => {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description: description,
    url: url,
    image: imageUrl || 'https://landsurv.ai/favicon-512.png',
    publisher: {
      '@type': 'Organization',
      name: 'LandSurv.ai',
      logo: {
        '@type': 'ImageObject',
        url: 'https://landsurv.ai/favicon-512.png',
      },
    },
  };
};

/**
 * Generate Article structured data
 */
export const generateArticleSchema = (
  title: string,
  description: string,
  url: string,
  imageUrl?: string,
  datePublished?: string
) => {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: description,
    url: url,
    image: imageUrl || 'https://landsurv.ai/favicon-512.png',
    author: {
      '@type': 'Organization',
      name: 'LandSurv.ai',
    },
    publisher: {
      '@type': 'Organization',
      name: 'LandSurv.ai',
      logo: {
        '@type': 'ImageObject',
        url: 'https://landsurv.ai/favicon-512.png',
      },
    },
    datePublished: datePublished || new Date().toISOString().split('T')[0],
  };
};

/**
 * Inject structured data into HTML head
 */
export const injectStructuredData = (schema: Record<string, any>) => {
  if (typeof window === 'undefined') return;
  
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
};

/**
 * Generate SEO meta tags object
 */
export const generateSEOMetaTags = (
  title: string,
  description: string,
  url: string,
  imageUrl?: string
) => {
  return {
    title,
    description,
    url,
    imageUrl: imageUrl || 'https://landsurv.ai/favicon-512.png',
    keywords: 'surveying, civil engineering, AI, geospatial, surveyor tools',
  };
};
