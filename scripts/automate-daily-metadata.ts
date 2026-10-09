import { execSync } from "node:child_process";

function main(): void {
    console.log("Starting daily metadata automation...");
    try {
        console.log("Triggering AI geopolitical synthesis...");
        execSync("npx tsx scripts/generate-ai-narratives.ts", {
            stdio: "inherit",
        });
        console.log("Daily metadata automation complete.");
    } catch (error) {
        console.error("AI narrative generation failed:", error);
        process.exitCode = 1;
    }
}

main();
