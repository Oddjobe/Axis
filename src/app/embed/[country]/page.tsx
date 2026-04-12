import { Metadata } from 'next';
import { ALL_SOVEREIGN_DATA } from '@/lib/mock-data';
import { CountryData } from '@/components/country-dossier-modal';

interface Props {
    params: Promise<{ country: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { country } = await params;
    const code = country.toUpperCase();
    const data = (ALL_SOVEREIGN_DATA as CountryData[]).find(c => c.country === code);
    return {
        title: data ? `${data.name} — AXIS Embed` : 'AXIS Africa Embed',
        robots: 'noindex',
    };
}

export async function generateStaticParams() {
    return (ALL_SOVEREIGN_DATA as CountryData[]).map(c => ({ country: c.country }));
}

export default async function EmbedPage({ params }: Props) {
    const { country } = await params;
    const code = country.toUpperCase();
    const data = (ALL_SOVEREIGN_DATA as CountryData[]).find(c => c.country === code);

    if (!data) {
        return (
            <div className="min-h-[200px] flex items-center justify-center bg-zinc-950 text-zinc-400 font-mono text-sm">
                Country not found
            </div>
        );
    }

    const statusColor = data.status === 'OPTIMAL' ? '#22c55e' 
        : data.status === 'EXTRACTIVE' ? '#ef4444' 
        : '#f59e0b';

    return (
        <div style={{
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            background: '#0a0a0f',
            color: '#e4e4e7',
            padding: '20px',
            minHeight: '200px',
            borderRadius: '12px',
            border: '1px solid rgba(37,99,235,0.2)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                    <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>
                        {data.name}
                    </div>
                    <div style={{ fontSize: '10px', color: '#71717a', letterSpacing: '0.15em', marginTop: '2px' }}>
                        ISO: {data.country} | POP: {data.population}
                    </div>
                </div>
                <div style={{
                    fontSize: '28px',
                    fontWeight: 900,
                    color: statusColor,
                    lineHeight: 1,
                }}>
                    {data.axisScore}
                    <span style={{ fontSize: '12px', opacity: 0.6 }}>/100</span>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' as const }}>
                <span style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '9999px',
                    background: `${statusColor}15`,
                    color: statusColor,
                    border: `1px solid ${statusColor}40`,
                    letterSpacing: '0.1em',
                }}>
                    {data.status}
                </span>
                <span style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '9999px',
                    background: 'rgba(37,99,235,0.1)',
                    color: '#2563eb',
                    border: '1px solid rgba(37,99,235,0.3)',
                    letterSpacing: '0.1em',
                }}>
                    TREND: {data.trend}
                </span>
            </div>

            {/* Score Bars */}
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px', marginBottom: '12px' }}>
                {[
                    { label: 'INFRASTRUCTURE', value: data.infrastructureControl },
                    { label: 'POLICY', value: data.policyIndependence },
                    { label: 'CURRENCY', value: data.currencyStability },
                    { label: 'RESOURCES', value: data.resourceWealth },
                ].map(bar => (
                    <div key={bar.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '8px', color: '#71717a', width: '90px', letterSpacing: '0.1em' }}>{bar.label}</span>
                        <div style={{ flex: 1, height: '4px', background: '#27272a', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${bar.value}%`, height: '100%', background: '#2563eb', borderRadius: '2px' }} />
                        </div>
                        <span style={{ fontSize: '9px', fontWeight: 700, width: '28px', textAlign: 'right' as const }}>{bar.value}</span>
                    </div>
                ))}
            </div>

            {/* Key Resources */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' as const }}>
                {data.keyResources.slice(0, 4).map(r => (
                    <span key={r} style={{
                        fontSize: '8px',
                        padding: '2px 6px',
                        background: '#18181b',
                        border: '1px solid #27272a',
                        borderRadius: '4px',
                        color: '#a1a1aa',
                    }}>
                        {r}
                    </span>
                ))}
            </div>

            {/* Branding */}
            <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '8px', color: '#52525b', letterSpacing: '0.15em' }}>AXIS AFRICA INTELLIGENCE</span>
                <a href="https://axis-mocha.vercel.app" target="_blank" rel="noopener" style={{ fontSize: '8px', color: '#2563eb', textDecoration: 'none' }}>
                    axis-mocha.vercel.app →
                </a>
            </div>
        </div>
    );
}
