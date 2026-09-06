import Panel, { PanelCaption, PanelLabel } from './ui/Panel'

export default function Legend() {
  return (
    <aside aria-label="Flood depth legend">
      <Panel>
      <PanelLabel className="mb-3">Flood hotspots · cm</PanelLabel>
      <div className="mb-2 h-2 rounded-full" style={{ background: 'linear-gradient(to right, var(--heat-low), var(--heat-yellow), var(--heat-orange), var(--heat-red))' }} />
      <ul className="grid grid-cols-2 gap-2 text-xs">
        {[
          ['--heat-low', '0–5 cm'], ['--heat-yellow', '5–15 cm'],
          ['--heat-orange', '15–30 cm'], ['--heat-red', '30+ cm'],
        ].map(([color, label]) => <li key={label} className="flex items-center gap-3"><span className="h-2.5 w-5 rounded-sm" style={{ backgroundColor: `var(${color})` }} />{label}</li>)}
      </ul>
      <PanelCaption className="mt-3">Blended intensity; inspect a hotspot for exact depth.</PanelCaption>
      <PanelLabel className="mb-3 mt-4">Drainage</PanelLabel>
      <ul className="space-y-2 text-xs">
        {[
          ['--status-normal', 'Normal'], ['--capacity-amber', 'Strained'], ['--capacity-red', 'Surcharging'],
        ].map(([color, label]) => <li key={label} className="flex items-center gap-3"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: `var(${color})` }} />{label}</li>)}
      </ul>
      <PanelLabel className="mb-3 mt-4">Drainage capacity</PanelLabel>
      <div className="mb-2 h-2 rounded-full" style={{ background: 'linear-gradient(to right, var(--status-normal), var(--capacity-amber), var(--capacity-red))' }} />
      <PanelCaption>0% → 70% → 100% utilized</PanelCaption>
      <PanelCaption className="mt-1"><span className="mr-2 inline-block w-6 border-t-2 border-dashed border-[var(--capacity-red)]" />Dashed: over 85% · Arrows: flow</PanelCaption>
      <PanelCaption className="mt-3">Roads retain their depth colors.</PanelCaption>
      </Panel>
    </aside>
  )
}
