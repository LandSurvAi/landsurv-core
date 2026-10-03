import React, { useEffect } from 'react';
import { CadManagerIcon } from '../icons.tsx';

export const CadManagerContent: React.FC = () => {
    useEffect(() => {
      const schemas = [
        {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'CAD Manager - Description Key Builder',
          description: 'AI-powered tool for creating and managing Civil 3D description key sets, field codes, and survey standards. Build comprehensive F2F (Field-to-Finish) configurations with intelligent code matching.',
          url: 'https://cadmanager.landsurv.ai',
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
            { '@type': 'ListItem', position: 3, name: 'CAD Manager', item: 'https://cadmanager.landsurv.ai' },
          ],
        },
        {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'CAD Manager for Civil 3D',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web Browser',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
          },
          featureList: [
            'AI-generated description key sets',
            'Field code standardization',
            'A/E/C CAD Standard compliant layer naming',
            'Civil 3D MCP integration',
            'Session management with chat history',
            'User-editable spreadsheet with AI protection',
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
            <div className="flex items-center gap-4 p-6 bg-gradient-to-r from-indigo-900/50 to-purple-900/50 rounded-xl border border-indigo-500/30">
                <CadManagerIcon className="w-20 h-20 text-indigo-400 flex-shrink-0" />
                <div>
                    <h3 className="text-3xl font-bold text-indigo-400">CAD Manager</h3>
                    <p className="text-lg text-gray-300 mt-1">AI-Powered Description Key Builder for Civil 3D</p>
                    <p className="text-sm text-gray-400 mt-2">Build comprehensive field code standards in minutes, not days.</p>
                </div>
            </div>

            {/* Introduction */}
            <section>
                <p className="text-gray-300 leading-relaxed">
                    Creating and maintaining Description Key Sets in Civil 3D is one of the most time-consuming tasks for survey managers and CAD technicians. The CAD Manager agent transforms this tedious process into an intelligent, conversational experience. Describe your firm's needs in plain English, and let AI generate a production-ready standards file with 150+ field codes, proper layer assignments, and symbol mappings.
                </p>
            </section>

            {/* Key Features */}
            <section>
                <h4 className="text-xl font-semibold text-gray-100 mb-4">Key Features</h4>
                <ul className="space-y-4">
                    <li className="flex gap-3">
                        <span className="text-indigo-400 text-xl">🤖</span>
                        <div>
                            <strong className="text-gray-100">AI-Powered Standard Generation:</strong>
                            <p className="text-gray-400 mt-1">Describe your project type, layer naming convention, and workflow requirements. The AI generates a comprehensive code table covering control monuments, topographic features, utilities, and infrastructure based on the A/E/C CAD Standard (USACE/DoD).</p>
                        </div>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-indigo-400 text-xl">📊</span>
                        <div>
                            <strong className="text-gray-100">Interactive Spreadsheet Editor:</strong>
                            <p className="text-gray-400 mt-1">Review and edit generated codes in a full-featured spreadsheet interface. Click any cell to edit, use Tab to navigate, and track changes with undo/redo support. Export to CSV or markdown for documentation.</p>
                        </div>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-indigo-400 text-xl">🛡️</span>
                        <div>
                            <strong className="text-gray-100">AI-Protected User Edits:</strong>
                            <p className="text-gray-400 mt-1">Your manual edits are "locked" and protected from AI regeneration. When you refine the standards, the AI respects your customizations while updating everything else—ensuring your expertise is preserved.</p>
                        </div>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-indigo-400 text-xl">💾</span>
                        <div>
                            <strong className="text-gray-100">Session Management:</strong>
                            <p className="text-gray-400 mt-1">Save, load, and manage multiple standards projects. Each session preserves your AI conversation history, making it easy to iterate on designs or maintain different standards for different clients.</p>
                        </div>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-indigo-400 text-xl">🔗</span>
                        <div>
                            <strong className="text-gray-100">Civil 3D Integration via MCP:</strong>
                            <p className="text-gray-400 mt-1">Export directly to Civil 3D through our Model Context Protocol (MCP) plugin. Create layers and Description Key Sets with a single command—no manual XML editing required.</p>
                        </div>
                    </li>
                </ul>
            </section>

            {/* How It Works */}
            <section>
                <h4 className="text-xl font-semibold text-gray-100 mb-4">How It Works</h4>
                <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                        <div className="text-2xl mb-2">1️⃣</div>
                        <h5 className="font-semibold text-gray-200 mb-2">Describe Your Needs</h5>
                        <p className="text-sm text-gray-400">Tell the AI about your firm: project types, naming conventions, preferred layer standards (A/E/C CAD Standard, custom, etc.), and any special requirements.</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                        <div className="text-2xl mb-2">2️⃣</div>
                        <h5 className="font-semibold text-gray-200 mb-2">Review & Customize</h5>
                        <p className="text-sm text-gray-400">The AI generates 150-200+ codes covering all common survey features. Review in the spreadsheet, make edits, and ask the AI to refine specific categories.</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                        <div className="text-2xl mb-2">3️⃣</div>
                        <h5 className="font-semibold text-gray-200 mb-2">Export to Civil 3D</h5>
                        <p className="text-sm text-gray-400">Push layers and Description Key Sets directly to Civil 3D, or download JSON/markdown files for manual import or documentation.</p>
                    </div>
                </div>
            </section>

            {/* Code Categories */}
            <section>
                <h4 className="text-xl font-semibold text-gray-100 mb-4">Comprehensive Code Coverage</h4>
                <p className="text-gray-300 mb-4">The AI generates codes across all standard survey categories:</p>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                        { icon: '📍', name: 'Control & Monuments', desc: 'Benchmarks, CORS, found/set corners' },
                        { icon: '🏠', name: 'Property & Boundary', desc: 'Property lines, ROW, easements, fences' },
                        { icon: '🛣️', name: 'Infrastructure', desc: 'Roads, curbs, sidewalks, parking' },
                        { icon: '💧', name: 'Storm Drainage', desc: 'Inlets, manholes, pipes, ditches' },
                        { icon: '🚰', name: 'Sanitary Sewer', desc: 'Manholes, cleanouts, force mains' },
                        { icon: '💦', name: 'Water System', desc: 'Valves, hydrants, meters, mains' },
                        { icon: '⚡', name: 'Electrical & Comm', desc: 'Poles, transformers, pedestals' },
                        { icon: '🌳', name: 'Vegetation', desc: 'Trees by type/caliper, hedges, planting' },
                        { icon: '🏗️', name: 'Structures', desc: 'Buildings, walls, retaining walls' },
                    ].map((cat, i) => (
                        <div key={i} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                            <span className="text-lg mr-2">{cat.icon}</span>
                            <strong className="text-gray-200">{cat.name}</strong>
                            <p className="text-xs text-gray-500 mt-1">{cat.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Civil 3D Integration */}
            <section>
                <h4 className="text-xl font-semibold text-gray-100 mb-4">Civil 3D MCP Integration</h4>
                <div className="bg-gradient-to-r from-orange-900/30 to-red-900/30 rounded-lg p-5 border border-orange-500/30">
                    <p className="text-gray-300 mb-4">
                        CAD Manager integrates with Civil 3D through our <strong className="text-orange-400">C3DMCP (Model Context Protocol)</strong> plugin. Once connected, you can:
                    </p>
                    <ul className="space-y-2 text-gray-300">
                        <li className="flex items-center gap-2">
                            <span className="text-green-400">✓</span>
                            Create all layers referenced in your standards automatically
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-green-400">✓</span>
                            Generate Description Key Sets in Settings → Point → Description Key Sets
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-green-400">✓</span>
                            Configure Field-to-Finish (F2F) linework codes for automatic line drawing
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-green-400">✓</span>
                            Assign point styles and label styles by code
                        </li>
                    </ul>
                    <p className="text-sm text-gray-400 mt-4">
                        Visit <a href="https://civil3d.landsurv.ai" className="text-blue-400 hover:underline">civil3d.landsurv.ai</a> to download the C3DMCP plugin and get started.
                    </p>
                </div>
            </section>

            {/* Use Cases */}
            <section>
                <h4 className="text-xl font-semibold text-gray-100 mb-4">Perfect For</h4>
                <ul className="list-disc list-inside space-y-2 pl-2 text-gray-300">
                    <li><strong className="text-gray-100">Survey Firms</strong> standardizing field codes across multiple crews and projects</li>
                    <li><strong className="text-gray-100">CAD Managers</strong> building or updating Description Key Sets for new Civil 3D templates</li>
                    <li><strong className="text-gray-100">Project Managers</strong> ensuring consistency between field data collection and final deliverables</li>
                    <li><strong className="text-gray-100">New Survey Companies</strong> establishing professional-grade standards from day one</li>
                    <li><strong className="text-gray-100">DOT & Municipal Projects</strong> requiring compliance with specific naming conventions (NCS, TxDOT, FDOT, etc.)</li>
                </ul>
            </section>

            {/* Getting Started */}
            <section>
                <h4 className="text-xl font-semibold text-gray-100 mb-4">Getting Started</h4>
                <div className="bg-gray-800/50 rounded-lg p-5 border border-gray-700">
                    <ol className="space-y-3 text-gray-300">
                        <li className="flex gap-3">
                            <span className="text-indigo-400 font-bold">1.</span>
                            <span>Navigate to CAD Manager from the LandSurv.ai sidebar</span>
                        </li>
                        <li className="flex gap-3">
                            <span className="text-indigo-400 font-bold">2.</span>
                            <span>Select "Build with AI" tab (default) and describe your firm's requirements</span>
                        </li>
                        <li className="flex gap-3">
                            <span className="text-indigo-400 font-bold">3.</span>
                            <span>Review the generated codes in the spreadsheet editor, make any customizations</span>
                        </li>
                        <li className="flex gap-3">
                            <span className="text-indigo-400 font-bold">4.</span>
                            <span>Save your session for future refinement, or export to Civil 3D</span>
                        </li>
                    </ol>
                    <p className="text-sm text-gray-400 mt-4">
                        <strong>Pro Tip:</strong> Be specific about your layer naming convention (A/E/C CAD Standard, company prefix, annotation suffix) and the types of projects you handle. The AI will customize the entire output accordingly.
                    </p>
                </div>
            </section>

            {/* CTA */}
            <section className="text-center py-6">
                <p className="text-gray-400 mb-4">
                    Stop spending days building Description Key Sets manually. Let AI do the heavy lifting.
                </p>
                <a 
                    href="https://landsurv.ai" 
                    className="inline-block px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl"
                >
                    Launch CAD Manager →
                </a>
            </section>
        </div>
    );
};
