import { z } from "zod";

import {
  PUBLICATION_DISPLAY_STATES,
  TRUST_HEALTH_REASON_CODES,
} from "@/lib/intelligence/publication-health";

const publicationStatusSchema = z.enum(["current", "stale", "unavailable"]);
const publicationTierSchema = z.enum(["trusted", "mixed", "legacy"]);
const displayStateSchema = z.enum(PUBLICATION_DISPLAY_STATES);

const datasetSchema = z
  .object({
    publicationTier: publicationTierSchema,
    status: publicationStatusSchema,
    displayState: displayStateSchema,
    coverage: z
      .object({
        availableRecords: z.number().int().nonnegative(),
        expectedRecords: z.number().int().nonnegative().nullable(),
        trustedRecords: z.number().int().nonnegative(),
        trustedExpectedRecords: z.number().int().nonnegative().nullable(),
        missingIdentities: z.array(z.string()),
        missingTrustedIdentities: z.array(z.string()),
        missingPublicationTimeRecords: z.number().int().nonnegative(),
        missingPublicationTimeIdentities: z.array(z.string()),
      })
      .strict(),
    freshness: z
      .object({
        sourcePublishedAt: z.string().nullable(),
        sourceObservedAt: z.string().nullable(),
      })
      .strict(),
    fallback: z
      .object({
        used: z.boolean(),
        state: z.enum([
          "none",
          "cached",
          "static",
          "legacy-live",
          "unavailable",
        ]),
      })
      .strict(),
    reasonCodes: z.array(z.enum(TRUST_HEALTH_REASON_CODES)),
  })
  .strict()
  .superRefine((dataset, context) => {
    const trustedState =
      dataset.displayState === "trusted-current" ||
      dataset.displayState === "trusted-stale";
    if (trustedState && dataset.publicationTier !== "trusted") {
      context.addIssue({
        code: "custom",
        path: ["displayState"],
        message: "Trusted display states require a trusted publication tier.",
      });
    }
    if (
      trustedState &&
      (dataset.fallback.used || dataset.fallback.state !== "none")
    ) {
      context.addIssue({
        code: "custom",
        path: ["fallback"],
        message: "Trusted display states cannot be fallback publications.",
      });
    }
  });

export const trustHealthContractSchema = z
  .object({
    version: z.literal("1"),
    status: publicationStatusSchema,
    generatedAt: z.string(),
    trustedPublicationsEnabled: z.boolean(),
    datasets: z
      .object({
        countryScores: datasetSchema,
        intelligence: datasetSchema,
        blogs: datasetSchema,
        commodities: datasetSchema,
      })
      .strict(),
  })
  .strict();
