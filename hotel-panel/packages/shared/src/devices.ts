export type Capability = 'light' | 'climate' | 'cover' | 'switch' | 'scene' | 'sensor'

export type Feature = 'dimmable' | 'colorTemp' | 'position' | 'fanSpeed'

export interface DeviceDescriptor {
  /** Ours, `<room>/<local id>`. Stable across a vendor swap. */
  id: string
  room: string
  capability: Capability
  /** An i18n key, never a display string. */
  labelKey: string
  features: Feature[]
  readOnly?: boolean
}

export type ClimateMode = 'off' | 'cool' | 'heat' | 'auto'
export type FanSpeed = 'low' | 'med' | 'high' | 'auto'

export type DeviceState =
  | { capability: 'light'; on: boolean; brightness?: number; kelvin?: number }
  | { capability: 'climate'; mode: ClimateMode; setpointC: number; currentC?: number; fan?: FanSpeed }
  | { capability: 'cover'; position: number } // 0 shut … 100 open
  | { capability: 'switch'; on: boolean }
  | { capability: 'sensor'; value: number | boolean; kind: string }

/** A partial change to a device. Fields left out are left alone. */
export type Command =
  | { capability: 'light'; on?: boolean; brightness?: number; kelvin?: number }
  | { capability: 'climate'; mode?: ClimateMode; setpointC?: number; fan?: FanSpeed }
  | { capability: 'cover'; position: number }
  | { capability: 'switch'; on: boolean }

export interface Reading<T> {
  value: T
  /** ms epoch, when the vendor last confirmed it. */
  at: number
  /** No confirmation inside the freshness window, or the controller is down. */
  stale: boolean
}
