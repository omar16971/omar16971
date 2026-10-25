import { EventEmitter } from 'node:events'
import type { Command, DeviceDescriptor, DeviceState, DeviceView, Reading } from '@hotel-panel/shared'
import type { VendorAdapter } from '../adapters/adapter'

export interface StoreEvents {
  state: [deviceId: string, reading: Reading<DeviceState>]
  connection: [up: boolean]
}

/**
 * Authoritative state. A reading exists only once the vendor confirmed it, and
 * `stale` is derived on read: no confirmation inside the window, or controller down.
 */
export class StateStore extends EventEmitter<StoreEvents> {
  private readonly descriptors = new Map<string, DeviceDescriptor>()
  private readonly confirmed = new Map<string, { value: DeviceState; at: number }>()
  private readonly lastStale = new Map<string, boolean>()
  /** Confirmed before the controller dropped and not re-confirmed since. */
  private readonly unconfirmed = new Set<string>()
  private up = false
  private sweeper?: ReturnType<typeof setInterval>

  constructor(
    descriptors: DeviceDescriptor[],
    private readonly adapter: VendorAdapter,
    private readonly freshnessMs = 5 * 60_000,
    private readonly now: () => number = Date.now,
  ) {
    super()
    for (const d of descriptors) this.descriptors.set(d.id, d)
    adapter.onState((id, s) => this.applyState(id, s))
    adapter.onConnectionChange((up) => this.setConnection(up))
  }

  isUp(): boolean {
    return this.up
  }

  /** Emit `state` when a reading ages into stale. */
  startSweep(everyMs = 5_000): void {
    this.sweeper = setInterval(() => this.sweep(), everyMs)
    this.sweeper.unref?.()
  }

  stopSweep(): void {
    if (this.sweeper) clearInterval(this.sweeper)
  }

  setConnection(up: boolean): void {
    this.up = up
    if (!up) for (const id of this.confirmed.keys()) this.unconfirmed.add(id)
    this.emit('connection', up)
    this.sweep()
  }

  applyState(id: string, value: DeviceState): void {
    if (!this.descriptors.has(id)) return
    this.confirmed.set(id, { value, at: this.now() })
    this.unconfirmed.delete(id)
    this.publish(id)
  }

  read(id: string): Reading<DeviceState> | undefined {
    const c = this.confirmed.get(id)
    if (!c) return undefined
    return { value: c.value, at: c.at, stale: !this.up || this.unconfirmed.has(id) || this.now() - c.at > this.freshnessMs }
  }

  devices(room: string): DeviceView[] {
    return [...this.descriptors.values()]
      .filter((d) => d.room === room)
      .map((descriptor) => ({ descriptor, reading: this.read(descriptor.id) }))
  }

  /** Validates, then hands to the adapter. Confirmation comes back through applyState. */
  async command(room: string, deviceId: string, command: Command): Promise<void> {
    const d = this.descriptors.get(deviceId)
    if (!d || d.room !== room) throw new Error(`unknown device ${deviceId}`)
    if (d.readOnly) throw new Error(`${deviceId} is read-only`)
    if (d.capability !== command.capability) throw new Error(`${deviceId} is not a ${command.capability}`)
    await this.adapter.send(deviceId, clamp(command))
  }

  private sweep(): void {
    for (const id of this.confirmed.keys()) {
      const r = this.read(id)
      if (r && this.lastStale.get(id) !== r.stale) this.publish(id)
    }
  }

  private publish(id: string): void {
    const r = this.read(id)
    if (!r) return
    this.lastStale.set(id, r.stale)
    this.emit('state', id, r)
  }
}

const pct = (n: number): number => Math.min(100, Math.max(0, Math.round(n)))

function clamp(c: Command): Command {
  switch (c.capability) {
    case 'light':
      return c.brightness === undefined ? c : { ...c, brightness: pct(c.brightness) }
    case 'cover':
      return { ...c, position: pct(c.position) }
    case 'climate':
      return c.setpointC === undefined ? c : { ...c, setpointC: Math.min(30, Math.max(16, c.setpointC)) }
    default:
      return c
  }
}
