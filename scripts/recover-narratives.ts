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

const RECOVERY_NATIONS = [
    { c: "BWA", n: "Botswana" },
    { c: "GAB", n: "Gabon" },
    { c: "GMB", n: "Gambia" },
    { c: "GHA", n: "Ghana" },
    { c: "GIN", n: "Guinea" },
    { c: "GNB", n: "Guinea-Bissau" },
    { c: "MWI", n: "Malawi" },
    { c: "MLI", n: "Mali" },
    { c: "MRT", n: "Mauritania" },
    { c: "MUS", n: "Mauritius" }
];

async function generateBatch(nations: { c: string, n: string }[]) {
    if (!foundry || !FOUNDRY_MODEL) throw new Error("Foundry / Phi-4 not initialized.");

    const prompt = `
        You are a geopolitical analyst. Generate a concise, realistic geopolitical world-state for today.
        
        Nations: ${nations.map(n => `${n.n} (${n.c})`).join(", ")}
        
        Return a JSON object where keys are EXACT 3-LETTER ISO codes and values match this structure:
        {
          "highlights": ["String", "String"],
          "status": "OPTIMAL" | "IMPROVING" | "EXTRACTIVE" | "NEUTRAL",
          "frictionVectors": [
            { "title": "STRING", "severity": "HIGH" | "MEDIUM" | "LOW", "details": "STRING" }
          ]
        }
    `;

    const response = await foundry.chat.completions.create({
        model: FOUNDRY_MODEL,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content || "{}");
}

async function main() {
    console.log("Starting serial recovery...");
    const filePath = path.join(process.cwd(), 'src/lib/dynamic-narratives.json');
    const currentData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Clean up malformed keys
    delete currentData["MW"]; delete currentData["ML"];
    delete currentData["MR"]; delete currentData["US"];

    for (const nation of RECOVERY_NATIONS) {
        console.log(`Recovering ${nation.n} (${nation.c})...`);
        try {
            const result = await generateBatch([nation]);
            Object.assign(currentData, result);
            console.log(`Successfully recovered ${nation.n}`);
            // Save after each success to prevent data loss
            fs.writeFileSync(filePath, JSON.stringify(currentData, null, 2));
        } catch (error) {
            console.error(`Failed to recover ${nation.n}:`, error);
        }
    }
    console.log("Serial recovery complete.");
}

main().catch(console.error);
