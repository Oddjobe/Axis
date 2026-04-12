import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'API Documentation — AXIS Africa',
    description: 'Public API endpoints for African sovereignty intelligence data.',
};

export default function DocsPage() {
    const endpoints = [
        {
            method: 'GET',
            path: '/api/public/scores',
            description: 'Returns sovereignty scores for all 54 African nations. Includes axisScore, status, key resources, and sub-indices.',
            curl: 'curl -s https://axis-mocha.vercel.app/api/public/scores | jq .',
            response: `{
  "success": true,
  "count": 54,
  "data": [
    {
      "country": "NGA",
      "name": "Nigeria",
      "axisScore": 68,
      "status": "IMPROVING",
      "infrastructureControl": 55,
      "policyIndependence": 60,
      "currencyStability": 45,
      "resourceWealth": 92,
      "keyResources": ["Oil", "Gas", "Tin"]
    }
  ]
}`,
        },
        {
            method: 'GET',
            path: '/api/commodities',
            description: 'African-relevant commodity benchmark prices. Includes gold, copper, cobalt, lithium, and bauxite with source attribution and update frequency.',
            curl: 'curl -s https://axis-mocha.vercel.app/api/commodities | jq .',
            response: `{
  "success": true,
  "data": [
    {
      "id": "gold",
      "name": "GOLD (SPOT)",
      "price": 3250,
      "unit": "OZ",
      "currency": "USD",
      "trend": 0.45,
      "source": "LBMA / Kitco",
      "frequency": "daily",
      "lastUpdated": "2025-01-15"
    }
  ]
}`,
        },
        {
            method: 'GET',
            path: '/feed.xml',
            description: 'RSS 2.0 feed of intelligence alerts from the AXIS Africa monitoring system. Subscribe in any RSS reader.',
            curl: 'curl -s https://axis-mocha.vercel.app/feed.xml | head -20',
            response: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AXIS Africa Intelligence Feed</title>
    <item>
      <title>[HIGH] Gold reserves policy shift — GHA</title>
      <description>Ghana announces new gold reserve requirements...</description>
    </item>
  </channel>
</rss>`,
        },
        {
            method: 'GET',
            path: '/api/og',
            description: 'Dynamic Open Graph image generation. Use query params to customize social preview cards.',
            curl: 'curl -s "https://axis-mocha.vercel.app/api/og?country=Nigeria&score=86&status=OPTIMAL" -o preview.png',
            response: 'Returns a 1200×630 PNG image for social media cards.',
        },
        {
            method: 'GET',
            path: '/embed/{COUNTRY_CODE}',
            description: 'Embeddable country sovereignty card. Use in an iframe for external sites.',
            curl: '# Use in HTML:\n<iframe src="https://axis-mocha.vercel.app/embed/NGA" width="400" height="280" />',
            response: 'Returns an HTML page with a compact country card.',
        },
    ];

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
                {/* Header */}
                <div className="mb-12">
                    <a href="/" className="text-[10px] font-mono text-cobalt tracking-widest hover:underline mb-4 block">
                        ← BACK TO DASHBOARD
                    </a>
                    <h1 className="text-3xl sm:text-4xl font-black tracking-wider uppercase mb-3">
                        API <span className="text-cobalt">DOCUMENTATION</span>
                    </h1>
                    <p className="text-sm text-slate-light font-mono max-w-2xl">
                        Public endpoints for accessing African sovereignty intelligence data. 
                        All endpoints are free, require no authentication, and return JSON (except RSS and OG image).
                    </p>
                    <div className="mt-4 flex items-center gap-2 text-[10px] font-mono text-slate-light">
                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded">CORS ENABLED</span>
                        <span className="px-2 py-0.5 bg-cobalt/10 text-cobalt border border-cobalt/20 rounded">NO AUTH REQUIRED</span>
                        <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded">RATE LIMITED</span>
                    </div>
                </div>

                {/* Base URL */}
                <div className="mb-8 p-4 bg-panel border border-border rounded-lg">
                    <span className="text-[10px] font-mono text-slate-light tracking-widest">BASE URL</span>
                    <code className="block mt-1 text-sm font-mono text-cobalt font-bold">https://axis-mocha.vercel.app</code>
                </div>

                {/* Endpoints */}
                <div className="space-y-8">
                    {endpoints.map((ep, i) => (
                        <div key={i} className="border border-border rounded-lg overflow-hidden">
                            <div className="p-4 sm:p-6 bg-panel">
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="px-2 py-0.5 text-[10px] font-bold font-mono bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded">
                                        {ep.method}
                                    </span>
                                    <code className="text-sm font-mono font-bold text-foreground">{ep.path}</code>
                                </div>
                                <p className="text-xs text-slate-light font-mono leading-relaxed">{ep.description}</p>
                            </div>
                            
                            <div className="border-t border-border">
                                <div className="p-4 sm:p-6">
                                    <span className="text-[9px] font-mono text-slate-light tracking-widest">EXAMPLE REQUEST</span>
                                    <pre className="mt-2 p-3 bg-black/40 rounded text-[11px] font-mono text-cobalt overflow-x-auto">
                                        {ep.curl}
                                    </pre>
                                </div>
                            </div>

                            <div className="border-t border-border">
                                <div className="p-4 sm:p-6">
                                    <span className="text-[9px] font-mono text-slate-light tracking-widest">EXAMPLE RESPONSE</span>
                                    <pre className="mt-2 p-3 bg-black/40 rounded text-[10px] font-mono text-zinc-400 overflow-x-auto whitespace-pre-wrap">
                                        {ep.response}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="mt-12 pt-8 border-t border-border text-center">
                    <p className="text-[10px] font-mono text-slate-light tracking-widest">
                        AXIS AFRICA — OPEN SOURCE INTELLIGENCE INFRASTRUCTURE
                    </p>
                </div>
            </div>
        </div>
    );
}
