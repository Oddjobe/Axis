import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
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
        {
            url: 'https://axis-mocha.vercel.app/docs',
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: 'https://axis-mocha.vercel.app/feed.xml',
            lastModified: new Date(),
            changeFrequency: 'always',
            priority: 0.6,
        },
    ];
}
