import React, { useEffect } from 'react';
import { CivilDrafterIcon } from '../icons.tsx';

export const CivilDrafterContent: React.FC = () => {
    useEffect(() => {
      const schemas = [
        {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'Civil Drafter Agent',
          description: 'AI-powered drafting assistant for creating and editing Civil 3D drawings. Generate legal descriptions, annotate plans, and streamline your CAD workflow with intelligent automation.',
          url: 'https://civildrafter.landsurv.ai',
          image: 'https://landsurv.ai/favicon-512.png',
          brand: { '@type': 'Brand', name: 'LandSurv.ai' },
          manufacturer: { '@type': 'Organization', name: 'LandSurv.ai', url: 'https://landsurv.ai' },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'LandSurv.ai', item: 'https://landsurv.ai' },
            { '@type': 'ListItem', position: 2, name: 'Agents', item: 'https://landsurv.ai?page=agents' },
            { '@type': 'ListItem', position: 3, name: 'Civil Drafter Agent', item: 'https://civildrafter.landsurv.ai' },
          ],
        },
        {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'Civil Drafter for LandSurv.ai',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web Browser',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
          },
          featureList: [
            'AI-powered legal description generation',
            'Automated metes and bounds plotting',
            'Intelligent plan annotation',
            'Civil 3D MCP integration',
            'Natural language drafting commands',
            'Real-time drawing preview',
          ],
        },
      ];
      schemas.forEach((schema) => {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(schema);
        document.head.appendChild(script);
      });
    }, []);
    
    return (
        <div className="space-y-6">
            {/* Hero Section */}
            <div className="flex items-center gap-4 p-6 bg-gradient-to-r from-fuchsia-900/50 to-purple-900/50 rounded-xl border border-fuchsia-500/30">
                <CivilDrafterIcon className="w-20 h-20 text-fuchsia-400 flex-shrink-0" />
                <div>
                    <h3 className="text-3xl font-bold text-fuchsia-400">Civil Drafter</h3>
                    <p className="text-lg text-gray-300 mt-1">AI-Powered Drafting Assistant for Land Surveyors</p>
                    <p className="text-sm text-gray-400 mt-2">Transform natural language into professional CAD drawings and legal descriptions.</p>
                </div>
            </div>

            {/* Introduction */}
            <section>
                <p className="text-gray-300 leading-relaxed">
                    The Civil Drafter agent brings the power of AI to your CAD workflow. Whether you're creating metes and bounds descriptions, annotating survey plats, or drafting boundary surveys, this intelligent assistant understands surveying terminology and can generate production-ready output from natural language instructions. Connect to Civil 3D via the MCP protocol for seamless integration with your existing workflow.
                </p>
            </section>

            {/* Key Features */}
            <section>
                <h4 className="text-xl font-semibold text-gray-100 mb-4">Key Features</h4>
                <ul className="space-y-4">
                    <li className="flex gap-3">
                        <span className="text-fuchsia-400 text-xl">📝</span>
                        <div>
                            <strong className="text-gray-100">Legal Description Generation</strong>
                            <p className="text-gray-400 text-sm">Generate metes and bounds descriptions from coordinates, parcels, or uploaded plans. The AI understands surveying conventions and formats output according to your jurisdiction's standards.</p>
                        </div>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-fuchsia-400 text-xl">🎯</span>
                        <div>
                            <strong className="text-gray-100">Coordinate Plotting</strong>
                            <p className="text-gray-400 text-sm">Plot boundary lines, easements, and right-of-way from legal descriptions. Simply paste a metes and bounds description and watch it appear on the canvas with accurate geometry.</p>
                        </div>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-fuchsia-400 text-xl">🏗️</span>
                        <div>
                            <strong className="text-gray-100">Civil 3D Integration</strong>
                            <p className="text-gray-400 text-sm">Direct connection to Autodesk Civil 3D via MCP protocol. Push coordinates, lines, and annotations directly to your active drawing without file exports.</p>
                        </div>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-fuchsia-400 text-xl">✏️</span>
                        <div>
                            <strong className="text-gray-100">Intelligent Annotation</strong>
                            <p className="text-gray-400 text-sm">Auto-generate labels, dimensions, and callouts for survey plats. The AI positions annotations optimally and follows industry standards for readability.</p>
                        </div>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-fuchsia-400 text-xl">💬</span>
                        <div>
                            <strong className="text-gray-100">Natural Language Commands</strong>
                            <p className="text-gray-400 text-sm">Describe what you want in plain English: "Draw a boundary starting at point 1 with bearings N45°30'15"E for 125.50 feet..." The agent interprets and executes your intent.</p>
                        </div>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-fuchsia-400 text-xl">📊</span>
                        <div>
                            <strong className="text-gray-100">Closure Analysis</strong>
                            <p className="text-gray-400 text-sm">Calculate closure ratios, identify misclosures, and suggest corrections for boundary traverse data. Essential for quality control in boundary surveys.</p>
                        </div>
                    </li>
                </ul>
            </section>

            {/* Use Cases */}
            <section>
                <h4 className="text-xl font-semibold text-gray-100 mb-4">Common Use Cases</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                        <h5 className="font-semibold text-fuchsia-400 mb-2">Boundary Surveys</h5>
                        <p className="text-sm text-gray-400">Create complete boundary survey plats from field data and recorded deeds. Generate legal descriptions that match your state's requirements.</p>
                    </div>
                    <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                        <h5 className="font-semibold text-fuchsia-400 mb-2">ALTA/NSPS Surveys</h5>
                        <p className="text-sm text-gray-400">Draft Table A items, easement schedules, and exception notes with AI assistance. Ensure compliance with current ALTA standards.</p>
                    </div>
                    <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                        <h5 className="font-semibold text-fuchsia-400 mb-2">Subdivision Platting</h5>
                        <p className="text-sm text-gray-400">Generate lot descriptions, calculate acreages, and create lot tables for subdivision plats. Streamline the tedious parts of plat preparation.</p>
                    </div>
                    <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                        <h5 className="font-semibold text-fuchsia-400 mb-2">Deed Preparation</h5>
                        <p className="text-sm text-gray-400">Draft warranty deed exhibits, easement descriptions, and dedication language with proper legal formatting and terminology.</p>
                    </div>
                </div>
            </section>

            {/* Getting Started */}
            <section>
                <h4 className="text-xl font-semibold text-gray-100 mb-4">Getting Started</h4>
                <ol className="space-y-3 text-gray-300">
                    <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-fuchsia-500/30 text-fuchsia-400 text-sm flex items-center justify-center font-bold">1</span>
                        <span>Select the Civil Drafter agent from the main menu</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-fuchsia-500/30 text-fuchsia-400 text-sm flex items-center justify-center font-bold">2</span>
                        <span>Optionally connect to Civil 3D via the C3D button for direct drawing integration</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-fuchsia-500/30 text-fuchsia-400 text-sm flex items-center justify-center font-bold">3</span>
                        <span>Describe your drafting task in natural language or paste data to process</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-fuchsia-500/30 text-fuchsia-400 text-sm flex items-center justify-center font-bold">4</span>
                        <span>Review the generated output on the canvas and refine with follow-up instructions</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-fuchsia-500/30 text-fuchsia-400 text-sm flex items-center justify-center font-bold">5</span>
                        <span>Export to DXF, push to Civil 3D, or save your session for later</span>
                    </li>
                </ol>
            </section>

            {/* Technical Note */}
            <section className="p-4 bg-fuchsia-900/20 rounded-lg border border-fuchsia-500/20">
                <h4 className="text-lg font-semibold text-fuchsia-400 mb-2">Civil 3D MCP Integration</h4>
                <p className="text-gray-300 text-sm">
                    For the best experience, connect LandSurv.ai to your Civil 3D installation using the Model Context Protocol (MCP). This enables real-time bidirectional communication—send coordinates and linework directly to Civil 3D, or import existing drawing data for AI analysis. Visit <a href="https://civil3d.landsurv.ai" className="text-fuchsia-400 hover:underline">civil3d.landsurv.ai</a> to download the connector and learn more.
                </p>
            </section>
        </div>
    );
};
