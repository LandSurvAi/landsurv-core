import React from 'react';

const technologies = [
  // Core Framework
  { name: 'React', description: 'Modern JavaScript library for building interactive user interfaces with component-based architecture', license: 'MIT License', url: 'https://react.dev/' },
  { name: 'React DOM', description: 'Renders React components to the DOM, enabling browser-based visualization and interaction', license: 'MIT License', url: 'https://react.dev/' },
  { name: 'TypeScript', description: 'Adds static type checking to JavaScript, catching errors during development and improving code quality', license: 'Apache License 2.0', url: 'https://www.typescriptlang.org/' },
  
  // Build & Testing
  { name: 'Vite', description: 'Lightning-fast frontend build tool providing instant dev server startup and optimized production bundles', license: 'MIT License', url: 'https://vitejs.dev/' },
  { name: 'Vitest', description: 'Modern unit testing framework with TypeScript support, running tests faster than traditional Jest', license: 'MIT License', url: 'https://vitest.dev/' },
  { name: 'Cypress', description: 'End-to-end testing framework for automated browser testing of user workflows and interactions', license: 'MIT License', url: 'https://cypress.io/' },
  { name: 'Tailwind CSS', description: 'Utility-first CSS framework for rapid styling with pre-built classes and responsive design support', license: 'MIT License', url: 'https://tailwindcss.com/' },
  { name: '@tailwindcss/postcss', description: 'PostCSS plugin for processing Tailwind CSS directives and generating optimized stylesheets', license: 'MIT License', url: 'https://tailwindcss.com/' },
  { name: 'PostCSS', description: 'CSS transformation tool that processes stylesheets through plugins for optimization and browser compatibility', license: 'MIT License', url: 'https://postcss.org/' },
  { name: 'AutoPrefixer', description: 'PostCSS plugin that automatically adds vendor prefixes to CSS for cross-browser compatibility', license: 'MIT License', url: 'https://autoprefixer.github.io/' },
  
  // UI & Icons
  { name: 'Lucide React', description: 'Comprehensive icon library with 400+ consistent, scalable SVG icons for modern UI design', license: 'ISC License', url: 'https://lucide.dev/' },
  { name: 'React QR Code', description: 'Generates QR codes from data, enabling easy sharing and integration of project information', license: 'MIT License', url: 'https://www.npmjs.com/package/react-qr-code' },
  
  // APIs & Services
  { name: 'Google Gemini API', description: 'Advanced multimodal AI model for understanding text, images, and generating intelligent responses', license: 'Google Cloud Platform Terms of Service', url: 'https://ai.google.dev/' },
  { name: '@google/genai', description: 'Official JavaScript client library for integrating Google Gemini AI into web applications', license: 'Apache License 2.0', url: 'https://github.com/google-gemini/generative-ai-js' },
  { name: 'Google Vertex AI', description: 'Enterprise AI platform providing access to state-of-the-art models like Gemini 1.5 Pro with high reliability and security', license: 'Google Cloud Platform Terms of Service', url: 'https://cloud.google.com/vertex-ai' },
  { name: '@google-cloud/vertexai', description: 'Node.js SDK for Vertex AI, enabling backend services to leverage Gemini models for AI-powered operations', license: 'Apache License 2.0', url: 'https://github.com/googleapis/nodejs-vertexai' },
  { name: 'Google Maps JavaScript API', description: 'Embeds interactive maps in web applications with mapping, geocoding, and geospatial analysis capabilities', license: 'Google Maps Platform Terms of Service', url: 'https://developers.google.com/maps/documentation/javascript' },
  { name: 'Google Vision API', description: 'Computer vision service that detects text, labels, objects, and faces in images for OCR and analysis', license: 'Google Cloud Platform Terms of Service', url: 'https://cloud.google.com/vision' },
  { name: 'Google Document AI API', description: 'Specialized document processing service that extracts structured data from PDFs, deeds, and scanned documents', license: 'Google Cloud Platform Terms of Service', url: 'https://cloud.google.com/document-ai' },
    { name: 'Google Cloud Firestore', description: 'Serverless document database used for durable call-message and voicemail intake when the contact workflow writes through Firebase storage.', license: 'Google Cloud Platform Terms of Service', url: 'https://firebase.google.com/products/firestore' },
  { name: 'NTRIP', description: 'Network protocol for real-time transmission of GNSS corrections, enabling precise positioning for survey work', license: 'Open Standard (RTCM 10410.1)', url: 'https://en.wikipedia.org/wiki/Networked_Transport_of_RTCM_via_Internet_Protocol' },
  
  // HTTP & Utilities
  { name: 'Axios', description: 'Promise-based HTTP client for making API requests with automatic JSON serialization and error handling', license: 'MIT License', url: 'https://axios-http.com/' },
  { name: 'Dotenv', description: 'Loads environment variables from .env files, keeping sensitive configuration out of source code', license: 'BSD-2-Clause License', url: 'https://github.com/motdotla/dotenv' },
  
  // Document & File Processing
  { name: 'pdf.js (pdfjs-dist)', description: 'Renders PDF documents in browsers without plugins, enabling document preview and analysis features', license: 'Apache License 2.0', url: 'https://mozilla.github.io/pdf.js/' },
  { name: 'Tesseract.js', description: 'JavaScript implementation of OCR (Optical Character Recognition) for extracting text from images and scans', license: 'Apache License 2.0', url: 'https://tesseract.projectnaptha.com/' },
  { name: 'jszip', description: 'Library for creating and reading ZIP archives in JavaScript, enabling .lsvz container file handling', license: 'MIT License or GPLv3', url: 'https://stuk.github.io/jszip/' },
  { name: 'jsPDF', description: 'Generates PDF documents from JavaScript, enabling report and legal description export capabilities', license: 'MIT License', url: 'https://github.com/parallax/jsPDF' },
  { name: 'jsPDF-AutoTable', description: 'Plugin for jsPDF that automatically formats and renders tables in generated PDF documents', license: 'MIT License', url: 'https://github.com/simonbengtsson/jsPDF-AutoTable' },
  { name: 'dxf-writer', description: 'Generates DXF files programmatically, enabling export of survey data to industry-standard CAD format', license: 'MIT License', url: 'https://github.com/tarikjabiri/dxf-writer' },
  { name: 'docx', description: 'Creates Word (.docx) documents from JavaScript, enabling export of legal descriptions and reports', license: 'MIT License', url: 'https://github.com/dolanmiu/docx' },
  { name: 'QRCode.js', description: 'Generates QR codes for embedding project identifiers and mission package references', license: 'MIT License', url: 'https://github.com/davidshimjs/qrcodejs' },
  
  // Geospatial & Projections
  { name: 'proj4.js (proj4)', description: 'Performs coordinate system transformations and map projections, converting between UTM, State Plane, and lat/lon', license: 'MIT License', url: 'https://proj4js.org/' },
  { name: 'EPSG Projection Data', description: 'Database of coordinate system definitions enabling support for thousands of projection standards worldwide', license: 'IOGP Terms of Use', url: 'https://epsg.io/' },
  
  // Authentication & Security
  { name: 'jsonwebtoken (JWT)', description: 'Creates and verifies JSON Web Tokens for stateless authentication and secure API access', license: 'MIT License', url: 'https://github.com/auth0/node-jsonwebtoken' },
  { name: 'Speakeasy', description: 'Generates and validates one-time passwords (OTP) for two-factor authentication security', license: 'MIT License', url: 'https://github.com/speakeasyjs/speakeasy' },
  { name: 'TOTP Generator', description: 'Implements time-based one-time password algorithm for authenticator app integration', license: 'MIT License', url: 'https://www.npmjs.com/package/totp-generator' },
  
  // Email & Communication
  { name: 'Nodemailer', description: 'Sends transactional emails for password resets, notifications, and report delivery', license: 'MIT License or EUPL 1.2', url: 'https://nodemailer.com/' },
    { name: 'Web Speech API', description: 'Browser speech-recognition and speech-synthesis APIs used by the Voice Agent pilot for live transcription and spoken feedback.', license: 'Browser Standard / W3C', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API' },
  
  // GNSS/RINEX Processing (Backend)
  { name: 'SciPy', description: 'Scientific computing library providing statistical analysis and optimization algorithms for GNSS processing', license: 'BSD License', url: 'https://scipy.org/' },
  { name: 'NumPy', description: 'Numerical computing library enabling efficient matrix operations for coordinate transformations and calculations', license: 'BSD License', url: 'https://numpy.org/' },
  { name: 'Pandas', description: 'Data analysis library for processing RINEX files and managing large datasets of satellite observations', license: 'BSD License', url: 'https://pandas.pydata.org/' },
  { name: 'GeoPandas', description: 'Extends Pandas with geospatial capabilities for analyzing and visualizing geographic survey data', license: 'BSD License', url: 'https://geopandas.org/' },
  { name: 'Pyproj', description: 'Python library for coordinate system transformations between WGS84, UTM, and local projections', license: 'MIT License', url: 'https://pyproj4.github.io/pyproj/stable/' },
  { name: 'Flask', description: 'Lightweight web framework for building the GNSS worker microservice backend', license: 'BSD License', url: 'https://flask.palletsprojects.com/' },
  { name: 'Flask-CORS', description: 'Enables cross-origin requests from the frontend to the GNSS processing backend', license: 'MIT License', url: 'https://pypi.org/project/flask-cors/' },
  { name: 'RINEX 2.11 & 3.03 Specification', description: 'Standard format for GNSS observation data, enabling processing of GPS/GLONASS/Galileo/BeiDou measurements', license: 'IGS Terms of Use', url: 'https://www.igs.org/formats' },
  { name: 'GPS/GNSS Algorithms', description: 'Implementation of satellite positioning algorithms including single-point positioning and least-squares solutions', license: 'Open Source Implementation', url: 'https://github.com/topics/gnss-positioning' },
  { name: 'WGS84 Coordinate Transformations', description: 'Converts between geodetic (lat/lon/altitude) and ECEF (Earth-Centered Earth-Fixed) coordinates', license: 'Public Domain', url: 'https://en.wikipedia.org/wiki/World_Geodetic_System' },
  { name: 'DOP (Dilution of Precision) Calculations', description: 'Calculates GDOP, PDOP, HDOP metrics to assess GNSS solution quality and reliability', license: 'Public Domain', url: 'https://en.wikipedia.org/wiki/Dilution_of_precision' },
  
  // Backend API & Infrastructure
  { name: 'Express.js', description: 'Lightweight web framework for building REST APIs and handling HTTP requests efficiently', license: 'MIT License', url: 'https://expressjs.com/' },
  { name: '@modelcontextprotocol/sdk', description: 'Model Context Protocol SDK enabling standardized tool integration and AI-powered command execution across applications', license: 'MIT License', url: 'https://github.com/modelcontextprotocol/sdk' },
  { name: 'WebSocket (ws)', description: 'Enables real-time bidirectional communication between Civil 3D client and cloud backend server', license: 'MIT License', url: 'https://github.com/websockets/ws' },
  { name: 'CORS', description: 'Middleware that allows requests from different origins, essential for client-server communication', license: 'MIT License', url: 'https://github.com/expressjs/cors' },
  { name: 'Multer', description: 'Handles file uploads, processing documents like PDFs and DXF files from clients', license: 'MIT License', url: 'https://github.com/expressjs/multer' },
  { name: 'UUID (uuid)', description: 'Generates unique identifiers for requests, sessions, and project files ensuring no collisions', license: 'MIT License', url: 'https://github.com/uuidjs/uuid' },
  { name: 'Zod', description: 'TypeScript-first schema validation library ensuring data integrity and type safety in APIs', license: 'MIT License', url: 'https://zod.dev/' },
  { name: 'PostgreSQL (pg)', description: 'Relational database for storing project data, user accounts, and configuration information', license: 'PostgreSQL License (BSD-like)', url: 'https://node-postgres.com/' },
  { name: 'Redis', description: 'In-memory cache and job queue for fast data access and asynchronous task processing', license: 'Server Side Public License (SSPL)', url: 'https://redis.io/' },
  { name: 'Docker', description: 'Containerization platform that packages applications with dependencies for consistent deployment', license: 'Apache License 2.0', url: 'https://www.docker.com/' },
  { name: 'Google Cloud Run', description: 'Serverless platform for deploying containerized applications with automatic scaling and zero idle cost', license: 'Google Cloud Platform Terms of Service', url: 'https://cloud.google.com/run' },
  
  // C3DMCP (Civil 3D Cloud Integration)
  { name: 'civil3d-mcp', description: 'Custom Model Context Protocol server enabling AI-powered command execution and real-time communication with Autodesk Civil 3D through WebSocket and Gemini AI integration', license: 'ISC License', url: 'https://github.com/civil3d-mcp/civil3d-mcp' },
  { name: '.NET Framework 4.8', description: 'Microsoft framework providing APIs for Windows desktop applications and Civil 3D plugin development', license: 'Microsoft Software License', url: 'https://www.microsoft.com/en-us/download/details.aspx?id=30653' },
  { name: 'WPF (Windows Presentation Foundation)', description: 'Desktop UI framework for building the graphical interface of the Civil 3D plugin', license: 'Microsoft Software License', url: 'https://learn.microsoft.com/en-us/dotnet/desktop/wpf/' },
  { name: 'Autodesk Civil 3D SDK', description: 'Official API for creating plugins that integrate with and extend Civil 3D functionality', license: 'Autodesk Developer Network Agreement', url: 'https://www.autodesk.com/developer-network/platform-technologies/civil-3d' },
  { name: 'WebSocketSharp', description: 'C# WebSocket client library for establishing secure real-time communication with the cloud backend', license: 'MIT License', url: 'https://github.com/sta/websocket-sharp' },
  { name: 'Newtonsoft.Json (JSON.NET)', description: 'JSON serialization library for converting between C# objects and JSON message protocol', license: 'MIT License', url: 'https://www.newtonsoft.com/json' },
  { name: 'HMAC-SHA256 Security', description: 'Cryptographic authentication ensuring secure token generation and validation between plugin and backend', license: 'Public Domain / OpenSSL License', url: 'https://en.wikipedia.org/wiki/HMAC' },
  
  // Testing Libraries
  { name: '@testing-library/react', description: 'Testing utility that encourages testing components from user perspective, not implementation details', license: 'MIT License', url: 'https://testing-library.com/' },
  { name: '@testing-library/jest-dom', description: 'Matchers that enhance assertion capabilities for DOM testing with readable error messages', license: 'MIT License', url: 'https://github.com/testing-library/jest-dom' },
  { name: '@testing-library/user-event', description: 'Simulates user interactions like clicks and typing for more realistic integration testing', license: 'MIT License', url: 'https://testing-library.com/docs/user-event/intro' },
  { name: '@testing-library/cypress', description: 'Cypress plugin for testing-library queries enabling semantic testing in end-to-end tests', license: 'MIT License', url: 'https://testing-library.com/docs/cypress-testing-library/intro' },
  { name: 'jsdom', description: 'JavaScript implementation of web standards enabling testing without a real browser', license: 'MIT License', url: 'https://github.com/jsdom/jsdom' },
];

export const TechnologiesPageContent: React.FC = () => {
    // Landing pages don't have access to activeAgent context, use default theme
    const themeHover = 'hover:text-cyan-400';

    return (
        <>
            <p className="mb-6 text-gray-400">
                This application is built with the help of several powerful open-source technologies. We are grateful to the developers and communities behind these projects.
            </p>
            <div className="space-y-4">
                {technologies.map(tech => (
                <div key={tech.name} className="p-3 bg-gray-900/50 rounded-lg border border-gray-700 light-theme:bg-gray-100/50 light-theme:border-gray-300">
                    <a href={tech.url} target="_blank" rel="noopener noreferrer" className={`font-semibold text-lg text-gray-100 ${themeHover} hover:underline light-theme:text-gray-900`}>
                    {tech.name}
                    </a>
                    <p className="text-sm text-gray-300 mt-1 light-theme:text-gray-700">{tech.description}</p>
                    <p className="text-xs text-gray-500 mt-2 light-theme:text-gray-600">{tech.license}</p>
                </div>
                ))}
            </div>
        </>
    );
};