import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
    GENERATED_DATA_FILES,
    resolveGeneratedDataPath,
} from "./generated-data-writer";

const root = process.cwd();
const automationScripts = [
    "scripts/automate-daily-metadata.ts",
    "scripts/generate-ai-narratives.ts",
    "scripts/update-kpis.ts",
];

for (const script of automationScripts) {
    const source = fs.readFileSync(path.join(root, script), "utf8");
    assert.doesNotMatch(
        source,
        /['"`]src[\\/][^'"`]+\.(?:ts|tsx)['"`]/i,
        `${script} must not target TypeScript source`,
    );
    assert.doesNotMatch(
        source,
        /\bfs\.(?:writeFile|writeFileSync)\b/,
        `${script} must use the generated-data writer`,
    );
}

assert.throws(
    () => resolveGeneratedDataPath("src/app/api/commodities/route.ts"),
    /only write generated data files/,
);
assert.throws(
    () => resolveGeneratedDataPath("src/components/continental-goals-ticker.tsx"),
    /only write generated data files/,
);
assert.throws(
    () => resolveGeneratedDataPath("src/lib/unapproved.json"),
    /only write generated data files/,
);

const workflow = fs.readFileSync(
    path.join(root, ".github/workflows/scrape.yml"),
    "utf8",
);
const expectedFilePattern = `file_pattern: "${GENERATED_DATA_FILES.join(" ")}"`;
assert.ok(
    workflow.includes(expectedFilePattern),
    "Daily workflow must commit only the generated-data allowlist",
);
assert.doesNotMatch(
    expectedFilePattern,
    /\.(?:ts|tsx)(?:\s|")/i,
    "Daily workflow commit allowlist must exclude TypeScript source",
);

const marketData = JSON.parse(
    fs.readFileSync(
        resolveGeneratedDataPath("src/lib/daily-market-data.json"),
        "utf8",
    ),
);
assert.equal(marketData.schemaVersion, 1);
assert.equal(marketData.commodityFallbacks.length, 5);
assert.equal(marketData.tickerCommodities.length, 10);

const commodityRoute = fs.readFileSync(
    path.join(root, "src/app/api/commodities/route.ts"),
    "utf8",
);
const ticker = fs.readFileSync(
    path.join(root, "src/components/continental-goals-ticker.tsx"),
    "utf8",
);
assert.match(commodityRoute, /daily-market-data\.json/);
assert.match(ticker, /daily-market-data\.json/);

console.log(
    "Daily automation boundaries passed (generated JSON only; TS/TSX writes rejected).",
);
