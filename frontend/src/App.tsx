import { Activity, ShieldAlert } from 'lucide-react'
import MumbaiFloodMap from './components/MumbaiFloodMap'

export default function App() {
  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[var(--bg-void)]">
      <header className="flex h-14 md:h-16 shrink-0 items-center justify-between border-b border-[var(--border-primary)] bg-[var(--bg-primary)]/90 px-3 md:px-6 backdrop-blur-md z-20">
        <div className="flex items-center gap-2.5 md:gap-3.5">
          <div className="flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-lg border border-[var(--gold-primary)]/30 bg-[var(--gold-primary)]/10 text-[var(--gold-light)] shadow-[0_0_12px_rgba(212,175,55,0.2)]">
            <ShieldAlert size={18} className="text-[var(--gold-light)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-[family-name:var(--font-hud)] text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-heading)]">
                MUMBAI FLOOD SUSCEPTIBILITY
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-[family-name:var(--font-hud)] text-[10px] text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ACTIVE MODEL
              </span>
            </div>
            <p className="hidden md:block font-[family-name:var(--font-hud)] text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
              Terrain Vulnerability · Rain Gauges · Flood-Aware Routing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)]/80 px-2.5 py-1 text-[11px] font-[family-name:var(--font-hud)] text-[var(--text-secondary)]">
            <Activity size={13} className="text-[var(--cyan-primary)]" />
            <span className="text-[var(--text-primary)]">FSI</span>
            <span className="hidden xs:inline text-[var(--text-secondary)]">INDEX</span>
          </div>
        </div>
      </header>

      <main className="relative min-h-0 flex-1 w-full overflow-hidden">
        <MumbaiFloodMap />
      </main>
    </div>
  )
}

