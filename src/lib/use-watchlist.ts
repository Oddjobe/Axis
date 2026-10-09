import { useCallback, useMemo, useSyncExternalStore } from "react";

const STORAGE_KEY = "axisWatchlist";
const EMPTY_SNAPSHOT = "[]";

function validWatchlist(value: string | null): string {
    if (!value) return EMPTY_SNAPSHOT;
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) && parsed.every(item => typeof item === "string")
            ? JSON.stringify(parsed)
            : EMPTY_SNAPSHOT;
    } catch {
        return EMPTY_SNAPSHOT;
    }
}

function clientSnapshot(): string {
    return validWatchlist(window.localStorage.getItem(STORAGE_KEY));
}

function serverSnapshot(): string {
    return EMPTY_SNAPSHOT;
}

function subscribe(onStoreChange: () => void): () => void {
    const handleStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY) onStoreChange();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("watchlistUpdated", onStoreChange);
    return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener("watchlistUpdated", onStoreChange);
    };
}

export function useWatchlist() {
    const snapshot = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
    const watchlist = useMemo(() => JSON.parse(snapshot) as string[], [snapshot]);

    const togglePin = useCallback((isoCode: string) => {
        const current = clientSnapshot();
        const parsed = JSON.parse(current) as string[];
        const newList = parsed.includes(isoCode)
            ? parsed.filter(code => code !== isoCode)
            : [...parsed, isoCode];

        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
        window.dispatchEvent(new Event("watchlistUpdated"));
    }, []);

    return { watchlist, togglePin };
}
