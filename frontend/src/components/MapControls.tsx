import { useEffect, useRef, useState } from 'react'
import type { PointerEvent, RefObject } from 'react'
import type * as maplibregl from 'maplibre-gl'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus } from 'lucide-react'

type Action = 'in' | 'out' | 'north' | 'east' | 'south' | 'west'
type Props = { mapRef: RefObject<maplibregl.Map | null> }

export default function MapControls({ mapRef }: Props) {
  const [pressed, setPressed] = useState<Action | null>(null)
  const active = useRef<{ action: Action; pointerId: number; holding: boolean } | null>(null)
  const delay = useRef<ReturnType<typeof setTimeout>>()
  const repeat = useRef<ReturnType<typeof setInterval>>()
  const reduceMotion = useReducedMotion()

  function step(action: Action, duration: number) {
    const map = mapRef.current
    if (!map) return
    if (action === 'in' || action === 'out') {
      map.easeTo({ zoom: map.getZoom() + (action === 'in' ? 1 : -1), duration })
    } else {
      const offsets: Record<'north' | 'east' | 'south' | 'west', [number, number]> = {
        north: [0, -220], east: [220, 0], south: [0, 220], west: [-220, 0],
      }
      map.panBy(offsets[action], { duration })
    }
  }

  function finish(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const current = active.current
    if (!current || current.pointerId !== event.pointerId) return
    clearTimeout(delay.current)
    clearInterval(repeat.current)
    active.current = null
    setPressed(null)
    if (current.holding) mapRef.current?.stop()
    else if (!cancelled) step(current.action, 240)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  useEffect(() => {
    const stop = () => {
      clearTimeout(delay.current)
      clearInterval(repeat.current)
      if (active.current?.holding) mapRef.current?.stop()
      active.current = null
      setPressed(null)
    }
    window.addEventListener('blur', stop)
    return () => { stop(); window.removeEventListener('blur', stop) }
  }, [mapRef])

  function button(action: Action, label: string, Icon: typeof Plus) {
    return (
      <button
        type="button" aria-label={label} title={label}
        data-pressed={pressed === action}
        className="hud-button flex h-10 w-10 touch-none select-none items-center justify-center"
        onPointerDown={(event) => {
          if (event.button !== 0 || active.current) return
          event.currentTarget.setPointerCapture(event.pointerId)
          active.current = { action, pointerId: event.pointerId, holding: false }
          setPressed(action)
          delay.current = setTimeout(() => {
            if (!active.current) return
            active.current.holding = true
            step(action, 400)
            repeat.current = setInterval(() => step(action, 400), 200)
          }, 280)
        }}
        onPointerUp={(event) => finish(event)}
        onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={(event) => finish(event, true)}
        onClick={(event) => { if (event.detail === 0) step(action, 240) }}
      ><Icon size={18} aria-hidden="true" /></button>
    )
  }

  return (
    <motion.div
      role="group" aria-label="Map pan and zoom controls"
      initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }} animate={{ opacity: 1, y: 0 }}
      className="hud-panel absolute bottom-12 right-4 z-10 hidden items-center gap-2 p-4 md:flex"
    >
      <div className="flex flex-col">{button('in', 'Zoom in', Plus)}{button('out', 'Zoom out', Minus)}</div>
      <div className="grid grid-cols-3 grid-rows-3">
        <span />{button('north', 'Pan north', ChevronUp)}<span />
        {button('west', 'Pan west', ChevronLeft)}<span />{button('east', 'Pan east', ChevronRight)}
        <span />{button('south', 'Pan south', ChevronDown)}<span />
      </div>
    </motion.div>
  )
}
