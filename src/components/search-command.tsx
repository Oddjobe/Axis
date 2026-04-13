"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Search, Globe, BarChart3, ShieldAlert, Share2, Combine, ArrowUpRight, Info, X, Command } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { isoToFlag } from "@/lib/flags"

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
]

interface Tool {
  id: string
  name: string
  description: string
  icon: typeof Globe
  action: string
}

const TOOLS: Tool[] = [
  { id: "about", name: "About / Mission", description: "Platform mission and methodology", icon: Info, action: "mission" },
  { id: "analytics", name: "Analytics Dashboard", description: "Continental statistics and charts", icon: BarChart3, action: "analytics" },
  { id: "nexus", name: "AI Supply Chain Nexus", description: "AI-powered resource dependency graph", icon: Share2, action: "nexus" },
  { id: "briefing", name: "Executive Briefing", description: "AI-generated situation report", icon: ShieldAlert, action: "briefing" },
  { id: "compare", name: "Comparative Analytics", description: "Compare countries side by side", icon: Combine, action: "compare" },
  { id: "trade", name: "Trade Intelligence", description: "AfCFTA trade flows and corridors", icon: ArrowUpRight, action: "trade" },
]

interface SearchCommandProps {
  isOpen: boolean
  onClose: () => void
  onSelectCountry: (iso: string) => void
  onOpenTool: (action: string) => void
}

export default function SearchCommand({ isOpen, onClose, onSelectCountry, onOpenTool }: SearchCommandProps) {
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const q = query.toLowerCase().trim()

  const filteredCountries = q.length > 0
    ? AFRICAN_NATIONS.filter(n => n.n.toLowerCase().includes(q) || n.c.toLowerCase().includes(q)).slice(0, 10)
    : []

  const filteredTools = q.length > 0
    ? TOOLS.filter(t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
    : TOOLS

  const results = [
    ...filteredCountries.map(c => ({ type: "country" as const, id: c.c, name: c.n, iso: c.c })),
    ...filteredTools.map(t => ({ type: "tool" as const, id: t.id, name: t.name, description: t.description, icon: t.icon, action: t.action })),
  ]

  const handleSelect = useCallback((index: number) => {
    const item = results[index]
    if (!item) return
    if (item.type === "country") {
      onSelectCountry(item.iso)
    } else {
      onOpenTool(item.action)
    }
    onClose()
    setQuery("")
  }, [results, onSelectCountry, onOpenTool, onClose])

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery("")
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Clamp selected index when results change
  useEffect(() => {
    setSelectedIndex(prev => Math.min(prev, Math.max(0, results.length - 1)))
  }, [results.length])

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`)
    if (el) el.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === "Enter" && results.length > 0) {
      e.preventDefault()
      handleSelect(selectedIndex)
    } else if (e.key === "Escape") {
      onClose()
    }
  }, [results.length, selectedIndex, handleSelect, onClose])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.15 }}
          className="w-full max-w-lg mx-4 bg-panel border border-border rounded-xl shadow-[0_0_60px_rgba(0,0,0,0.4)] overflow-hidden"
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="w-4 h-4 text-slate-light shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search countries, tools..."
              className="flex-1 bg-transparent text-sm font-mono text-foreground placeholder:text-slate-light/40 outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border bg-background text-[9px] font-mono text-slate-light/50">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
            {results.length === 0 && q.length > 0 && (
              <div className="py-8 text-center text-sm text-slate-light/50 font-mono">
                No results for &ldquo;{query}&rdquo;
              </div>
            )}

            {filteredCountries.length > 0 && (
              <div className="mb-1">
                <div className="px-3 py-1.5 text-[9px] font-bold tracking-widest text-slate-light/40 uppercase">
                  Countries
                </div>
                {filteredCountries.map((country, i) => {
                  const globalIdx = i
                  return (
                    <button
                      key={country.c}
                      data-index={globalIdx}
                      onClick={() => handleSelect(globalIdx)}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        selectedIndex === globalIdx ? "bg-cobalt/10 text-cobalt" : "text-foreground hover:bg-background/80"
                      }`}
                    >
                      <span className="text-lg leading-none shrink-0">{isoToFlag(country.c)}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold">{country.n}</span>
                        <span className="ml-2 text-[10px] font-mono text-slate-light/50">{country.c}</span>
                      </div>
                      {selectedIndex === globalIdx && (
                        <span className="text-[9px] font-mono text-slate-light/40">↵ select</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {filteredTools.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[9px] font-bold tracking-widest text-slate-light/40 uppercase">
                  {q.length > 0 ? "Tools" : "Quick Actions"}
                </div>
                {filteredTools.map((tool, i) => {
                  const globalIdx = filteredCountries.length + i
                  const Icon = tool.icon
                  return (
                    <button
                      key={tool.id}
                      data-index={globalIdx}
                      onClick={() => handleSelect(globalIdx)}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        selectedIndex === globalIdx ? "bg-cobalt/10 text-cobalt" : "text-foreground hover:bg-background/80"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0 opacity-60" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold">{tool.name}</span>
                        <span className="ml-2 text-[10px] text-slate-light/50 hidden sm:inline">{tool.description}</span>
                      </div>
                      {selectedIndex === globalIdx && (
                        <span className="text-[9px] font-mono text-slate-light/40">↵ open</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border text-[9px] font-mono text-slate-light/40">
            <div className="flex items-center gap-3">
              <span>↑↓ navigate</span>
              <span>↵ select</span>
              <span>esc close</span>
            </div>
            <div className="flex items-center gap-1">
              <Command className="w-3 h-3" />
              <span>K</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
