import { createAdapter } from './adapters'
import type { VendorAdapter } from './adapters/adapter'
import type { PropertyConfig, RoomConfig } from './config/property'
import { StateStore } from './state/store'

export interface Runtime {
  config: PropertyConfig
  adapter: VendorAdapter
  store: StateStore
  room(number: string): RoomConfig | undefined
  stop(): Promise<void>
}

/** Config → adapter → store, in the order that lets no initial state be missed. */
export async function boot(config: PropertyConfig, adapter?: VendorAdapter): Promise<Runtime> {
  const descriptors = config.rooms.flatMap((r) => r.devices)
  const a = adapter ?? createAdapter(config, descriptors)
  const store = new StateStore(descriptors, a)

  await a.connect()
  const found = new Set((await a.discover()).map((d) => d.id))
  const missing = descriptors.filter((d) => !found.has(d.id)).map((d) => d.id)
  if (missing.length) throw new Error(`adapter does not expose: ${missing.join(', ')}`)
  store.startSweep()

  return {
    config,
    adapter: a,
    store,
    room: (n) => config.rooms.find((r) => r.number === n),
    stop: async () => {
      store.stopSweep()
      await a.disconnect()
    },
  }
}
