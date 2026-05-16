export default function AxisLogo() {
    return (
        <div className="group flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="relative h-9 w-9 shrink-0 sm:h-11 sm:w-11">
                <div className="absolute inset-0 rounded-2xl bg-cobalt/15 blur-md transition-opacity group-hover:opacity-80" />
                <svg
                    viewBox="0 0 44 44"
                    aria-hidden="true"
                    className="relative h-9 w-9 drop-shadow-[0_0_14px_rgba(37,99,235,0.45)] sm:h-11 sm:w-11"
                >
                    <defs>
                        <linearGradient id="axis-logo-ring" x1="8" y1="5" x2="36" y2="39" gradientUnits="userSpaceOnUse">
                            <stop stopColor="#38bdf8" />
                            <stop offset="0.45" stopColor="#2563eb" />
                            <stop offset="1" stopColor="#10b981" />
                        </linearGradient>
                    </defs>
                    <rect x="3" y="3" width="38" height="38" rx="13" fill="#0f1d33" stroke="rgba(37,99,235,0.35)" />
                    <circle cx="22" cy="22" r="13.5" fill="none" stroke="url(#axis-logo-ring)" strokeWidth="2.4" />
                    <path d="M22 8.5c4.2 3.3 6.4 7.9 6.4 13.5S26.2 32.2 22 35.5C17.8 32.2 15.6 27.6 15.6 22S17.8 11.8 22 8.5Z" fill="none" stroke="#60a5fa" strokeWidth="1.7" />
                    <path d="M9.5 22h25" stroke="#38bdf8" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M22 9.5v25" stroke="#38bdf8" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M14 14.4c2.1 1.2 4.9 1.9 8 1.9s5.9-.7 8-1.9" stroke="#2563eb" strokeWidth="1.4" strokeLinecap="round" />
                    <path d="M14 29.6c2.1-1.2 4.9-1.9 8-1.9s5.9.7 8 1.9" stroke="#10b981" strokeWidth="1.4" strokeLinecap="round" />
                    <path d="M30.5 10.5l3-3m-3 26 3 3m-23-3-3 3m3-26-3-3" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" opacity="0.75" />
                    <circle cx="22" cy="22" r="2.2" fill="#e0f2fe" />
                </svg>
            </div>
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <span className="truncate text-lg font-black uppercase tracking-[0.2em] text-foreground sm:text-xl sm:tracking-[0.28em] lg:text-2xl">
                        AXIS
                    </span>
                    <span className="hidden h-5 w-px bg-cobalt/35 sm:block" />
                    <span className="hidden truncate text-xl font-black uppercase tracking-[0.2em] text-foreground/90 sm:block lg:text-2xl">
                        Africa
                    </span>
                </div>
                <div className="hidden text-[8px] font-mono font-bold uppercase tracking-[0.24em] text-cobalt/70 xl:block">
                    Sovereignty Intelligence Grid
                </div>
            </div>
        </div>
    );
}
