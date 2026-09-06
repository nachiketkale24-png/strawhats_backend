import MumbaiFloodMap from './components/MumbaiFloodMap'

export default function App() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="border-b border-[var(--border-primary)] bg-[var(--bg-primary)] px-5 py-5 md:px-8">
        <h1 className="font-[family-name:var(--font-hud)] text-sm uppercase tracking-[0.22em] text-[var(--text-heading)] md:text-lg">
          MUMBAI FLOOD NOWCAST
        </h1>
      </header>
      <main className="relative min-h-0 flex-1"><MumbaiFloodMap /></main>
    </div>
  )
}
