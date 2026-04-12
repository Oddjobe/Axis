import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
    // We can dynamically add routes here if the app grows to include
    // dedicated country dossier pages (e.g., /country/NGA).
    // For now, it's a single-page intelligence dashboard.
    return [
        {
            url: 'https://axis-mocha.vercel.app',
            lastModified: new Date(),
            changeFrequency: 'always',
            priority: 1,
        },
        {
            url: 'https://axis-mocha.vercel.app/methodology',
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
    ];
}
