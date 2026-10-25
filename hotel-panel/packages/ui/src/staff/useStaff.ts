import { useCallback, useEffect, useRef, useState } from 'react'
import { summariseRoom, type ClientMessage, type Command, type DeviceView, type RoomSummary, type SceneView, type ServerMessage } from '@hotel-panel/shared'

export interface StaffRoom {
  devices: DeviceView[]
  scenes: SceneView[]
}

export interface StaffView {
  rooms: Record<string, StaffRoom>
  summaries: RoomSummary[]
  linked: boolean
  controllerUp: boolean
  command(room: string, deviceId: string, command: Command): void
  scene(room: string, sceneId: string): void
}

/** One socket, every room. Summaries are derived here from confirmed readings, never stored. */
export function useStaff(): StaffView {
  const [rooms, setRooms] = useState<Record<string, StaffRoom>>({})
  const [setbackC, setSetbackC] = useState<number | undefined>()
  const [linked, setLinked] = useState(false)
  const [controllerUp, setControllerUp] = useState(false)
  const ws = useRef<WebSocket | null>(null)

  useEffect(() => {
    let closed = false
    let attempt = 0
    let timer: ReturnType<typeof setTimeout>
    const open = () => {
      const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)
      ws.current = sock
      sock.onopen = () => {
        attempt = 0
        setLinked(true)
        sock.send(JSON.stringify({ t: 'staff-hello' } satisfies ClientMessage))
      }
      sock.onmessage = (e) => {
        const m = JSON.parse(e.data) as ServerMessage
        if (m.t === 'snapshot') {
          setRooms((r) => ({ ...r, [m.room]: { devices: m.devices, scenes: m.scenes } }))
          setControllerUp(m.connected)
          setSetbackC(m.setbackC)
        } else if (m.t === 'state') {
          setRooms((r) => {
            const cur = r[m.room]
            if (!cur) return r
            return { ...r, [m.room]: { ...cur, devices: cur.devices.map((d) => (d.descriptor.id === m.deviceId ? { ...d, reading: m.reading } : d)) } }
          })
        } else if (m.t === 'connection') setControllerUp(m.up)
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
  }, [])

  const send = useCallback((m: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(m))
  }, [])

  // Losing the link or the controller makes every reading unverifiable: show it as stale.
  const doubt = !linked || !controllerUp
  const effective = (devices: DeviceView[]) =>
    doubt ? devices.map((d) => (d.reading ? { ...d, reading: { ...d.reading, stale: true } } : d)) : devices

  const summaries = Object.keys(rooms)
    .sort()
    .map((n) => summariseRoom(n, effective(rooms[n]!.devices), setbackC))

  return {
    rooms: Object.fromEntries(Object.entries(rooms).map(([n, r]) => [n, { ...r, devices: effective(r.devices) }])),
    summaries,
    linked,
    controllerUp,
    command: (room, deviceId, command) => send({ t: 'command', room, deviceId, command }),
    scene: (room, sceneId) => send({ t: 'scene', room, sceneId }),
  }
}
