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
            status: status,
            population: `${(POP_MAP[nation.c] || (1 + (index * 5.3) % 40)).toFixed(1)}M`
        };
    }).sort((a, b) => a.name.localeCompare(b.name));
};

export const ALL_SOVEREIGN_DATA = generateMockData();
