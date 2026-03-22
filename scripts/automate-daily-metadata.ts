import fs from 'fs';
import path from 'path';

const WEBAPP_DIR = path.join(process.cwd());

const getTodayDateStrings = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.toLocaleString('en-US', { month: 'long' });
    const day = today.getDate();

    // YYYY-MM-DD
    const isoDate = today.toISOString().split('T')[0];
    // Month DD, YYYY
    const fullDate = `${month} ${day}, ${year}`;

    return { isoDate, fullDate };
};

const updateMockData = (fullDate: string) => {
    const filePath = path.join(WEBAPP_DIR, 'src/lib/mock-data.ts');
    let content = fs.readFileSync(filePath, 'utf8');

    // Update the override comment date
    content = content.replace(/\/\/ Geopolitical Overrides for [A-Za-z]+ \d+, \d{4}/, `// Geopolitical Overrides for ${fullDate}`);

    fs.writeFileSync(filePath, content);
    console.log(`Updated mock-data.ts to ${fullDate}`);
};

const updateCommodities = (isoDate: string) => {
    const filePath = path.join(WEBAPP_DIR, 'src/app/api/commodities/route.ts');
    let content = fs.readFileSync(filePath, 'utf8');

    // Update lastUpdated dates
    content = content.replace(/lastUpdated: "\d{4}-\d{2}-\d{2}"/g, `lastUpdated: "${isoDate}"`);

    // Apply slight jitter to prices (+/- 0.8%)
    content = content.replace(/price: (\d+(\.\d+)?)/g, (match, p1) => {
        const currentPrice = parseFloat(p1);
        const jitter = 1 + (Math.random() * 0.016 - 0.008);
        const newPrice = currentPrice * jitter;
        return `price: ${newPrice.toFixed(currentPrice < 100 ? 2 : 0)}`;
    });

    fs.writeFileSync(filePath, content);
    console.log(`Updated route.ts to ${isoDate} with price jitter`);
};

const updateTicker = () => {
    const filePath = path.join(WEBAPP_DIR, 'src/components/continental-goals-ticker.tsx');
    let content = fs.readFileSync(filePath, 'utf8');

    // Sync ticker prices with another jitter or just match (jitter is easier since it's "synthetic" anyway)
    content = content.replace(/price: (\d+(\.\d+)?)/g, (match, p1) => {
        const currentPrice = parseFloat(p1);
        const jitter = 1 + (Math.random() * 0.01 - 0.005);
        const newPrice = currentPrice * jitter;
        return `price: ${newPrice.toFixed(currentPrice < 100 ? 2 : 0)}`;
    });

    fs.writeFileSync(filePath, content);
    console.log(`Updated continental-goals-ticker.tsx with price jitter`);
};

const updateKPIs = () => {
    const filePath = path.join(WEBAPP_DIR, 'src/app/page.tsx');
    let content = fs.readFileSync(filePath, 'utf8');

    // FDI: Increment by $0.1B to $0.5B
    content = content.replace(/\$(\d+\.\d+)B(<\/span>\s*<\/div>\s*<\/div>\s*<div className="flex items-center gap-1\.5 px-2\.5 py-1\.5 bg-red-500\/5)/, (match, p1, p2) => {
        const val = parseFloat(p1);
        const newVal = val + (Math.random() * 0.4 + 0.1);
        return `$${newVal.toFixed(1)}B${p2}`;
    });

    // Capital Flight: Increment by $2B to $8B
    content = content.replace(/Capital Flight<\/span>\s*<span className="font-bold text-red-500 leading-tight">\$(\d+\.\d+)B/, (match, p1) => {
        const val = parseFloat(p1);
        const newVal = val + (Math.random() * 6 + 2);
        return `Capital Flight</span>\n                <span className="font-bold text-red-500 leading-tight">$${newVal.toFixed(1)}B`;
    });

    fs.writeFileSync(filePath, content);
    console.log(`Updated page.tsx KPIs`);
};

const main = () => {
    const { isoDate, fullDate } = getTodayDateStrings();

    try {
        updateMockData(fullDate);
        updateCommodities(isoDate);
        updateTicker();
        updateKPIs();
        console.log("Daily metadata automation complete.");
    } catch (error) {
        console.error("Automation failed:", error);
        process.exit(1);
    }
};

main();
