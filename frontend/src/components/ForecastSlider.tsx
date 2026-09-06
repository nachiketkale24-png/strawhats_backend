import { FORECAST_OFFSETS } from '../data/mockFlood'
import type { ForecastOffset } from '../types/flood'
import Panel, { PanelLabel } from './ui/Panel'
import PanelMotion from './ui/PanelMotion'

interface Props { offset: ForecastOffset; onChange: (offset: ForecastOffset) => void; disabled: boolean }
export default function ForecastSlider({ offset, onChange, disabled }: Props) {
  return (
    <section aria-label="Forecast time" className="absolute bottom-10 left-1/2 z-10 -translate-x-1/2">
      <PanelMotion><Panel>
      <PanelLabel className="mb-3 text-center">Forecast · +{offset} min</PanelLabel>
      <div className="flex gap-1" role="group" aria-label="Forecast offset">
        {FORECAST_OFFSETS.map((value) => <button key={value} type="button" disabled={disabled} aria-pressed={value === offset} onClick={() => onChange(value)} className="hud-button min-w-12 px-2 py-2 text-xs">{value === 0 ? 'Now' : `+${value}`}</button>)}
      </div>
      </Panel></PanelMotion>
    </section>
  )
}
