import FirecrawlApp from "@mendable/firecrawl-js";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

if (!FIRECRAWL_API_KEY) {
  console.error("No FIRECRAWL_API_KEY in .env.local");
  process.exit(1);
}

const firecrawl = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });

async function main() {
  console.log("Searching for recent African Mega Projects...");
  // Let's search for a good article that is NOT Facebook or YouTube
  const searchResult = await firecrawl.search("Top African mega projects construction list 2024 value");
  
  if (!searchResult.success || !searchResult.data) {
      console.error("Failed to search", searchResult);
      return;
  }
  
  // Filter out youtube, facebook, cnn gallery which are notoriously hard to scrape
  const validUrls = searchResult.data
      .map((r: any) => r.url)
      .filter((url: string) => !url.includes("youtube") && !url.includes("facebook") && !url.includes("twitter") && !url.includes("instagram"));
  
  if (validUrls.length === 0) {
      console.error("No valid text-based URLs found.");
      return;
  }
  
  const targetUrl = validUrls[0];
  console.log(`Extracting data via Firecrawl from best text source: ${targetUrl}`);
  
  const scrapeResult: any = await firecrawl.scrapeUrl(targetUrl, {
      formats: ["extract"],
      extract: {
        prompt: "Extract the top 20 largest infrastructure or energy mega-projects in Africa currently active, planned, or recently completed. Return exactly 20 if possible. Focus on cost/value, sector, and status.",
        schema: {
          type: "object",
          properties: {
            projects: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  country: { type: "string" },
                  isoCode: { type: "string", description: "3-letter ISO code for the country" },
                  value: { type: "string", description: "e.g. $15B or Multi" },
                  sector: { type: "string", enum: ["ENERGY", "INFRASTRUCTURE", "MINING", "TECH", "INDUSTRIAL"] },
                  status: { type: "string", enum: ["ACTIVE", "COMPLETED", "PLANNED", "CONSTRUCTION"] }
                },
                required: ["id", "name", "country", "isoCode", "value", "sector", "status"]
              }
            }
          },
          required: ["projects"]
        } as any
      }
  });
  
  if (!scrapeResult.success) {
      console.error("Extraction failed", scrapeResult);
      return;
  }
  
  const projects = scrapeResult.extract?.projects;
  console.log(`Extracted ${projects?.length || 0} projects!`);
  
  if (projects && projects.length > 0) {
      const tsxPath = path.join(__dirname, "../src/components/mega-projects-ticker.tsx");
      let content = fs.readFileSync(tsxPath, "utf-8");
      
      const newProjectsFormatted = projects.map((p: any, i: number) => {
          return `  { id: "${i + 1}", name: "${p.name.substring(0, 40)}", country: "${p.country.substring(0, 20)}", isoCode: "${(p.isoCode || "UNK").substring(0,3).toUpperCase()}", value: "${p.value}", sector: "${p.sector}", status: "${p.status}" },`;
      }).join("\n");
      
      // Replace the old array
      const regex = /const MEGA_PROJECTS: MegaProject\[\] = \[[\s\S]*?\];/;
      const replacement = `const MEGA_PROJECTS: MegaProject[] = [\n${newProjectsFormatted}\n];`;
      
      content = content.replace(regex, replacement);
      fs.writeFileSync(tsxPath, content);
      
      console.log("Successfully updated src/components/mega-projects-ticker.tsx!");
  } else {
      console.log("No projects extracted.");
  }
}

main().catch((e) => console.error("Script error:", e));
