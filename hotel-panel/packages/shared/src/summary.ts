import type { DeviceView } from './protocol'

/** Worst first: a fault outranks everything the room is otherwise doing. */
export type RoomStatus = 'fault' | 'dnd' | 'makeup' | 'occupied' | 'vacant'

export interface RoomSummary {
  room: string
  status: RoomStatus
  /** Devices with no confirmed reading, or one gone stale. */
  faults: string[]
  /** ms epoch of the newest vendor confirmation in the room. */
  lastSeen?: number
  setpointC?: number
  currentC?: number
  /** Vacant and the AC is parked at the setback temperature. */
  setback: boolean
}

const on = (v: DeviceView | undefined): boolean => {
  const s = v?.reading?.value
  return s?.capability === 'switch' && s.on
}

/** No PMS in v1 (blueprint §8): occupancy is the staff `occupied` toggle, plus DND. */
export function summariseRoom(room: string, devices: DeviceView[], setbackC?: number): RoomSummary {
  const by = (local: string) => devices.find((d) => d.descriptor.id === `${room}/${local}`)
  const faults = devices.filter((d) => !d.reading || d.reading.stale).map((d) => d.descriptor.id)
  const ac = by('ac')?.reading?.value
  const climate = ac?.capability === 'climate' ? ac : undefined
  const occupied = on(by('occupied'))
  const status: RoomStatus = faults.length
    ? 'fault'
    : on(by('dnd'))
      ? 'dnd'
      : on(by('makeup'))
        ? 'makeup'
        : occupied
          ? 'occupied'
          : 'vacant'
  const times = devices.map((d) => d.reading?.at).filter((t): t is number => t !== undefined)
  return {
    room,
    status,
    faults,
    lastSeen: times.length ? Math.max(...times) : undefined,
    setpointC: climate?.setpointC,
    currentC: climate?.currentC,
    setback: !occupied && setbackC !== undefined && climate !== undefined && climate.setpointC >= setbackC,
  }
}
