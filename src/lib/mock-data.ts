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

const generateMockData = (): CountryData[] => {
    return AFRICAN_NATIONS.map((nation, index) => {
        // Generate pseudo-random deterministic data based on index
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

        return {
            country: nation.c,
            name: nation.n,
            axisScore: baseScore,
            trend: `${isPositive ? '+' : '-'}${trendValue.toFixed(1)}%`,
            highlights: highlightPatterns[index % highlightPatterns.length],
            status: status
        };
    }).sort((a, b) => a.name.localeCompare(b.name));
};

export const ALL_SOVEREIGN_DATA = generateMockData();
