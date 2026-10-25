import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { z } from 'zod'
import type { Capability, Command, DeviceDescriptor, Feature, SceneView } from '@hotel-panel/shared'

const capability = z.enum(['light', 'climate', 'cover', 'switch', 'scene', 'sensor'])
const feature = z.enum(['dimmable', 'colorTemp', 'position', 'fanSpeed'])

const device = z.object({
  id: z.string(),
  capability,
  features: z.array(feature).default([]),
  label: z.string(),
  readOnly: z.boolean().optional(),
})

const scene = z.object({
  id: z.string(),
  label: z.string(),
  /** A list of one-key maps: `- { main_light: { on: true } }`. */
  set: z.array(z.record(z.record(z.unknown()))),
})

const schema = z.object({
  property: z.object({
    id: z.string(),
    name_key: z.string(),
    languages: z.array(z.string()).min(1),
    default_language: z.string(),
    timezone: z.string(),
    night_mode: z.object({ from: z.string(), to: z.string() }),
  }),
  vendor: z.object({ adapter: z.string(), host: z.string().optional() }),
  rules: z.object({ setback: z.object({ setpointC: z.number() }).optional() }).default({}),
  room_types: z.record(z.object({ devices: z.array(device), scenes: z.array(scene).default([]) })),
  rooms: z.array(
    z.object({ number: z.string(), type: z.string(), vendor_map: z.record(z.string()).default({}) }),
  ),
})

export interface SceneStep {
  deviceId: string
  command: Command
}
export interface SceneDef extends SceneView {
  steps: SceneStep[]
}
export interface RoomConfig {
  number: string
  devices: DeviceDescriptor[]
  scenes: SceneDef[]
  /** Read only by the adapter. */
  vendorMap: Record<string, string>
}
export interface PropertyConfig {
  id: string
  languages: string[]
  defaultLanguage: string
  timezone: string
  nightMode: { from: string; to: string }
  adapter: string
  host?: string
  setbackC?: number
  rooms: RoomConfig[]
}

export const globalId = (room: string, local: string): string => `${room}/${local}`

export function parseProperty(source: string): PropertyConfig {
  const cfg = schema.parse(parse(source))
  const fail = (msg: string): never => {
    throw new Error(`property.yaml: ${msg}`)
  }
  const numbers = new Set<string>()

  const rooms = cfg.rooms.map((r): RoomConfig => {
    if (numbers.has(r.number)) fail(`duplicate room ${r.number}`)
    numbers.add(r.number)
    const type = cfg.room_types[r.type] ?? fail(`room ${r.number} uses unknown type "${r.type}"`)
    const local = new Map(type.devices.map((d) => [d.id, d]))
    if (local.size !== type.devices.length) fail(`room type "${r.type}" has duplicate device ids`)
    for (const k of Object.keys(r.vendor_map))
      if (!local.has(k)) fail(`room ${r.number} vendor_map names unknown device "${k}"`)

    const devices: DeviceDescriptor[] = type.devices.map((d) => ({
      id: globalId(r.number, d.id),
      room: r.number,
      capability: d.capability as Capability,
      labelKey: d.label,
      features: d.features as Feature[],
      ...(d.readOnly ? { readOnly: true } : {}),
    }))

    const scenes = type.scenes.map((s): SceneDef => ({
      id: s.id,
      labelKey: s.label,
      steps: s.set.flatMap((entry) =>
        Object.entries(entry).map(([localId, patch]): SceneStep => {
          const d = local.get(localId) ?? fail(`scene "${s.id}" names unknown device "${localId}"`)
          return { deviceId: globalId(r.number, d.id), command: { capability: d.capability, ...patch } as Command }
        }),
      ),
    }))

    return { number: r.number, devices, scenes, vendorMap: r.vendor_map }
  })

  return {
    id: cfg.property.id,
    languages: cfg.property.languages,
    defaultLanguage: cfg.property.default_language,
    timezone: cfg.property.timezone,
    nightMode: cfg.property.night_mode,
    adapter: cfg.vendor.adapter,
    host: cfg.vendor.host,
    setbackC: cfg.rules.setback?.setpointC,
    rooms,
  }
}

export const loadProperty = (path: string): PropertyConfig => parseProperty(readFileSync(path, 'utf8'))
