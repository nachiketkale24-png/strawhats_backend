import { useEffect, useRef, useState } from 'react'
import type { PointerEvent, RefObject } from 'react'
import type * as maplibregl from 'maplibre-gl'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Compass, Locate, Minus, Plus } from 'lucide-react'

type Action = 'in' | 'out' | 'north' | 'east' | 'south' | 'west'
type Props = {
  mapRef: RefObject<maplibregl.Map | null>
  onLocateUser?: () => void
}

export default function MapControls({ mapRef, onLocateUser }: Props) {
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

  function resetView() {
    const map = mapRef.current
    if (!map) return
    const isMobile = window.innerWidth < 768
    map.easeTo({
      center: [72.8777, 19.076],
      zoom: isMobile ? 10.3 : 11.2,
      pitch: 0,
      bearing: 0,
      duration: 800,
    })
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
        className="hud-button flex h-9 w-9 md:h-10 md:w-10 touch-none select-none items-center justify-center"
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
      ><Icon size={16} aria-hidden="true" /></button>
    )
  }

  return (
    <>
      {/* Mobile Floating Action Controls */}
      <motion.div
        role="group" aria-label="Mobile map controls"
        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="hud-panel absolute bottom-20 right-3 z-10 flex flex-col gap-1.5 p-1.5 md:hidden"
      >
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          className="hud-button flex h-9 w-9 items-center justify-center"
          onClick={() => step('in', 250)}
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          className="hud-button flex h-9 w-9 items-center justify-center"
          onClick={() => step('out', 250)}
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          aria-label="Reset Mumbai view"
          title="Reset Mumbai view"
          className="hud-button flex h-9 w-9 items-center justify-center text-[var(--gold-light)]"
          onClick={resetView}
        >
          <Compass size={16} />
        </button>
        {onLocateUser && (
          <button
            type="button"
            aria-label="Find my location"
            title="Find my location"
            className="hud-button flex h-9 w-9 items-center justify-center text-[var(--cyan-primary)]"
            onClick={onLocateUser}
          >
            <Locate size={15} />
          </button>
        )}
      </motion.div>

      {/* Desktop HUD Controls with Compass */}
      <motion.div
        role="group" aria-label="Map pan and zoom controls"
        initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }} animate={{ opacity: 1, y: 0 }}
        className="hud-panel absolute bottom-12 right-4 z-10 hidden items-center gap-2 p-3 md:flex"
      >
        <div className="flex flex-col gap-1">
          {button('in', 'Zoom in', Plus)}
          {button('out', 'Zoom out', Minus)}
          <button
            type="button"
            aria-label="Reset Mumbai view"
            title="Reset to Mumbai view"
            className="hud-button flex h-10 w-10 items-center justify-center text-[var(--gold-light)]"
            onClick={resetView}
          >
            <Compass size={17} />
          </button>
        </div>
        <div className="grid grid-cols-3 grid-rows-3 gap-0.5">
          <span />{button('north', 'Pan north', ChevronUp)}<span />
          {button('west', 'Pan west', ChevronLeft)}<span />{button('east', 'Pan east', ChevronRight)}
          <span />{button('south', 'Pan south', ChevronDown)}<span />
        </div>
      </motion.div>
    </>
  )
}

