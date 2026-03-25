import OpenAI from "openai";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: ".env.local" });

const FOUNDRY_API_KEY = process.env.FOUNDRY_API_KEY;
const FOUNDRY_ENDPOINT = process.env.FOUNDRY_ENDPOINT;
const FOUNDRY_MODEL = process.env.FOUNDRY_MODEL;

const foundry = (FOUNDRY_API_KEY && FOUNDRY_ENDPOINT)
    ? new OpenAI({ apiKey: FOUNDRY_API_KEY, baseURL: FOUNDRY_ENDPOINT })
    : null;

const AFRICAN_NATIONS = [
    { c: "DZA", n: "Algeria" }, { c: "AGO", n: "Angola" }, { c: "BEN", n: "Benin" }, { c: "BWA", n: "Botswana" },
    { c: "BFA", n: "Burkina Faso" }, { c: "BDI", n: "Burundi" }, { c: "CPV", n: "Cabo Verde" }, { c: "CMR", n: "Cameroon" },
    { c: "CAF", n: "Central African Republic" }, { c: "TCD", n: "Chad" }, { c: "COM", n: "Comoros" }, { c: "COD", n: "DR Congo" },
    { c: "COG", n: "Congo" }, { c: "CIV", n: "Cote d'Ivoire" }, { c: "DJI", n: "Djibouti" }, { c: "EGY", n: "Egypt" },
    { c: "GNQ", n: "Equatorial Guinea" }, { c: "ERI", n: "Eritrea" }, { c: "SWZ", n: "Eswatini" }, { c: "ETH", n: "Ethiopia" },
    { c: "GAB", n: "Gabon" }, { c: "GMB", n: "Gambia" }, { c: "GHA", n: "Ghana" }, { c: "GIN", n: "Guinea" },
    { c: "GNB", n: "Guinea-Bissau" }, { c: "KEN", n: "Kenya" }, { c: "LSO", n: "Lesotho" }, { c: "LBR", n: "Liberia" },
    { c: "LBY", n: "Libya" }, { c: "MDG", n: "Madagascar" }, { c: "MWI", n: "Malawi" }, { c: "MLI", n: "Mali" },
    { c: "MRT", n: "Mauritania" }, { c: "MUS", n: "Mauritius" }, { c: "MAR", n: "Morocco" }, { c: "MOZ", n: "Mozambique" },
    { c: "NAM", n: "Namibia" }, { c: "NER", n: "Niger" }, { c: "NGA", n: "Nigeria" }, { c: "RWA", n: "Rwanda" },
    { c: "STP", n: "Sao Tome and Principe" }, { c: "SEN", n: "Senegal" }, { c: "SYC", n: "Seychelles" }, { c: "SLE", n: "Sierra Leone" },
    { c: "SOM", n: "Somalia" }, { c: "ZAF", n: "South Africa" }, { c: "SSD", n: "South Sudan" }, { c: "SDN", n: "Sudan" },
    { c: "TZA", n: "Tanzania" }, { c: "TGO", n: "Togo" }, { c: "TUN", n: "Tunisia" }, { c: "UGA", n: "Uganda" },
    { c: "ZMB", n: "Zambia" }, { c: "ZWE", n: "Zimbabwe" }
];

async function generateBatch(nations: { c: string, n: string }[]) {
    if (!foundry || !FOUNDRY_MODEL) throw new Error("Foundry / Phi-4 not initialized.");

    const prompt = `
        You are a geopolitical analyst focusing on African sovereignty and resource security.
        For each of the following nations, generate a concise, realistic geopolitical world-state for today.
        
        Nations: ${nations.map(n => `${n.n} (${n.c})`).join(", ")}
        
        Return a JSON object where keys are ISO codes and values match this structure:
        {
          "highlights": ["String", "String"],
          "status": "OPTIMAL" | "IMPROVING" | "EXTRACTIVE" | "NEUTRAL",
          "frictionVectors": [
            { "title": "STRING", "severity": "HIGH" | "MEDIUM" | "LOW", "details": "STRING" }
          ]
        }
        
        Guidelines:
        - highlights: 2 short punchy titles.
        - status: Current trajectory of sovereign resource control.
        - frictionVectors: 1-2 specific "hot" issues related to outside influence or infrastructure.
        - Details should be 1-2 sentences.
    `;

    const response = await foundry.chat.completions.create({
        model: FOUNDRY_MODEL,
        messages: [
            { role: "system", content: "You are a world-class geopolitical analyst. Output ONLY valid JSON." },
            { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result;
}

async function main() {
    console.log("Starting full AI Narrative Generation for 54 nations...");
    const batchSize = 5;
    const results: Record<string, any> = {};

    for (let i = 0; i < AFRICAN_NATIONS.length; i += batchSize) {
        const batch = AFRICAN_NATIONS.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(AFRICAN_NATIONS.length / batchSize)}: ${batch.map(b => b.n).join(', ')}...`);
        try {
            const batchResult = await generateBatch(batch);
            Object.assign(results, batchResult);
            console.log(`Successfully synthesized batch ${Math.floor(i / batchSize) + 1}`);
        } catch (error) {
            console.error(`Batch starting with ${batch[0].n} failed:`, error);
        }
    }

    const outputPath = path.join(process.cwd(), 'src/lib/dynamic-narratives.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`Successfully written 54-nation narratives to ${outputPath}`);
}

main().catch(console.error);
