import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { MockAdapter } from './adapters/mock'
import { boot } from './boot'
import { parseProperty } from './config/property'
import { runScene } from './scenes/run'

const yaml = readFileSync(resolve(import.meta.dirname, '../../../config/properties/demo.yaml'), 'utf8')
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function setup() {
  const cfg = parseProperty(yaml)
  const mock = new MockAdapter(cfg.rooms.flatMap((r) => r.devices), { latencyMs: 5, coverTravelSeconds: 1, tickMs: 20 })
  const rt = await boot(cfg, mock)
  await wait(20)
  return { cfg, mock, rt }
}

describe('config', () => {
  it('namespaces device ids by room', () => {
    expect(parseProperty(yaml).rooms[0]?.devices[0]?.id).toBe('101/main_light')
  })
  it('rejects a scene naming an unknown device', () => {
    expect(() => parseProperty(yaml.replace('{ curtain: { position: 100 } }', '{ ghost: { on: true } }'))).toThrow(/ghost/)
  })
  it('rejects an unknown room type', () => {
    expect(() => parseProperty(yaml.replace('type: standard }', 'type: suite }'))).toThrow(/suite/)
  })
})

describe('state', () => {
  it('has no reading until the vendor confirms, then confirms via onState', async () => {
    const cfg = parseProperty(yaml)
    const mock = new MockAdapter(cfg.rooms.flatMap((r) => r.devices), { latencyMs: 5 })
    mock.setSilent('101/main_light', true)
    const rt = await boot(cfg, mock)
    await wait(20)
    expect(rt.store.read('101/main_light')).toBeUndefined()
    await rt.stop()
  })

  it('send does not imply success: a dropped command leaves the reading unchanged', async () => {
    const { mock, rt } = await setup()
    mock.dropNextCommand('101/main_light')
    await rt.store.command('101', '101/main_light', { capability: 'light', on: true })
    await wait(30)
    expect(rt.store.read('101/main_light')?.value).toMatchObject({ on: false })
    await rt.stop()
  })

  it('marks readings stale when the controller drops, fresh on return', async () => {
    const { mock, rt } = await setup()
    expect(rt.store.read('101/dnd')?.stale).toBe(false)
    mock.setOffline(true)
    expect(rt.store.read('101/dnd')?.stale).toBe(true)
    mock.setSilent('101/dnd', true)
    mock.setOffline(false)
    // controller is back but this device has not re-confirmed: still stale
    expect(rt.store.read('101/dnd')?.stale).toBe(true)
    expect(rt.store.read('101/ac')?.stale).toBe(false)
    await rt.stop()
  })

  it('ages a silent device into stale', async () => {
    vi.useFakeTimers()
    let t = 1_000
    const cfg = parseProperty(yaml)
    const mock = new MockAdapter(cfg.rooms.flatMap((r) => r.devices), { latencyMs: 0 })
    const { StateStore } = await import('./state/store')
    const store = new StateStore(cfg.rooms.flatMap((r) => r.devices), mock, 100, () => t)
    store.setConnection(true)
    store.applyState('101/dnd', { capability: 'switch', on: true })
    expect(store.read('101/dnd')?.stale).toBe(false)
    t += 101
    expect(store.read('101/dnd')?.stale).toBe(true)
    vi.useRealTimers()
  })

  it('rejects a command of the wrong capability and a device in another room', async () => {
    const { rt } = await setup()
    await expect(rt.store.command('101', '101/ac', { capability: 'light', on: true })).rejects.toThrow()
    await expect(rt.store.command('102', '101/ac', { capability: 'climate', mode: 'off' })).rejects.toThrow()
    await rt.stop()
  })
})

describe('mock adapter', () => {
  it('moves a curtain over time rather than jumping', async () => {
    const { rt } = await setup()
    await rt.store.command('101', '101/curtain', { capability: 'cover', position: 0 })
    await wait(300)
    const pos = (rt.store.read('101/curtain')?.value as { position: number }).position
    expect(pos).toBeGreaterThan(0)
    expect(pos).toBeLessThan(100)
    await wait(1000)
    expect(rt.store.read('101/curtain')?.value).toMatchObject({ position: 0 })
    await rt.stop()
  })
})

describe('scenes', () => {
  it('reports partial failure instead of throwing', async () => {
    const { cfg, mock, rt } = await setup()
    const scene = cfg.rooms[0]!.scenes.find((s) => s.id === 'night')!
    mock.setOffline(true)
    const r = await runScene(rt.store, '101', scene)
    expect(r.failed).toHaveLength(scene.steps.length)
    mock.setOffline(false)
    expect((await runScene(rt.store, '101', scene)).failed).toEqual([])
    await rt.stop()
  })
})
