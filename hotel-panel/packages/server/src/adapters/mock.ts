import type { Command, DeviceDescriptor, DeviceState } from '@hotel-panel/shared'
import type { VendorAdapter } from './adapter'

export interface MockOptions {
  /** Round-trip delay before a command takes effect. */
  latencyMs?: number
  /** Seconds a curtain takes to travel 0 → 100. */
  coverTravelSeconds?: number
  /** Cover position update period while moving. */
  tickMs?: number
}

const initialState = (d: DeviceDescriptor): DeviceState => {
  switch (d.capability) {
    case 'light': return { capability: 'light', on: false, brightness: d.features.includes('dimmable') ? 100 : undefined }
    case 'climate': return { capability: 'climate', mode: 'cool', setpointC: 24, currentC: 26, fan: 'auto' }
    case 'cover': return { capability: 'cover', position: 100 }
    case 'switch': return { capability: 'switch', on: false }
    default: return { capability: 'sensor', value: 0, kind: 'unknown' }
  }
}

/** A first-class adapter: an in-memory property with the failure modes of a real one. */
export class MockAdapter implements VendorAdapter {
  latencyMs: number
  private readonly travelSeconds: number
  private readonly tickMs: number
  private readonly states = new Map<string, DeviceState>()
  private readonly targets = new Map<string, number>()
  private readonly silenced = new Set<string>()
  private readonly dropNext = new Set<string>()
  private stateHandlers: Array<(id: string, s: DeviceState) => void> = []
  private connHandlers: Array<(up: boolean) => void> = []
  private offline = false
  private timer?: ReturnType<typeof setInterval>

  constructor(private readonly descriptors: DeviceDescriptor[], opts: MockOptions = {}) {
    this.latencyMs = opts.latencyMs ?? 150
    this.travelSeconds = opts.coverTravelSeconds ?? 11
    this.tickMs = opts.tickMs ?? 250
    for (const d of descriptors) this.states.set(d.id, initialState(d))
  }

  async connect(): Promise<void> {
    this.timer = setInterval(() => this.tick(), this.tickMs)
    this.timer.unref?.()
    setTimeout(() => {
      for (const h of this.connHandlers) h(!this.offline)
      this.emitAll()
    }, 0)
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
  }

  async discover(): Promise<DeviceDescriptor[]> {
    return this.descriptors
  }

  async send(deviceId: string, command: Command): Promise<void> {
    if (this.offline) throw new Error('controller offline')
    if (!this.states.has(deviceId)) throw new Error(`unknown device ${deviceId}`)
    if (this.dropNext.delete(deviceId)) return // accepted by the vendor, never lands
    setTimeout(() => this.apply(deviceId, command), this.latencyMs)
  }

  onState(handler: (id: string, s: DeviceState) => void): void {
    this.stateHandlers.push(handler)
  }

  onConnectionChange(handler: (up: boolean) => void): void {
    this.connHandlers.push(handler)
  }

  // ── dev controls ────────────────────────────────────────────────────────
  setOffline(offline: boolean): void {
    if (this.offline === offline) return
    this.offline = offline
    for (const h of this.connHandlers) h(!offline)
    if (!offline) this.emitAll()
  }

  isOffline(): boolean {
    return this.offline
  }

  /** Stop confirming a device, so its reading ages into stale. */
  setSilent(deviceId: string, silent: boolean): void {
    if (silent) this.silenced.add(deviceId)
    else {
      this.silenced.delete(deviceId)
      this.emit(deviceId)
    }
  }

  /** The next command to this device is acknowledged and then ignored. */
  dropNextCommand(deviceId: string): void {
    this.dropNext.add(deviceId)
  }

  // ── internals ───────────────────────────────────────────────────────────
  private apply(id: string, c: Command): void {
    const cur = this.states.get(id)
    if (!cur || cur.capability !== c.capability) return
    if (cur.capability === 'cover' && c.capability === 'cover') {
      this.targets.set(id, c.position) // travels; confirmed per tick
      return
    }
    const { capability: _a, ...patch } = c
    const next = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as DeviceState
    this.states.set(id, next)
    this.emit(id)
  }

  private tick(): void {
    const step = (100 / this.travelSeconds) * (this.tickMs / 1000)
    for (const [id, target] of this.targets) {
      const cur = this.states.get(id)
      if (cur?.capability !== 'cover') continue
      const delta = target - cur.position
      const position = Math.abs(delta) <= step ? target : cur.position + Math.sign(delta) * step
      this.states.set(id, { capability: 'cover', position: Math.round(position * 10) / 10 })
      if (position === target) this.targets.delete(id)
      this.emit(id)
    }
  }

  private emit(id: string): void {
    if (this.offline || this.silenced.has(id)) return
    const s = this.states.get(id)
    if (s) for (const h of this.stateHandlers) h(id, s)
  }

  private emitAll(): void {
    for (const id of this.states.keys()) this.emit(id)
  }
}
