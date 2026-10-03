import React, { useEffect } from 'react';
import { MonitorIcon } from '../icons';

/**
 * SEO landing page for the dedicated `pwa.landsurv.ai` subdomain.
 *
 * This page explains what the LandSurv.ai PWA is, why it is useful for
 * field surveying, and what users get when they install it to their device.
 */
export const PwaLandingContent: React.FC = () => {
  useEffect(() => {
    const schemas = [
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'LandSurv.ai Progressive Web App',
        description: 'Install LandSurv.ai as a PWA for faster launch, offline-ready field workflows, home screen access, and update notifications.',
        url: 'https://pwa.landsurv.ai',
        image: 'https://landsurv.ai/favicon-512.png',
        brand: { '@type': 'Brand', name: 'LandSurv.ai' },
        manufacturer: { '@type': 'Organization', name: 'LandSurv.ai', url: 'https://landsurv.ai' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'LandSurv.ai', item: 'https://landsurv.ai' },
          { '@type': 'ListItem', position: 2, name: 'PWA', item: 'https://pwa.landsurv.ai' },
        ],
      },
    ];

    schemas.forEach((schema) => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    });

    return () => {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      scripts.forEach((script) => {
        const text = script.textContent || '';
        if (text.includes('pwa.landsurv.ai') || text.includes('LandSurv.ai Progressive Web App')) {
          script.parentNode?.removeChild(script);
        }
      });
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
        <MonitorIcon className="w-16 h-16 text-cyan-400 flex-shrink-0" />
        <div>
          <h3 className="text-2xl font-bold text-cyan-400">LandSurv.ai PWA</h3>
          <p className="text-gray-300">Install the surveying toolkit for fast launch, offline support, and app-like access.</p>
        </div>
      </div>

      <div className="p-4 bg-cyan-900/20 border border-cyan-700/50 rounded-lg">
        <h4 className="text-base font-semibold text-cyan-300 mb-1">Install LandSurv.ai as an app</h4>
        <p className="text-gray-300">
          The LandSurv.ai Progressive Web App gives surveyors an app-like experience without the app store.
          Install it to your home screen or taskbar, work in its own window, and get faster access to the
          same tools you already use in the browser.
        </p>
      </div>

      <p>
        Designed for field crews and office teams, the LandSurv.ai PWA keeps your tools close at hand and
        helps you stay productive when connectivity is limited. It is built to launch quickly, preserve work
        offline when possible, and re-sync changes once you are back online.
      </p>

      <ul className="list-disc list-inside space-y-2 pl-2 text-gray-300">
        <li><strong className="text-gray-100">App-like install:</strong> Add LandSurv.ai to your home screen or taskbar for one-click access.</li>
        <li><strong className="text-gray-100">Offline-ready workflows:</strong> Continue working with cached tools and queued requests when the signal drops.</li>
        <li><strong className="text-gray-100">Faster launch:</strong> Open in its own window with a cleaner, focused experience than a normal tab.</li>
        <li><strong className="text-gray-100">Update prompts:</strong> Get notified when a newer version is ready so you can refresh without losing your place.</li>
        <li><strong className="text-gray-100">Works across platforms:</strong> Android, iPhone, Windows, macOS, and Linux all get tailored install guidance.</li>
      </ul>

      <p>
        If you are looking for the fastest way to use LandSurv.ai on a daily basis, this is it: install the PWA,
        keep the browser closed, and return to your survey workflows from a single icon.
      </p>
    </div>
  );
};
