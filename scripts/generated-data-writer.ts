import fs from "node:fs";
import path from "node:path";

export const GENERATED_DATA_FILES = [
    "src/lib/daily-market-data.json",
    "src/lib/dynamic-narratives.json",
    "src/lib/kpi-data.json",
] as const;

export type GeneratedDataFile = (typeof GENERATED_DATA_FILES)[number];

export function resolveGeneratedDataPath(relativePath: string): string {
    const normalizedPath = relativePath.replaceAll("\\", "/");
    if (!GENERATED_DATA_FILES.includes(normalizedPath as GeneratedDataFile)) {
        throw new Error(
            `Automation may only write generated data files: ${normalizedPath}`,
        );
    }

    return path.resolve(process.cwd(), ...normalizedPath.split("/"));
}

export function writeGeneratedJson(
    relativePath: GeneratedDataFile,
    data: unknown,
): void {
    const outputPath = resolveGeneratedDataPath(relativePath);
    fs.writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
