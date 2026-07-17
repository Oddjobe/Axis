import assert from "node:assert/strict";

import { mergeFeedProvenance } from "../src/lib/intelligence/ingestion/adapters.server";
import { COMMODITY_SOURCES } from "../src/lib/intelligence/ingestion/commodity-sources";
import {
  BLOG_DISCOVERY_SOURCES,
  BLOG_SOURCES,
  CONFIGURED_SOURCE_QUALITY,
  configuredSourceQuality,
  INTELLIGENCE_DISCOVERY_SOURCES,
  INTELLIGENCE_SOURCES,
  SOURCE_REGISTRY_VERSION,
  sourceAllowsCanonicalUrl,
} from "../src/lib/intelligence/ingestion/sources";

const authoritative = [...INTELLIGENCE_SOURCES, ...BLOG_SOURCES];
const discovery = [
  ...INTELLIGENCE_DISCOVERY_SOURCES,
  ...BLOG_DISCOVERY_SOURCES,
];

assert.match(SOURCE_REGISTRY_VERSION, /^\d{4}-\d{2}-\d{2}\.v\d+$/);
assert(authoritative.length > 0);
assert(discovery.length > 0);

for (const source of authoritative) {
  assert.equal(source.role, "authority");
  assert.equal(source.registryVersion, SOURCE_REGISTRY_VERSION);
  assert(source.allowedHosts?.length);
  assert((source.sourceQuality ?? 0) >= 0.85);
  assert.equal(
    CONFIGURED_SOURCE_QUALITY[source.name.toLowerCase()],
    source.sourceQuality,
  );
  assert(sourceAllowsCanonicalUrl(source, source.url));
  assert.equal(
    sourceAllowsCanonicalUrl(source, "https://news.google.com/articles/test"),
    false,
  );
}

for (const source of discovery) {
  assert.equal(source.role, "discovery");
  assert.equal(source.registryVersion, SOURCE_REGISTRY_VERSION);
  assert.equal(sourceAllowsCanonicalUrl(source, source.url), false);
  assert.equal(
    CONFIGURED_SOURCE_QUALITY[source.name.toLowerCase()],
    undefined,
  );
}

assert(
  INTELLIGENCE_SOURCES.every((source) => !source.name.startsWith("Google News")),
);
assert(BLOG_SOURCES.every((source) => !source.name.startsWith("Medium")));
assert.equal(
  configuredSourceQuality(
    "African Business Magazine",
    "https://african.business/article",
  ),
  0.9,
);
assert.equal(
  configuredSourceQuality(
    "African Business Magazine",
    "https://news.google.com/article",
  ),
  null,
);
assert.equal(
  configuredSourceQuality(
    "ISS Africa Today",
    "https://issafrica.org/iss-today/example",
    "intelligence",
  ),
  null,
);
assert.equal(
  configuredSourceQuality(
    "African Business Magazine",
    "https://african.business/article",
    "blog",
  ),
  null,
);
assert.equal(
  configuredSourceQuality(
    "Google News Geopolitics",
    "https://news.google.com/article",
  ),
  null,
);
assert.equal(
  sourceAllowsCanonicalUrl(
    { name: "Unversioned", url: "https://african.business/" },
    "https://african.business/article",
  ),
  false,
);
assert.equal(
  sourceAllowsCanonicalUrl(
    {
      ...INTELLIGENCE_SOURCES[0],
      registryVersion: "2026-07-16.v1" as never,
    },
    "https://au.int/en/article",
  ),
  false,
);

const africanBusiness = INTELLIGENCE_SOURCES.find(
  (source) => source.name === "African Business Magazine",
);
assert(africanBusiness);
const crossPublisher = mergeFeedProvenance(
  [{
    title: "Cross-publisher claim",
    url: "https://news.google.com/articles/example",
    sourcePublishedAt: "2026-07-17T10:00:00.000Z",
  }],
  [{
    title: "Cross-publisher claim",
    summary:
      "A substantive source excerpt that cannot become authoritative through an aggregator URL.",
    url: "https://news.google.com/articles/example",
    sourcePublishedAt: "2026-07-17T10:00:00.000Z",
    sourceEvidence: {
      origin: "rss",
      canonicalUrl: "https://news.google.com/articles/example",
      sourcePublishedAt: "2026-07-17T10:00:00.000Z",
      excerpt:
        "A substantive source excerpt that cannot become authoritative through an aggregator URL.",
      timestampField: "isoDate",
      supported: true,
      disagreements: [],
    },
  }],
  africanBusiness,
)[0];
assert.equal(
  (crossPublisher.sourceEvidence as { supported: boolean }).supported,
  false,
);
assert.deepEqual(
  (crossPublisher.sourceEvidence as { disagreements: string[] }).disagreements,
  ["publisher_host:not_authoritative"],
);

const bauxite = COMMODITY_SOURCES.find((source) => source.id === "bauxite");
assert(bauxite);
assert.equal(bauxite.publisher, "AluHub");
assert.equal(bauxite.url, "https://www.alu-hub.com/market-data");
assert.notEqual(bauxite.url, "https://www.spglobal.com/commodityinsights/");

console.log(
  `Source governance fixtures passed (${authoritative.length} authorities, ${discovery.length} discovery-only sources, registry ${SOURCE_REGISTRY_VERSION}).`,
);
