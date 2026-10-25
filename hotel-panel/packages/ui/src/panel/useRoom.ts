import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientMessage, Command, DeviceState, DeviceView, Reading, SceneView, ServerMessage } from '@hotel-panel/shared'

export interface RoomView {
  devices: Record<string, DeviceView>
  scenes: SceneView[]
  /** Socket to the property server is open. */
  linked: boolean
  /** Server says the vendor controller is reachable. */
  controllerUp: boolean
  /** Never been connected and nothing cached: show a waiting state, not zeros. */
  empty: boolean
  command(deviceId: string, command: Command): void
  scene(sceneId: string): void
}

const cacheKey = (room: string) => `panel:${room}`

function loadCache(room: string): { devices: Record<string, DeviceView>; scenes: SceneView[] } | null {
  try {
    const raw = localStorage.getItem(cacheKey(room))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Panel ⇄ property server. Reconnects with backoff; a cached snapshot renders as stale, never as live. */
export function useRoom(room: string): RoomView {
  const [data, setData] = useState(() => loadCache(room) ?? { devices: {}, scenes: [] as SceneView[] })
  const [linked, setLinked] = useState(false)
  const [controllerUp, setControllerUp] = useState(false)
  const ws = useRef<WebSocket | null>(null)

  useEffect(() => {
    let closed = false
    let attempt = 0
    let timer: ReturnType<typeof setTimeout>

    const open = () => {
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
      const sock = new WebSocket(url)
      ws.current = sock
      sock.onopen = () => {
        attempt = 0
        setLinked(true)
        sock.send(JSON.stringify({ t: 'hello', room } satisfies ClientMessage))
      }
      sock.onmessage = (e) => {
        const m = JSON.parse(e.data) as ServerMessage
        if (m.t === 'snapshot') {
          const devices = Object.fromEntries(m.devices.map((d) => [d.descriptor.id, d]))
          setData({ devices, scenes: m.scenes })
          setControllerUp(m.connected)
          try {
            localStorage.setItem(cacheKey(room), JSON.stringify({ devices, scenes: m.scenes }))
          } catch {}
        } else if (m.t === 'state') {
          setData((d) => {
            const cur = d.devices[m.deviceId]
            return cur ? { ...d, devices: { ...d.devices, [m.deviceId]: { ...cur, reading: m.reading } } } : d
          })
        } else if (m.t === 'connection') {
          setControllerUp(m.up)
        }
      }
      sock.onclose = () => {
        setLinked(false)
        if (!closed) timer = setTimeout(open, Math.min(10_000, 500 * 2 ** attempt++))
      }
    }
    open()
    return () => {
      closed = true
      clearTimeout(timer)
      ws.current?.close()
    }
  }, [room])

  const send = useCallback((m: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(m))
  }, [])

  return {
    ...data,
    linked,
    controllerUp,
    empty: Object.keys(data.devices).length === 0,
    command: (deviceId, command) => send({ t: 'command', room, deviceId, command }),
    scene: (sceneId) => send({ t: 'scene', room, sceneId }),
  }
}

export type Live<S extends DeviceState['capability']> = { state: Extract<DeviceState, { capability: S }>; stale: boolean } | undefined

/** Narrow a device's reading, folding link/controller loss into `stale`. */
export function live<S extends DeviceState['capability']>(
  view: RoomView,
  id: string,
  capability: S,
): Live<S> {
  const r: Reading<DeviceState> | undefined = view.devices[id]?.reading
  if (!r || r.value.capability !== capability) return undefined
  return { state: r.value as Extract<DeviceState, { capability: S }>, stale: r.stale || !view.linked || !view.controllerUp }
}
