import type { ForecastOffset } from '../types/flood'
import Panel, { PanelCaption, PanelLabel, PanelValue } from './ui/Panel'

interface Props { rainfallMmHr: number; offset: ForecastOffset }
export default function RainfallPanel({ rainfallMmHr, offset }: Props) {
  return (
    <aside aria-label="Rainfall readout">
      <Panel>
        <PanelLabel>Current rainfall intensity</PanelLabel>
        <div aria-live="polite"><PanelValue className="my-2">{rainfallMmHr}<span className="ml-2 text-xs font-normal text-[var(--text-secondary)]">mm/hr</span></PanelValue></div>
        <PanelCaption>{offset === 0 ? 'Now' : `Forecast +${offset} min`}</PanelCaption>
      </Panel>
    </aside>
  )
}
