import React from 'react';
import { MapPin, Gavel, Search, Building2, Ruler, Home, AlertCircle, CheckCircle2, FileText, ArrowRight } from 'lucide-react';

export const ZoningPageContent: React.FC = () => {
  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="relative">
            <MapPin className="w-8 h-8 text-cyan-400" />
            <Gavel className="w-4 h-4 text-yellow-400 absolute -right-1 -bottom-1" />
          </div>
          <h2 className="text-3xl font-bold text-cyan-400">Zoning Agent</h2>
        </div>
        <p className="text-xl text-gray-300 mb-4">
          AI-powered zoning research and municipal code analysis for land development projects.
        </p>
        <p className="text-gray-400">
          The Zoning Agent helps surveyors, engineers, and developers quickly research zoning regulations 
          for any property address. Using advanced web search and document analysis, it identifies zoning 
          districts, extracts key requirements, and answers specific questions about local ordinances.
        </p>
      </section>

      <section>
        <h3 className="text-2xl font-bold text-indigo-300 mb-4">How It Works</h3>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 space-y-4">
          <div className="flex gap-4">
            <Search className="w-6 h-6 text-cyan-400 flex-shrink-0 mt-1" />
            <div>
              <h4 className="font-semibold text-gray-100 mb-1">1. Address-Based Search</h4>
              <p className="text-gray-400">Enter any property address and the AI searches for the relevant municipality and its zoning resources</p>
            </div>
          </div>
          <div className="flex gap-4">
            <MapPin className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
            <div>
              <h4 className="font-semibold text-gray-100 mb-1">2. District Identification</h4>
              <p className="text-gray-400">Locates official zoning maps and identifies the specific zoning district for your property</p>
            </div>
          </div>
          <div className="flex gap-4">
            <FileText className="w-6 h-6 text-blue-400 flex-shrink-0 mt-1" />
            <div>
              <h4 className="font-semibold text-gray-100 mb-1">3. Code Extraction</h4>
              <p className="text-gray-400">Analyzes municipal zoning ordinances to extract relevant requirements and regulations</p>
            </div>
          </div>
          <div className="flex gap-4">
            <Gavel className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-1" />
            <div>
              <h4 className="font-semibold text-gray-100 mb-1">4. Interactive Q&A</h4>
              <p className="text-gray-400">Ask specific questions about setbacks, heights, uses, and other zoning requirements</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-2xl font-bold text-purple-300 mb-4">Zoning Information Provided</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <Ruler className="w-5 h-5 text-cyan-400" />
              <h4 className="font-semibold text-cyan-300">Dimensional Requirements</h4>
            </div>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>• Front, side, and rear setbacks</li>
              <li>• Minimum lot size and dimensions</li>
              <li>• Maximum building height</li>
              <li>• Lot coverage percentages</li>
              <li>• Floor area ratio (FAR)</li>
            </ul>
          </div>

          <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-5 h-5 text-purple-400" />
              <h4 className="font-semibold text-purple-300">Use Regulations</h4>
            </div>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>• Permitted uses by right</li>
              <li>• Conditional/special uses</li>
              <li>• Prohibited uses</li>
              <li>• Home occupation rules</li>
              <li>• Accessory structure regulations</li>
            </ul>
          </div>

          <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <Home className="w-5 h-5 text-green-400" />
              <h4 className="font-semibold text-green-300">Density & Parking</h4>
            </div>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>• Dwelling units per acre</li>
              <li>• Parking space requirements</li>
              <li>• Loading zone specifications</li>
              <li>• Driveway setbacks</li>
              <li>• Landscape buffer requirements</li>
            </ul>
          </div>

          <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-yellow-400" />
              <h4 className="font-semibold text-yellow-300">Special Districts</h4>
            </div>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>• Overlay district requirements</li>
              <li>• Historic district rules</li>
              <li>• Flood plain restrictions</li>
              <li>• Environmental protection areas</li>
              <li>• Planned development criteria</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-2xl font-bold text-green-300 mb-4">Common Use Cases</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3 bg-gray-800/30 border border-gray-700/50 rounded-lg p-4">
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-gray-200 mb-1">Pre-Purchase Due Diligence</h4>
              <p className="text-sm text-gray-400">Research zoning before buying property to understand development potential and restrictions</p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-gray-800/30 border border-gray-700/50 rounded-lg p-4">
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-gray-200 mb-1">Site Plan Preparation</h4>
              <p className="text-sm text-gray-400">Quickly gather setback and dimensional requirements for survey and engineering drawings</p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-gray-800/30 border border-gray-700/50 rounded-lg p-4">
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-gray-200 mb-1">Variance Analysis</h4>
              <p className="text-sm text-gray-400">Identify which requirements may need variances or special exceptions for your project</p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-gray-800/30 border border-gray-700/50 rounded-lg p-4">
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-gray-200 mb-1">Client Consultations</h4>
              <p className="text-sm text-gray-400">Provide preliminary zoning guidance to clients during initial project discussions</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-yellow-900/20 border-2 border-yellow-600/50 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-1" />
          <div>
            <h3 className="text-xl font-bold text-yellow-300 mb-2">Professional Review Required</h3>
            <p className="text-gray-300 mb-3">
              The Zoning Agent provides preliminary research and should not be considered official zoning advice. 
              All AI-generated information must be verified with official municipal sources.
            </p>
            <div className="space-y-2 text-sm text-gray-400">
              <p>✓ Always confirm zoning districts with official municipal maps</p>
              <p>✓ Verify all requirements with the local zoning ordinance</p>
              <p>✓ Contact the zoning office for official interpretations</p>
              <p>✓ Check for recent zoning amendments or pending changes</p>
              <p>✓ Consider hiring a zoning attorney for complex projects</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-2xl font-bold text-cyan-300 mb-4">Getting Started</h3>
        <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <ArrowRight className="w-6 h-6 text-cyan-400" />
            <h4 className="text-lg font-semibold text-gray-100">Quick Start Guide</h4>
          </div>
          <ol className="space-y-3 text-gray-300">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-sm font-bold">1</span>
              <span>Navigate to the Zoning Agent in LandSurv.ai</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-sm font-bold">2</span>
              <span>Enter the complete property address (street, city, state, ZIP)</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-sm font-bold">3</span>
              <span>Review the identified zoning district and extracted requirements</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-sm font-bold">4</span>
              <span>Ask specific questions in the chat about regulations that apply to your project</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-sm font-bold">5</span>
              <span>Verify all information with official municipal sources before proceeding</span>
            </li>
          </ol>
        </div>
      </section>

      <section>
        <h3 className="text-2xl font-bold text-indigo-300 mb-4">Frequently Asked Questions</h3>
        <div className="space-y-4">
          <details className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 cursor-pointer">
            <summary className="font-semibold text-gray-200">How accurate is the AI-generated zoning information?</summary>
            <p className="text-gray-400 mt-2 text-sm">
              The Zoning Agent uses web search to find current zoning resources, but accuracy depends on the quality 
              and availability of online information. Always verify with official municipal sources. The AI is best 
              used for preliminary research and understanding general requirements.
            </p>
          </details>
          <details className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 cursor-pointer">
            <summary className="font-semibold text-gray-200">Can this replace consultation with a zoning officer?</summary>
            <p className="text-gray-400 mt-2 text-sm">
              No. The Zoning Agent is a research tool, not a substitute for official zoning determinations. Municipal 
              zoning officers have authority to interpret codes and make official rulings. Use this tool to prepare 
              for those conversations, not replace them.
            </p>
          </details>
          <details className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 cursor-pointer">
            <summary className="font-semibold text-gray-200">What if my municipality's zoning information isn't online?</summary>
            <p className="text-gray-400 mt-2 text-sm">
              Some smaller municipalities may have limited online presence. In these cases, the AI will inform you 
              that information couldn't be found and recommend contacting the municipal office directly. You may need 
              to visit or call the township/borough office for paper records.
            </p>
          </details>
          <details className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 cursor-pointer">
            <summary className="font-semibold text-gray-200">Does this work for all states and municipalities?</summary>
            <p className="text-gray-400 mt-2 text-sm">
              The tool works nationwide but effectiveness varies by jurisdiction. Areas with comprehensive online zoning 
              resources will yield better results. The AI will adapt its search strategy based on what information is 
              available for your specific location.
            </p>
          </details>
        </div>
      </section>
    </div>
  );
};
