import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { ALL_SOVEREIGN_DATA } from '../src/lib/mock-data';

// Load the local environment variables from the root folder
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}

// Instantiate the "Admin" database connection
const supabase = createClient(supabaseUrl, serviceKey);

// Utility to convert strings like "44.9M" to 44900000
function parseMetric(val: string | number | undefined): number {
    if (val === undefined) return 0;
    if (typeof val === 'number') return val;

    // Remove symbols
    let cleanStr = val.replace(/,/g, '').replace(/\$/g, '');
    let multiplier = 1;

    if (cleanStr.toUpperCase().endsWith('B')) {
        multiplier = 1000000000;
        cleanStr = cleanStr.slice(0, -1);
    } else if (cleanStr.toUpperCase().endsWith('M')) {
        multiplier = 1000000;
        cleanStr = cleanStr.slice(0, -1);
    }

    return Math.round(parseFloat(cleanStr) * multiplier) || 0;
}

async function seedData() {
    console.log(`Starting migration of ${ALL_SOVEREIGN_DATA.length} countries to Supabase...`);

    const formattedData = ALL_SOVEREIGN_DATA.map(country => ({
        id: country.country, // 3-letter ISO code
        name: country.name,
        axisScore: country.axisScore,
        trend: country.trend,
        resourceWealth: country.resourceWealth,
        population: parseMetric(country.population),
        gdp: parseMetric(country.gdp),
        topExport: country.topExport || "Data Pending",
        fdiClimate: country.fdiClimate || "Data Pending",
        strategicFocus: country.strategicFocus || "Data Pending",
    }));

    // The 'upsert' command inserts new rows or updates existing ones matching the primary 'id' key
    const { data, error } = await supabase
        .from('countries')
        .upsert(formattedData, { onConflict: 'id' });

    if (error) {
        console.error("Migration failed:", error);
    } else {
        console.log("Migration successful! 54 countries inserted/updated in Supabase.");
    }
}

seedData();
