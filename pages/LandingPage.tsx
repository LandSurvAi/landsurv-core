
import React from 'react';

interface LandingPageProps {
    children: React.ReactNode;
    title: string;
}

const LandingPage: React.FC<LandingPageProps> = ({ children, title }) => {
    let redirectUrl = '/';
    // This logic is safe to run on the client during render.
    // It determines the root domain to link back to the main app.
    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        const parts = hostname.split('.');
        
        // If on a subdomain (e.g., 'about.landsurv.ai'), construct the root URL.
        // This check avoids altering the path for localhost.
        if (hostname !== 'localhost' && parts.length > 2) {
            const rootDomain = parts.slice(1).join('.');
            redirectUrl = `${window.location.protocol}//${rootDomain}${window.location.port ? ':' + window.location.port : ''}/`;
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950 font-sans text-gray-200">
            <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-gray-950/85 backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
                   <a href={redirectUrl} className="font-extrabold tracking-tighter text-gray-100">
                       Land<span className="text-cyan-400">Surv</span><span className="text-emerald-400">.ai</span>
                   </a>
                   <a
                       href={redirectUrl}
                       className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
                   >
                       Launch App
                   </a>
                </div>
            </header>
            <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:px-8">
                <section className="overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/50 via-gray-900/80 to-emerald-950/35 px-6 py-8 shadow-2xl shadow-cyan-950/20 sm:px-10 sm:py-10">
                   <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">LandSurv.ai platform</p>
                   <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">{title}</h1>
                   <p className="mt-4 max-w-3xl leading-7 text-gray-300">
                       Explore the tools, specifications, and resources that support modern surveying and civil-engineering workflows.
                   </p>
                   <a
                       href={redirectUrl}
                       className="mt-6 inline-flex rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-gray-950 transition-colors hover:bg-cyan-300"
                   >
                       Open LandSurv.ai
                   </a>
                </section>
                <main className="mt-8 rounded-2xl border border-white/[0.08] bg-slate-950/35 p-5 text-gray-300 shadow-xl shadow-black/10 sm:p-8">
                   {children}
                </main>
                <footer className="mt-8 border-t border-white/[0.08] pt-6 text-center text-sm text-gray-500">
                    &copy; {new Date().getFullYear()} LandSurv.ai - An AI-Native Toolkit for Surveyors and Engineers.
                </footer>
            </div>
        </div>
    );
};

export default LandingPage;
