"use client"

import React from 'react';
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer,
    Tooltip,
    Legend
} from 'recharts';
import { CountryData } from './country-dossier-modal';

interface CountryRadarChartProps {
    countries: CountryData[];
}

export default function CountryRadarChart({ countries }: CountryRadarChartProps) {
    // Transform data for Recharts
    // Metrics: Sovereignty, Resource Wealth, Foreign Influence (100 - policyIndependence), Stability, Infra Control
    const metrics = [
        { subject: 'SOVEREIGNTY', fullMark: 100 },
        { subject: 'RES. WEALTH', fullMark: 100 },
        { subject: 'FOREIGN INF.', fullMark: 100 },
        { subject: 'STABILITY', fullMark: 100 },
        { subject: 'INFRA CONTROL', fullMark: 100 },
    ];

    const data = metrics.map(m => {
        const item: any = { subject: m.subject, fullMark: m.fullMark };
        countries.forEach(country => {
            let value = 0;
            switch (m.subject) {
                case 'SOVEREIGNTY': value = country.axisScore; break;
                case 'RES. WEALTH': value = country.resourceWealth; break;
                case 'FOREIGN INF.': value = 100 - country.policyIndependence; break;
                case 'STABILITY': value = country.currencyStability; break;
                case 'INFRA CONTROL': value = country.infrastructureControl; break;
            }
            item[country.name] = value;
        });
        return item;
    });

    const colors = [
        '#3b82f6', // blue-500
        '#ef4444', // red-500
        '#10b981', // emerald-500
        '#f59e0b', // amber-500
        '#8b5cf6', // violet-500
    ];

    return (
        <div className="w-full h-full min-h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
                    <PolarGrid stroke="#334155" />
                    <PolarAngleAxis
                        dataKey="subject"
                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }}
                    />
                    <PolarRadiusAxis
                        angle={30}
                        domain={[0, 100]}
                        tick={{ fill: '#64748b', fontSize: 8 }}
                    />

                    {countries.map((country, index) => (
                        <Radar
                            key={country.country}
                            name={country.name.toUpperCase()}
                            dataKey={country.name}
                            stroke={colors[index % colors.length]}
                            fill={colors[index % colors.length]}
                            fillOpacity={0.3}
                            strokeWidth={2}
                        />
                    ))}

                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                            borderColor: '#334155',
                            borderRadius: '8px',
                            fontSize: '10px',
                            color: '#f8fafc'
                        }}
                        itemStyle={{ color: '#f8fafc' }}
                    />
                    <Legend
                        wrapperStyle={{
                            paddingTop: '20px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase'
                        }}
                    />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
}
