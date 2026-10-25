import type { Command, DeviceDescriptor, DeviceState, Reading } from './devices'

export interface SceneView {
  id: string
  labelKey: string
}

export interface DeviceView {
  descriptor: DeviceDescriptor
  /** Absent until the vendor has confirmed something. Never a guessed value. */
  reading?: Reading<DeviceState>
}

export type ClientMessage =
  | { t: 'hello'; room: string }
  /** Staff surface: a snapshot of every room, then state for every room. */
  | { t: 'staff-hello' }
  | { t: 'command'; room: string; deviceId: string; command: Command }
  | { t: 'scene'; room: string; sceneId: string }

export type ServerMessage =
  | { t: 'snapshot'; room: string; connected: boolean; setbackC?: number; devices: DeviceView[]; scenes: SceneView[] }
  | { t: 'state'; room: string; deviceId: string; reading: Reading<DeviceState> }
  | { t: 'connection'; up: boolean }
  | { t: 'scene-result'; room: string; sceneId: string; failed: string[] }
  | { t: 'error'; code: string; message: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isStr = (v: unknown): v is string => typeof v === 'string'

/** Dependency-free guard for untrusted input off the wire. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!isObj(raw)) return null
  switch (raw.t) {
    case 'hello':
      return isStr(raw.room) ? { t: 'hello', room: raw.room } : null
    case 'staff-hello':
      return { t: 'staff-hello' }
    case 'command':
      return isStr(raw.room) && isStr(raw.deviceId) && isObj(raw.command) && isStr(raw.command.capability)
        ? { t: 'command', room: raw.room, deviceId: raw.deviceId, command: raw.command as unknown as Command }
        : null
    case 'scene':
      return isStr(raw.room) && isStr(raw.sceneId) ? { t: 'scene', room: raw.room, sceneId: raw.sceneId } : null
    default:
      return null
  }
}
