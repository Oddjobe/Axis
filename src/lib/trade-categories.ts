export const TRADE_CATEGORIES = [
    "Minerals",
    "Energy",
    "Manufactured",
    "Chemicals",
    "Agriculture",
    "Services",
] as const;

export type TradeCategory = (typeof TRADE_CATEGORIES)[number];
