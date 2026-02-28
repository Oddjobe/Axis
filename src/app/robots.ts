import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/api/'], // Prevent bots from draining our Firecrawl API credits
        },
        sitemap: 'https://axis-mocha.vercel.app/sitemap.xml',
    };
}
