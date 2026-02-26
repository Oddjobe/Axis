import { CountryData } from "../components/country-dossier-modal";

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

const POP_MAP: Record<string, number> = {
    "NGA": 218.5, "ETH": 123.4, "EGY": 111.0, "COD": 99.0, "TZA": 65.5, "ZAF": 59.9, "KEN": 54.0,
    "UGA": 47.1, "SDN": 46.9, "DZA": 44.9, "MAR": 37.5, "AGO": 35.6, "GHA": 33.5, "MOZ": 33.0,
    "MDG": 29.6, "CIV": 28.2, "CMR": 27.9, "NER": 26.2, "BFA": 22.7, "MLI": 22.6, "MWI": 20.4,
    "ZMB": 20.0, "TCD": 17.7, "SOM": 17.6, "SEN": 17.3, "ZWE": 16.3, "GIN": 13.9, "RWA": 13.6,
    "BEN": 13.3, "BDI": 12.9, "TUN": 12.4, "SSD": 10.9, "TGO": 8.8, "SLE": 8.6, "LBY": 6.8,
    "COG": 6.0, "CAF": 5.6, "LBR": 5.3, "MRT": 4.7, "ERI": 3.6, "GMB": 2.7, "BWA": 2.6,
    "NAM": 2.6, "GNB": 2.1, "LSO": 2.3, "GNQ": 1.7, "MUS": 1.3, "SWZ": 1.2, "DJI": 1.1,
    "COM": 0.8, "CPV": 0.6, "STP": 0.2, "SYC": 0.1
};

// Resource wealth scores and key resources per country (based on real-world data)
const RESOURCE_MAP: Record<string, { score: number, resources: string[] }> = {
    "DZA": { score: 82, resources: ["Oil & Gas", "Phosphates", "Iron Ore"] },
    "AGO": { score: 88, resources: ["Oil", "Diamonds", "Iron Ore"] },
    "BEN": { score: 25, resources: ["Cotton", "Gold", "Limestone"] },
    "BWA": { score: 85, resources: ["Diamonds", "Copper", "Nickel"] },
    "BFA": { score: 45, resources: ["Gold", "Manganese", "Zinc"] },
    "BDI": { score: 35, resources: ["Nickel", "Gold", "Rare Earth"] },
    "CPV": { score: 10, resources: ["Salt", "Pozzolana"] },
    "CMR": { score: 55, resources: ["Oil", "Bauxite", "Timber"] },
    "CAF": { score: 60, resources: ["Diamonds", "Gold", "Uranium"] },
    "TCD": { score: 65, resources: ["Oil", "Uranium", "Gold"] },
    "COM": { score: 8, resources: ["Ylang-ylang"] },
    "COD": { score: 97, resources: ["Cobalt", "Copper", "Coltan", "Lithium"] },
    "COG": { score: 72, resources: ["Oil", "Timber", "Potash"] },
    "CIV": { score: 50, resources: ["Cocoa", "Gold", "Oil"] },
    "DJI": { score: 15, resources: ["Salt", "Geothermal"] },
    "EGY": { score: 70, resources: ["Oil & Gas", "Gold", "Phosphates"] },
    "GNQ": { score: 78, resources: ["Oil", "Gas", "Timber"] },
    "ERI": { score: 55, resources: ["Gold", "Copper", "Zinc"] },
    "SWZ": { score: 28, resources: ["Coal", "Quarry Stone"] },
    "ETH": { score: 52, resources: ["Gold", "Tantalum", "Gemstones"] },
    "GAB": { score: 80, resources: ["Oil", "Manganese", "Timber"] },
    "GMB": { score: 12, resources: ["Fish", "Titanium"] },
    "GHA": { score: 68, resources: ["Gold", "Oil", "Cocoa", "Bauxite"] },
    "GIN": { score: 82, resources: ["Bauxite", "Gold", "Diamonds", "Iron Ore"] },
    "GNB": { score: 18, resources: ["Bauxite", "Phosphates"] },
    "KEN": { score: 42, resources: ["Soda Ash", "Titanium", "Gold"] },
    "LSO": { score: 30, resources: ["Diamonds", "Water"] },
    "LBR": { score: 58, resources: ["Iron Ore", "Diamonds", "Gold"] },
    "LBY": { score: 90, resources: ["Oil", "Gas", "Gypsum"] },
    "MDG": { score: 65, resources: ["Nickel", "Cobalt", "Graphite", "Ilmenite"] },
    "MWI": { score: 30, resources: ["Uranium", "Coal", "Bauxite"] },
    "MLI": { score: 55, resources: ["Gold", "Phosphates", "Salt"] },
    "MRT": { score: 60, resources: ["Iron Ore", "Gold", "Oil"] },
    "MUS": { score: 15, resources: ["Fish"] },
    "MAR": { score: 72, resources: ["Phosphates", "Cobalt", "Zinc"] },
    "MOZ": { score: 75, resources: ["Gas", "Coal", "Titanium", "Rubies"] },
    "NAM": { score: 78, resources: ["Uranium", "Diamonds", "Zinc", "Gold"] },
    "NER": { score: 55, resources: ["Uranium", "Oil", "Gold"] },
    "NGA": { score: 92, resources: ["Oil", "Gas", "Tin", "Iron Ore"] },
    "RWA": { score: 40, resources: ["Tin", "Tantalum", "Tungsten"] },
    "STP": { score: 12, resources: ["Cocoa", "Oil (offshore)"] },
    "SEN": { score: 48, resources: ["Phosphates", "Gold", "Oil & Gas"] },
    "SYC": { score: 8, resources: ["Fish", "Cinnamon"] },
    "SLE": { score: 62, resources: ["Diamonds", "Rutile", "Bauxite", "Iron Ore"] },
    "SOM": { score: 45, resources: ["Uranium", "Oil (potential)", "Gas"] },
    "ZAF": { score: 95, resources: ["Platinum", "Gold", "Chrome", "Manganese", "Coal"] },
    "SSD": { score: 70, resources: ["Oil", "Gold", "Diamonds"] },
    "SDN": { score: 65, resources: ["Gold", "Oil", "Chrome"] },
    "TZA": { score: 68, resources: ["Gold", "Tanzanite", "Diamonds", "Gas"] },
    "TGO": { score: 32, resources: ["Phosphates", "Limestone"] },
    "TUN": { score: 45, resources: ["Phosphates", "Oil", "Iron Ore"] },
    "UGA": { score: 50, resources: ["Oil", "Gold", "Copper"] },
    "ZMB": { score: 80, resources: ["Copper", "Cobalt", "Emeralds"] },
    "ZWE": { score: 78, resources: ["Platinum", "Lithium", "Diamonds", "Chrome"] }
};

const generateMockData = (): CountryData[] => {
    return AFRICAN_NATIONS.map((nation, index) => {
        const baseScore = 40 + ((index * 7) % 55);
        const isPositive = (index % 3) !== 0;
        const trendValue = ((index * 3) % 4) + 0.1;

        let status = "STABLE";
        if (baseScore >= 75) status = "OPTIMAL";
        else if (baseScore <= 50) status = "EXTRACTIVE";
        else if (isPositive) status = "IMPROVING";

        const highlightPatterns = [
            ["Battery Metals", "Tech Transfer"],
            ["Agri-Tech", "Food Security"],
            ["Energy Reform", "Grid Expansion"],
            ["Resource Drain", "Cobalt Export"],
            ["Fintech Growth", "Digital Grid"],
            ["Local Refining", "Lithium Ban"],
            ["Trade Hub", "Port Expansion"]
        ];

        const resourceData = RESOURCE_MAP[nation.c] || { score: 20, resources: ["Undetermined"] };

        return {
            country: nation.c,
            name: nation.n,
            axisScore: baseScore,
            trend: `${isPositive ? '+' : '-'}${trendValue.toFixed(1)}%`,
            highlights: highlightPatterns[index % highlightPatterns.length],
            status: status,
            population: `${(POP_MAP[nation.c] || (1 + (index * 5.3) % 40)).toFixed(1)}M`,
            resourceWealth: resourceData.score,
            keyResources: resourceData.resources
        };
    }).sort((a, b) => a.name.localeCompare(b.name));
};

export const ALL_SOVEREIGN_DATA = generateMockData();
