"use client"

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';

const TradeFlowMap = dynamic(() => import('./trade-flow-map'), { ssr: false });
const SupplyChainGraph = dynamic(() => import('./supply-chain-graph'), { ssr: false });

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function TradeIntelligenceModal({ isOpen, onClose }: Props) {
    const [tab, setTab] = useState<'flows' | 'supply'>('flows');

    if (typeof window === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="bg-panel border border-border rounded-xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-4 border-b border-border">
                            <div className="flex items-center gap-4">
                                <h2 className="text-lg font-black tracking-widest uppercase">TRADE INTELLIGENCE</h2>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => setTab('flows')}
                                        className={`text-[10px] font-mono font-bold px-3 py-1.5 rounded border transition-colors ${
                                            tab === 'flows' ? 'bg-cobalt/20 border-cobalt/50 text-cobalt' : 'border-transparent text-slate-light hover:text-foreground'
                                        }`}
                                    >
                                        TRADE FLOWS
                                    </button>
                                    <button
                                        onClick={() => setTab('supply')}
                                        className={`text-[10px] font-mono font-bold px-3 py-1.5 rounded border transition-colors ${
                                            tab === 'supply' ? 'bg-cobalt/20 border-cobalt/50 text-cobalt' : 'border-transparent text-slate-light hover:text-foreground'
                                        }`}
                                    >
                                        SUPPLY CHAIN
                                    </button>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            {tab === 'flows' ? <TradeFlowMap /> : <SupplyChainGraph />}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
