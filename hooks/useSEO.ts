import { useEffect } from 'react';

/**
 * Hook to inject structured data (JSON-LD) into the document head
 */
export const useSEOStructuredData = (schema: Record<string, any>) => {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Create script element
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(schema);
    
    // Add to head
    document.head.appendChild(script);

    // Cleanup on unmount
    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [schema]);
};

/**
 * Hook to update meta tags dynamically
 */
export const useSEOMetaTags = (title: string, description: string, image?: string) => {
  useEffect(() => {
    // Update title
    document.title = title;

    // Update or create meta tags
    const updateMetaTag = (property: string, content: string, isProperty: boolean = false) => {
      let tag = document.querySelector(`meta[${isProperty ? 'property' : 'name'}="${property}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(isProperty ? 'property' : 'name', property);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    };

    // Update common meta tags
    updateMetaTag('description', description);
    updateMetaTag('og:title', title, true);
    updateMetaTag('og:description', description, true);
    
    if (image) {
      updateMetaTag('og:image', image, true);
    }
  }, [title, description, image]);
};
