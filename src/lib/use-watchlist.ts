import { useState, useEffect } from "react";

export function useWatchlist() {
    const [watchlist, setWatchlist] = useState<string[]>(() => {
        if (typeof window === "undefined") return [];
        const stored = localStorage.getItem("axisWatchlist");
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) {
                console.error("Failed to parse watchlist", e);
            }
        }
        return [];
    });

    useEffect(() => {
        // This effect is now empty or can be removed if not needed for anything else.
        // Keeping it for future sync logic or removing if strictly cleaning up.
    }, []);

    const togglePin = (isoCode: string) => {
        setWatchlist((prev) => {
            const isPinned = prev.includes(isoCode);
            const newList = isPinned
                ? prev.filter(code => code !== isoCode)
                : [...prev, isoCode];

            localStorage.setItem("axisWatchlist", JSON.stringify(newList));

            // Dispatch a custom event so sibling components (like Friction Engine) 
            // can re-render immediately when the watchlist changes.
            window.dispatchEvent(new Event("watchlistUpdated"));

            return newList;
        });
    };

    return { watchlist, togglePin };
}
