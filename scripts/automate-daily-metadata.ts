import { execSync } from 'node:child_process';
import fs from 'fs';

import {
    resolveGeneratedDataPath,
    writeGeneratedJson,
} from "./generated-data-writer";

const getTodayDateStrings = () => {
    const today = new Date();
    const isoDate = today.toISOString().split('T')[0];
    return { isoDate, generatedAt: today.toISOString() };
};

type DailyMarketData = {
    schemaVersion: number;
    generatedAt: string;
    commodityFallbacks: Array<{
        price: number;
        lastUpdated: string;
        [key: string]: unknown;
    }>;
    tickerCommodities: Array<{
        price: number;
        [key: string]: unknown;
    }>;
};

const jitterPrice = (price: number, range: number) => {
    const jittered = price * (1 + (Math.random() * range * 2 - range));
    return Number(jittered.toFixed(price < 100 ? 2 : 0));
};

const updateDailyMarketData = (isoDate: string, generatedAt: string) => {
    const relativePath = "src/lib/daily-market-data.json";
    const filePath = resolveGeneratedDataPath(relativePath);
    const currentData = JSON.parse(
        fs.readFileSync(filePath, "utf8"),
    ) as DailyMarketData;

    const nextData: DailyMarketData = {
        ...currentData,
        schemaVersion: 1,
        generatedAt,
        commodityFallbacks: currentData.commodityFallbacks.map((commodity) => ({
            ...commodity,
            price: jitterPrice(commodity.price, 0.008),
            lastUpdated: isoDate,
        })),
        tickerCommodities: currentData.tickerCommodities.map((commodity) => ({
            ...commodity,
            price: jitterPrice(commodity.price, 0.005),
        })),
    };

    writeGeneratedJson(relativePath, nextData);
    console.log(`Updated ${relativePath} for ${isoDate}`);
};

const main = () => {
    const { isoDate, generatedAt } = getTodayDateStrings();

    try {
        console.log("Starting daily automation suite...");

        // Step 1: Generate AI Narratives for all nations
        try {
            console.log("Triggering AI Geopolitical Synthesis...");
            execSync('npx tsx scripts/generate-ai-narratives.ts', { stdio: 'inherit' });
        } catch (aiError) {
            console.error("AI Narrative generation failed, continuing with date/price refresh only:", aiError);
        }

        updateDailyMarketData(isoDate, generatedAt);
        console.log("Daily metadata automation complete.");
    } catch (error) {
        console.error("Automation failed:", error);
        process.exit(1);
    }
};

main();
