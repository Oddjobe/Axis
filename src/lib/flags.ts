// ISO 3166-1 alpha-3 → flag emoji for all 54 African nations
const FLAG_MAP: Record<string, string> = {
    NGA: "🇳🇬", ETH: "🇪🇹", EGY: "🇪🇬", COD: "🇨🇩", TZA: "🇹🇿", ZAF: "🇿🇦", KEN: "🇰🇪",
    UGA: "🇺🇬", SDN: "🇸🇩", DZA: "🇩🇿", MAR: "🇲🇦", AGO: "🇦🇴", GHA: "🇬🇭", MOZ: "🇲🇿",
    MDG: "🇲🇬", CIV: "🇨🇮", CMR: "🇨🇲", NER: "🇳🇪", BFA: "🇧🇫", MLI: "🇲🇱", MWI: "🇲🇼",
    ZMB: "🇿🇲", TCD: "🇹🇩", SOM: "🇸🇴", SEN: "🇸🇳", ZWE: "🇿🇼", GIN: "🇬🇳", RWA: "🇷🇼",
    BEN: "🇧🇯", BDI: "🇧🇮", TUN: "🇹🇳", SSD: "🇸🇸", TGO: "🇹🇬", SLE: "🇸🇱", LBY: "🇱🇾",
    COG: "🇨🇬", CAF: "🇨🇫", LBR: "🇱🇷", MRT: "🇲🇷", ERI: "🇪🇷", GMB: "🇬🇲", BWA: "🇧🇼",
    NAM: "🇳🇦", GNB: "🇬🇼", LSO: "🇱🇸", GNQ: "🇬🇶", MUS: "🇲🇺", SWZ: "🇸🇿", DJI: "🇩🇯",
    COM: "🇰🇲", CPV: "🇨🇻", STP: "🇸🇹", SYC: "🇸🇨", GAB: "🇬🇦",
};

export function isoToFlag(iso: string): string {
    return FLAG_MAP[iso?.toUpperCase()] || "🌍";
}
