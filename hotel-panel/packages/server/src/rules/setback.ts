import type { Runtime } from '../boot'

const DEFAULT_SETPOINT_C = 24

/**
 * Unoccupied-room setback: park the AC when the room goes vacant, put the guest's
 * setpoint back when it is occupied again. Acts only on confirmed `occupied` readings.
 */
export function startSetback(rt: Runtime): () => void {
  const target = rt.config.setbackC
  if (target === undefined) return () => {}
  const lastOccupied = new Map<string, boolean>()
  const remembered = new Map<string, number>()

  const handler = (deviceId: string, reading: { value: { capability: string; on?: boolean } }) => {
    const [room, local] = deviceId.split('/')
    if (!room || local !== 'occupied' || reading.value.capability !== 'switch') return
    const occupied = reading.value.on === true
    if (lastOccupied.get(room) === occupied) return
    lastOccupied.set(room, occupied)

    const acId = `${room}/ac`
    const ac = rt.store.read(acId)?.value
    if (ac?.capability !== 'climate') return
    if (!occupied) {
      if (ac.setpointC < target) remembered.set(room, ac.setpointC)
      void rt.store.command(room, acId, { capability: 'climate', setpointC: target }).catch(() => {})
    } else if (ac.setpointC >= target) {
      const back = remembered.get(room) ?? DEFAULT_SETPOINT_C
      void rt.store.command(room, acId, { capability: 'climate', setpointC: back }).catch(() => {})
    }
  }
  rt.store.on('state', handler)
  return () => void rt.store.off('state', handler)
}
