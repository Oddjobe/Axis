import { motion, AnimatePresence } from "framer-motion";
import { X, Globe, HeartHandshake, ShieldCheck, Target } from "lucide-react";

export default function MissionModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-xl p-6"
            >
                <motion.div
                    initial={{ scale: 0.95, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.95, y: 20 }}
                    className="w-full max-w-3xl bg-panel border-2 border-cobalt/50 rounded-xl shadow-[0_0_50px_rgba(37,99,235,0.2)] flex flex-col relative overflow-hidden"
                >
                    {/* Glowing background accent */}
                    <div className="absolute top-0 right-0 w-96 h-96 bg-cobalt/10 rounded-full blur-[100px] pointer-events-none" />

                    <div className="flex items-center justify-between p-6 border-b border-border bg-black/5 dark:bg-white/5 relative z-10">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-cobalt/20 border border-cobalt/50 rounded-lg flex items-center justify-center text-cobalt flex-shrink-0">
                                <Globe className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold tracking-widest uppercase">PLATFORM PURPOSE</h2>
                                <div className="text-xs font-mono text-slate-light flex gap-2 items-center mt-1">
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                    EMPOWERING PAN-AFRICAN STRATEGIC INTELLIGENCE
                                </div>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors text-slate-light hover:text-foreground">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="p-8 space-y-6 relative z-10 font-mono">
                        <strong>Axis Africa</strong> is not just a dashboard&mdash;it is a unified lens into the continent&apos;s strategic ascendancy. Designed to map, analyze, and accelerate Pan-African sovereignty, this platform empowers policymakers, investors, and analysts by aggregating fragmented data into actionable geopolitical intelligence.

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 border border-border bg-background/50 rounded-lg space-y-2">
                                <div className="flex items-center gap-2 text-cobalt font-bold text-xs uppercase mb-3">
                                    <Target className="w-4 h-4" /> The Mission
                                </div>
                                <p className="text-xs text-slate-light">
                                    To provide a real-time, objective, and data-driven perspective on Africa&apos;s resource beneficiation, infrastructure expansion, and AfCFTA integration.
                                </p>
                            </div>
                            <div className="p-4 border border-border bg-background/50 rounded-lg space-y-2">
                                <div className="flex items-center gap-2 text-green-500 font-bold text-xs uppercase mb-3">
                                    <ShieldCheck className="w-4 h-4" /> How to use it
                                </div>
                                <ul className="text-xs text-slate-light space-y-1 list-disc pl-4">
                                    <li>Click any country to isolate OSINT news and threat alerts for that region.</li>
                                    <li>Explore Dossiers to monitor commodity pipelines and exact AfCFTA axis scores.</li>
                                    <li>Track live Pan-African priorities in the bottom marquee.</li>
                                </ul>
                            </div>
                        </div>

                        <div className="border border-green-500/30 bg-green-500/10 p-4 rounded-lg flex items-start gap-3">
                            <HeartHandshake className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                            <p className="text-xs leading-relaxed text-green-500/90 font-bold">
                                &quot;The Africa we want is a continent that is integrated, prosperous, and peaceful, driven by its own citizens.&quot; This platform is a digital infrastructure step toward that sovereign future.
                            </p>
                        </div>

                        <a
                            href="/methodology"
                            className="block w-full text-center text-xs font-mono font-bold tracking-widest uppercase px-4 py-3 border border-cobalt/40 bg-cobalt/10 text-cobalt rounded-lg hover:bg-cobalt/20 transition-colors"
                        >
                            VIEW FULL METHODOLOGY →
                        </a>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
