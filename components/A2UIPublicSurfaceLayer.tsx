import React from 'react';
import { A2UISurfaceHost } from './A2UISurfaceHost.tsx';
import { A2UICacpManifestExplorer } from './A2UICacpManifestExplorer.tsx';
import { A2UIPageAssistant } from './A2UIPageAssistant.tsx';
import type { A2UISurfaceDefinition } from '../services/a2uiSurfaces.ts';

function readSubdomain(): string {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.search);
    const override = params.get('subdomain');
    if (override) return override.toLowerCase();
    const hostname = window.location.hostname.toLowerCase();
    const parts = hostname.split('.');
    if (parts.length > 2) return parts[0];
    return '';
  } catch {
    return '';
  }
}

/**
 * Mounts the A2UI surface layer on every public subdomain page.
 *
 * App wraps both the full-page subdomain components and the content-wrapper
 * subdomains with this layer, so CACP inspection and page guidance are one
 * click away everywhere without duplicating shell code.
 */
export const A2UIPublicSurfaceLayer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const subdomain = readSubdomain();

  const renderSurface = (definition: A2UISurfaceDefinition): React.ReactNode | null => {
    switch (definition.id) {
      case 'page-guide':
        return <A2UIPageAssistant subdomain={subdomain} />;
      case 'cacp-inspector':
        // The inspector is protocol-specific even when opened from another subdomain.
        return <A2UIPageAssistant subdomain="cacp" />;
      case 'cacp-manifests':
        return <A2UICacpManifestExplorer />;
      default:
        return null;
    }
  };

  return (
    <>
      {children}
      {/* Latent host: public pages construct surfaces in place when a page
          interaction calls for one; there is no catalog or launcher. */}
      <A2UISurfaceHost
        audience="public"
        renderSurface={renderSurface}
        defaultSize="standard"
      />
    </>
  );
};

export default A2UIPublicSurfaceLayer;
