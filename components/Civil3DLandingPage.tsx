import React from 'react';
import { Download, CheckCircle, Shield, Zap, Code, CloudIcon, UserIcon, ChevronLeft, Sparkles, Rocket, BookOpen, Settings, BarChart3, Map } from 'lucide-react';

export const Civil3DLandingPage: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  // Handle "Back to App" navigation for both modal and direct URL access
  const handleBackToApp = () => {
    if (onClose) {
      onClose();
    } else {
      // If no onClose callback (direct URL access), redirect to root domain
      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        const parts = hostname.split('.');
        
        if (hostname !== 'localhost' && parts.length > 2) {
          const rootDomain = parts.slice(1).join('.');
          const rootUrl = `${window.location.protocol}//${rootDomain}${window.location.port ? ':' + window.location.port : ''}/`;
          window.location.href = rootUrl;
        } else {
          window.history.back();
        }
      }
    }
  };

  // Color hex mapping for agent-like cards
  const colorHexMap: { [key: string]: string } = {
    'cyan': '#22d3ee',      // cyan-400
    'green': '#34d399',     // green-400
    'orange': '#fb923c',    // orange-400
    'indigo': '#818cf8',    // indigo-400
    'teal': '#2dd4bf',      // teal-400
    'purple': '#c084fc',    // purple-400
    'yellow': '#facc15',    // yellow-400
    'blue': '#60a5fa',      // blue-400
    'amber': '#f59e0b',     // amber-500
    'sky': '#38bdf8',       // sky-400
    'lime': '#84cc16',      // lime-400
    'violet': '#a78bfa',    // violet-400
    'red': '#f87171',       // red-400
    'rose': '#fb7185',      // rose-400
    'emerald': '#34d399'    // emerald-400
  };

  // Feature cards with random colors like agent selection
  const features = [
    { title: 'AI Automation', description: 'Execute commands in natural language', color: 'cyan', icon: Sparkles },
    { title: 'Real-time Sync', description: 'Seamless data synchronization with Cloud', color: 'green', icon: Rocket },
    { title: 'Smart Analysis', description: 'AI-powered surveying intelligence', color: 'orange', icon: BarChart3 },
    { title: 'Easy Setup', description: 'One-click installation and authentication', color: 'violet', icon: Settings },
    { title: 'Full Integration', description: 'Works within Civil 3D interface', color: 'amber', icon: Map },
    { title: 'Continuous Updates', description: 'Always access to latest AI models', color: 'teal', icon: Zap },
  ];

  // Step cards - first one is the download
  const steps = [
    { step: 'Download', isDownload: true, color: 'cyan' },
    { step: '2', title: 'Install & Launch', description: 'Run the MSI installer and launch Civil 3D', color: 'emerald' },
    { step: '3', title: 'Get Session Token', description: 'Generate a token on the download page to connect Civil 3D', color: 'indigo' },
  ];

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950 text-gray-100 overflow-y-auto">
      {/* Header/Navigation */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.08] bg-gray-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button 
              onClick={handleBackToApp} 
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-cyan-400 transition"
            >
              <ChevronLeft size={18} />
              Back to App
            </button>
            <div className="h-4 w-px bg-gray-700"></div>
            <div className="flex items-center text-lg font-bold">
              Land<span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span>
            </div>
            <div className="h-4 w-px bg-gray-700"></div>
            <span className="text-sm font-semibold text-cyan-400">Connector</span>
          </div>
        </div>
      </nav>

        {/* Hero Section */}
        <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
          <div className="mb-16 rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/50 via-gray-900/80 to-emerald-950/35 p-6 text-center shadow-2xl shadow-cyan-950/20 md:p-10">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Land<span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span> Connector for Civil 3D
            </h1>
            <p className="text-xl text-gray-400 mb-4">
              Bring AI superpowered capabilities into Autodesk Civil 3D.
            </p>
            <p className="text-lg text-gray-500 mb-8 max-w-3xl mx-auto">
              <strong>LandsurvConnector</strong> is a thin client that connects Civil 3D to the LandSurv.ai Cloud Brain backend. Execute natural language commands to automate drawing creation, analyze survey data, and leverage AI-powered intelligence without leaving Civil 3D.
            </p>
          </div>

          {/* Quick Start - Step Cards (like agents) - First is Download */}
          <div className="mb-16">
            <h2 className="text-2xl font-bold mb-8 text-center">Quick Start</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {steps.map((step: any, idx) => {
                const color = colorHexMap[step.color];
                
                // Download card (first step)
                if (step.isDownload) {
                  const handleDownloadClick = () => {
                    const hostname = window.location.hostname;
                    const protocol = window.location.protocol;
                    const port = window.location.port ? ':' + window.location.port : '';
                    
                    // For localhost, use connector-download.localhost
                    // For production domains, use connector-download.{domain}
                    let downloadUrl;
                    if (hostname === 'localhost' || hostname === '127.0.0.1') {
                      downloadUrl = `${protocol}//connector-download.${hostname}${port}`;
                    } else {
                      // For production, get the main domain (last 2 parts)
                      const domainParts = hostname.split('.');
                      const mainDomain = domainParts.slice(-2).join('.');
                      downloadUrl = `${protocol}//connector-download.${mainDomain}${port}`;
                    }
                    window.location.href = downloadUrl;
                  };
                  
                  return (
                    <button
                      key={idx}
                      onClick={handleDownloadClick}
                      className="p-6 bg-gray-900/50 rounded-lg transition-all duration-300 border-2 hover:scale-105 cursor-pointer flex flex-col h-full items-center justify-center gap-3"
                      style={{
                        borderColor: color + '33',
                        boxShadow: `0 0 20px ${color}22`
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = color + '88';
                        e.currentTarget.style.backgroundColor = '#1f2937';
                        e.currentTarget.style.boxShadow = `0 0 20px ${color}44`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = color + '33';
                        e.currentTarget.style.backgroundColor = 'rgba(17, 24, 39, 0.5)';
                        e.currentTarget.style.boxShadow = `0 0 20px ${color}22`;
                      }}
                    >
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4" style={{ backgroundColor: color + '22', border: `2px solid ${color}` }}>
                        <span className="font-bold text-lg" style={{ color }}>1</span>
                      </div>
                      <div className="text-center">
                        <h3 className="text-lg font-bold text-cyan-400 mb-2">Download LandsurvConnector</h3>
                        <p className="text-gray-400 text-sm mb-3">Click to get started</p>
                        <div className="flex justify-center animate-bounce">
                          <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                          </svg>
                        </div>
                      </div>
                    </button>
                  );
                }

                // Regular step cards
                return (
                  <div
                    key={idx}
                    className="p-6 bg-gray-900/50 rounded-lg transition-all duration-300 border-2 border-gray-700 hover:border-opacity-100 flex flex-col h-full items-center text-center"
                    style={{
                      borderColor: color + '33',
                      boxShadow: `0 0 20px ${color}22`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = color + '88';
                      e.currentTarget.style.backgroundColor = '#1f2937';
                      e.currentTarget.style.boxShadow = `0 0 20px ${color}44`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = color + '33';
                      e.currentTarget.style.backgroundColor = 'rgba(17, 24, 39, 0.5)';
                      e.currentTarget.style.boxShadow = `0 0 20px ${color}22`;
                    }}
                  >
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4" style={{ backgroundColor: color + '22', border: `2px solid ${color}` }}>
                      <span className="font-bold text-lg" style={{ color }}>{step.step}</span>
                    </div>
                    <h3 className="font-bold text-lg mb-2" style={{ color }}>
                      {step.title}
                    </h3>
                    <p className="text-sm text-gray-400 flex-grow">{step.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Feature Grid - Colorful Cards like Agents */}
          <div className="mb-16">
            <h2 className="text-2xl font-bold mb-8 text-center">Core Features</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {features.map((feature, idx) => {
                const Icon = feature.icon;
                const color = colorHexMap[feature.color];
                return (
                  <div
                    key={idx}
                    className="p-6 bg-gray-900/50 rounded-lg transition-all duration-300 border-2 border-gray-700 hover:border-opacity-100 flex flex-col h-full"
                    style={{
                      borderColor: color + '33',
                      boxShadow: `0 0 20px ${color}22`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = color + '88';
                      e.currentTarget.style.backgroundColor = '#1f2937';
                      e.currentTarget.style.boxShadow = `0 0 20px ${color}44`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = color + '33';
                      e.currentTarget.style.backgroundColor = 'rgba(17, 24, 39, 0.5)';
                      e.currentTarget.style.boxShadow = `0 0 20px ${color}22`;
                    }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <Icon className="w-8 h-8" style={{ color }} />
                      <h3 className="font-bold text-lg" style={{ color }}>
                        {feature.title}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-400 flex-grow">{feature.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* System Requirements - Card Style */}
          <div className="mb-16">
            <h2 className="text-2xl font-bold mb-8 text-center">System Requirements</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div
                className="p-6 bg-gray-900/50 rounded-lg transition-all duration-300 border-2 flex flex-col"
                style={{
                  borderColor: '#34d399' + '33',
                  boxShadow: `0 0 20px #34d39922`
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#34d399' + '88';
                  e.currentTarget.style.backgroundColor = '#1f2937';
                  e.currentTarget.style.boxShadow = `0 0 20px #34d39944`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#34d399' + '33';
                  e.currentTarget.style.backgroundColor = 'rgba(17, 24, 39, 0.5)';
                  e.currentTarget.style.boxShadow = `0 0 20px #34d39922`;
                }}
              >
                <h3 className="font-semibold text-lg mb-4" style={{ color: '#34d399' }}>Minimum</h3>
                <ul className="space-y-2 text-gray-300 text-sm">
                  <li>✓ Windows 10 or Windows Server 2019+</li>
                  <li>✓ Autodesk Civil 3D 2020+</li>
                  <li>✓ .NET Framework 4.8+</li>
                  <li>✓ 2 GB RAM</li>
                  <li>✓ Internet connection</li>
                </ul>
              </div>
              <div
                className="p-6 bg-gray-900/50 rounded-lg transition-all duration-300 border-2 flex flex-col"
                style={{
                  borderColor: '#818cf8' + '33',
                  boxShadow: `0 0 20px #818cf822`
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#818cf8' + '88';
                  e.currentTarget.style.backgroundColor = '#1f2937';
                  e.currentTarget.style.boxShadow = `0 0 20px #818cf844`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#818cf8' + '33';
                  e.currentTarget.style.backgroundColor = 'rgba(17, 24, 39, 0.5)';
                  e.currentTarget.style.boxShadow = `0 0 20px #818cf822`;
                }}
              >
                <h3 className="font-semibold text-lg mb-4" style={{ color: '#818cf8' }}>Recommended</h3>
                <ul className="space-y-2 text-gray-300 text-sm">
                  <li>✓ Windows 11 (latest build)</li>
                  <li>✓ Autodesk Civil 3D 2024+</li>
                  <li>✓ 8 GB+ RAM</li>
                  <li>✓ SSD storage</li>
                  <li>✓ Broadband internet connection</li>
                </ul>
              </div>
            </div>
          </div>

          {/* What Happens After Install - Card Style */}
          <div
            className="mb-16 p-8 bg-gray-900/50 rounded-lg transition-all duration-300 border-2"
            style={{
              borderColor: '#60a5fa' + '33',
              boxShadow: `0 0 20px #60a5fa22`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#60a5fa' + '88';
              e.currentTarget.style.backgroundColor = '#1f2937';
              e.currentTarget.style.boxShadow = `0 0 20px #60a5fa44`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#60a5fa' + '33';
              e.currentTarget.style.backgroundColor = 'rgba(17, 24, 39, 0.5)';
              e.currentTarget.style.boxShadow = `0 0 20px #60a5fa22`;
            }}
          >
            <h2 className="text-2xl font-bold mb-6" style={{ color: '#60a5fa' }}>How to Connect</h2>
            <div className="space-y-4 text-gray-300">
              <div className="flex gap-4 items-start">
                <CheckCircle className="flex-shrink-0 mt-1" size={20} style={{ color: '#22d3ee' }} />
                <div>
                  <strong style={{ color: '#22d3ee' }}>1. Generate Session Token</strong>
                  <p className="text-gray-400 text-sm mt-1">Visit the download page and click "Generate Session Token". Copy the token (format: LSC-XXXXX-XXXXX).</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <CheckCircle className="flex-shrink-0 mt-1" size={20} style={{ color: '#34d399' }} />
                <div>
                  <strong style={{ color: '#34d399' }}>2. Load Plugin in Civil 3D</strong>
                  <p className="text-gray-400 text-sm mt-1">Open Civil 3D, type <code className="bg-gray-800 px-2 py-0.5 rounded text-cyan-400">NETLOAD</code>, and browse to <code className="bg-gray-800 px-2 py-0.5 rounded">C:\Program Files\LandsurvConnector\LandsurvConnector.dll</code></p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <CheckCircle className="flex-shrink-0 mt-1" size={20} style={{ color: '#fb923c' }} />
                <div>
                  <strong style={{ color: '#fb923c' }}>3. Configure Session Token</strong>
                  <p className="text-gray-400 text-sm mt-1">In Civil 3D, type <code className="bg-gray-800 px-2 py-0.5 rounded text-cyan-400">LANDSURVCONFIG</code> and paste your session token when prompted.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <CheckCircle className="flex-shrink-0 mt-1" size={20} style={{ color: '#c084fc' }} />
                <div>
                  <strong style={{ color: '#c084fc' }}>4. Connect & Start</strong>
                  <p className="text-gray-400 text-sm mt-1">Type <code className="bg-gray-800 px-2 py-0.5 rounded text-cyan-400">LANDSURVAI</code> to connect. Your Civil 3D is now linked to the web app's trial timer!</p>
                </div>
              </div>
            </div>
            
            <div className="mt-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
              <h4 className="font-bold text-blue-400 mb-2">💡 About Session Tokens</h4>
              <ul className="text-gray-300 space-y-1 text-sm">
                <li>• Tokens expire after 24 hours - generate a new one when needed</li>
                <li>• Your Civil 3D connection follows the web app trial timer (4 hours on / 4 hours off)</li>
                <li>• To maintain continuous access, enter your own API key in the web app settings</li>
                <li>• Commands: <code className="bg-gray-800 px-1.5 py-0.5 rounded text-cyan-400">LANDSURVAI</code>, <code className="bg-gray-800 px-1.5 py-0.5 rounded text-cyan-400">LANDSURVCONFIG</code>, <code className="bg-gray-800 px-1.5 py-0.5 rounded text-cyan-400">LANDSURVSTATUS</code>, <code className="bg-gray-800 px-1.5 py-0.5 rounded text-cyan-400">LANDSURVDISCONNECT</code></li>
              </ul>
            </div>
          </div>

          {/* Known Limitations - Card Style */}
          <div
            className="mb-16 p-8 bg-gray-900/50 rounded-lg transition-all duration-300 border-2"
            style={{
              borderColor: '#2dd4bf' + '33',
              boxShadow: `0 0 20px #2dd4bf22`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#2dd4bf' + '88';
              e.currentTarget.style.backgroundColor = '#1f2937';
              e.currentTarget.style.boxShadow = `0 0 20px #2dd4bf44`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#2dd4bf' + '33';
              e.currentTarget.style.backgroundColor = 'rgba(17, 24, 39, 0.5)';
              e.currentTarget.style.boxShadow = `0 0 20px #2dd4bf22`;
            }}
          >
            <h2 className="text-2xl font-bold mb-6" style={{ color: '#2dd4bf' }}>Alpha Release Limitations</h2>
            <p className="text-gray-400 mb-4">This is an early alpha release. Some features are still in development:</p>
            <ul className="space-y-3 text-gray-400">
              <li className="flex gap-3">
                <span className="text-yellow-400 flex-shrink-0">⚠</span>
                <span>Single command execution only (batch operations coming soon)</span>
              </li>
              <li className="flex gap-3">
                <span className="text-yellow-400 flex-shrink-0">⚠</span>
                <span>3 core tools available: Point creation, Line drawing, Drawing info queries</span>
              </li>
              <li className="flex gap-3">
                <span className="text-yellow-400 flex-shrink-0">⚠</span>
                <span>Single active drawing context (multi-drawing support in v0.3.0)</span>
              </li>
              <li className="flex gap-3">
                <span className="text-yellow-400 flex-shrink-0">⚠</span>
                <span>May encounter edge cases - please report issues!</span>
              </li>
            </ul>
          </div>

          {/* Roadmap - Card Style */}
          <div
            className="mb-16 p-8 bg-gray-900/50 rounded-lg transition-all duration-300 border-2"
            style={{
              borderColor: '#facc15' + '33',
              boxShadow: `0 0 20px #facc1522`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#facc15' + '88';
              e.currentTarget.style.backgroundColor = '#1f2937';
              e.currentTarget.style.boxShadow = `0 0 20px #facc1544`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#facc15' + '33';
              e.currentTarget.style.backgroundColor = 'rgba(17, 24, 39, 0.5)';
              e.currentTarget.style.boxShadow = `0 0 20px #facc1522`;
            }}
          >
            <h2 className="text-2xl font-bold mb-6" style={{ color: '#facc15' }}>Roadmap</h2>
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2" style={{ color: '#22d3ee' }}>v0.2.0 (Q1 2026)</h3>
                <ul className="text-gray-400 space-y-1 text-sm">
                  <li>• Batch command execution</li>
                  <li>• 30+ additional tools</li>
                  <li>• Surface creation & analysis</li>
                  <li>• Improved error handling</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: '#34d399' }}>v0.3.0 (Q2 2026)</h3>
                <ul className="text-gray-400 space-y-1 text-sm">
                  <li>• Multi-drawing support</li>
                  <li>• Team collaboration features</li>
                  <li>• Audit logging</li>
                  <li>• Performance optimization</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-2" style={{ color: '#fb923c' }}>v1.0.0 (Q3 2026)</h3>
                <ul className="text-gray-400 space-y-1 text-sm">
                  <li>• Full production release</li>
                  <li>• Enterprise tier support</li>
                  <li>• Complete tool library</li>
                  <li>• SLA guarantees</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Support Section - Full Gradient */}
          <div
            className="p-8 text-center bg-gray-900/50 rounded-lg transition-all duration-300 border-2"
            style={{
              borderColor: '#22d3ee' + '44',
              boxShadow: `0 0 20px rgba(34, 211, 238, 0.1)`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#22d3ee' + '88';
              e.currentTarget.style.backgroundColor = '#1f2937';
              e.currentTarget.style.boxShadow = `0 0 20px rgba(34, 211, 238, 0.2)`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#22d3ee' + '44';
              e.currentTarget.style.backgroundColor = 'rgba(17, 24, 39, 0.5)';
              e.currentTarget.style.boxShadow = `0 0 20px rgba(34, 211, 238, 0.1)`;
            }}
          >
            <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-cyan-400 via-blue-400 to-green-400 bg-clip-text text-transparent">Need Help?</h2>
            <p className="text-gray-400 mb-6">
              Check our documentation or reach out if you run into any issues.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="/docs/civil3d" className="text-cyan-400 hover:text-cyan-300 transition">
                Documentation
              </a>
              <a href="/release-log" className="text-cyan-400 hover:text-cyan-300 transition">
                Release Notes
              </a>
              <a href="https://github.com/msersen/landsurv-ai/issues" className="text-cyan-400 hover:text-cyan-300 transition" target="_blank" rel="noopener noreferrer">
                Report Issue
              </a>
              <a href="/contact" className="text-cyan-400 hover:text-cyan-300 transition">
                Contact Support
              </a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-gray-800 bg-gray-900/50 mt-16 py-8">
          <div className="max-w-6xl mx-auto px-4 text-center text-gray-500 text-sm">
            <p>LandsurvConnector v0.1.0-alpha | Thin Client for LandSurv.ai Cloud Brain</p>
            <p className="mt-2">© 2025 LandSurv.ai. All rights reserved.</p>
          </div>
        </footer>
    </div>
  );
};
