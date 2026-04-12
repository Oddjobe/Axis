"use client"

import React from "react";

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("[AXIS ERROR BOUNDARY]", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;
            return (
                <div className="flex flex-col items-center justify-center p-8 border border-red-500/30 bg-red-500/5 rounded-xl text-center space-y-3">
                    <div className="text-red-500 text-xs font-mono font-bold tracking-widest uppercase">
                        ⚠ MODULE ERROR
                    </div>
                    <p className="text-[11px] font-mono text-slate-light max-w-sm">
                        A component failed to render. This has been logged. Refresh or try another view.
                    </p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="text-[10px] font-mono px-3 py-1.5 border border-red-500/30 text-red-500 rounded hover:bg-red-500/10 transition-colors"
                    >
                        RETRY
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
