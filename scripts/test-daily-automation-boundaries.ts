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

const fallbackData = JSON.parse(
    fs.readFileSync(
        path.join(root, "src/lib/commodity-fallback-data.json"),
        "utf8",
    ),
);
assert.equal(fallbackData.schemaVersion, 1);
assert.equal(fallbackData.commodityFallbacks.length, 5);
assert.ok(fallbackData.snapshotAsOf, "Fallback snapshot must retain a source date");

const automation = fs.readFileSync(
    path.join(root, "scripts/automate-daily-metadata.ts"),
    "utf8",
);
assert.doesNotMatch(
    automation,
    /commodity-fallback-data|Math\.random|lastUpdated/,
    "Daily automation must never mutate or re-date fallback market values",
);

const commodityRoute = fs.readFileSync(
    path.join(root, "src/app/api/commodities/route.ts"),
    "utf8",
);
const ticker = fs.readFileSync(
    path.join(root, "src/components/continental-goals-ticker.tsx"),
    "utf8",
);
assert.match(commodityRoute, /commodity-fallback-data\.json/);
assert.match(ticker, /fetch\("\/api\/commodities"/);
assert.doesNotMatch(ticker, /Math\.random|daily-market-data\.json/);
console.log(
    "Daily automation boundaries passed (generated JSON only; TS/TSX writes rejected).",
);
