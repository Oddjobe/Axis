"use client"

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from './supabase';

interface RealtimeAlert {
    id: string;
    created_at: string;
    isoCode: string;
    title: string;
    summary: string;
    details?: string;
    severity: "HIGH" | "MEDIUM" | "LOW";
}

const MAX_ALERTS = 50;
const POLL_INTERVAL = 120_000; // 2 minutes

export function useRealtimeAlerts() {
    const [latestAlerts, setLatestAlerts] = useState<RealtimeAlert[]>([]);
    const [newAlertCount, setNewAlertCount] = useState(0);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const hasInitialData = useRef(false);

    const fetchAlerts = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('intelligence_alerts')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(MAX_ALERTS);

            if (!error && data) {
                setLatestAlerts(prev => {
                    const prevIds = new Set(prev.map(a => a.id));
                    const newOnes = data.filter((a: RealtimeAlert) => !prevIds.has(a.id));
                    if (newOnes.length > 0 && hasInitialData.current) {
                        setNewAlertCount(c => c + newOnes.length);
                    }
                    hasInitialData.current = true;
                    return data as RealtimeAlert[];
                });
            }
        } catch {
            // Silently fail — will retry on next poll
        }
    }, []);

    const clearNewAlerts = useCallback(() => setNewAlertCount(0), []);

    useEffect(() => {
        fetchAlerts();

        const startRealtime = () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }

            const channel = supabase
                .channel('intel-realtime')
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'intelligence_alerts',
                    },
                    (payload) => {
                        const newAlert = payload.new as RealtimeAlert;
                        setLatestAlerts(prev => [newAlert, ...prev].slice(0, MAX_ALERTS));
                        setNewAlertCount(c => c + 1);
                    }
                )
                .subscribe();

            channelRef.current = channel;
        };

        const startPolling = () => {
            stopPolling();
            pollRef.current = setInterval(fetchAlerts, POLL_INTERVAL);
        };

        const stopPolling = () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        };

        const stopRealtime = () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                fetchAlerts();
                startRealtime();
                stopPolling();
            } else {
                stopRealtime();
                startPolling();
            }
        };

        if (typeof document !== 'undefined') {
            handleVisibility();
            document.addEventListener('visibilitychange', handleVisibility);
        }

        return () => {
            stopRealtime();
            stopPolling();
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleVisibility);
            }
        };
    }, [fetchAlerts]);

    return { latestAlerts, newAlertCount, clearNewAlerts };
}
