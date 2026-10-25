import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { summariseRoom } from '@hotel-panel/shared'
import { MockAdapter } from './adapters/mock'
import { boot } from './boot'
import { parseProperty } from './config/property'
import { startSetback } from './rules/setback'

const yaml = readFileSync(resolve(import.meta.dirname, '../../../config/properties/demo.yaml'), 'utf8')
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function setup() {
  const cfg = parseProperty(yaml)
  const mock = new MockAdapter(cfg.rooms.flatMap((r) => r.devices), { latencyMs: 5, tickMs: 20 })
  const rt = await boot(cfg, mock)
  await wait(30)
  return { rt, mock }
}

describe('room summary', () => {
  it('ranks fault above dnd above makeup above occupied above vacant', async () => {
    const { rt, mock } = await setup()
    const sum = () => summariseRoom('101', rt.store.devices('101'))
    expect(sum().status).toBe('vacant')
    await rt.store.command('101', '101/occupied', { capability: 'switch', on: true })
    await wait(20)
    expect(sum().status).toBe('occupied')
    await rt.store.command('101', '101/makeup', { capability: 'switch', on: true })
    await wait(20)
    expect(sum().status).toBe('makeup')
    await rt.store.command('101', '101/dnd', { capability: 'switch', on: true })
    await wait(20)
    expect(sum().status).toBe('dnd')
    mock.setOffline(true)
    expect(sum().status).toBe('fault')
    await rt.stop()
  })

  it('a device that never reported is a fault, not a default value', async () => {
    const cfg = parseProperty(yaml)
    const mock = new MockAdapter(cfg.rooms.flatMap((r) => r.devices), { latencyMs: 5 })
    mock.setSilent('101/ac', true)
    const rt = await boot(cfg, mock)
    await wait(30)
    const s = summariseRoom('101', rt.store.devices('101'))
    expect(s.status).toBe('fault')
    expect(s.faults).toEqual(['101/ac'])
    await rt.stop()
  })
})

describe('setback', () => {
  it('parks the AC when vacant and restores the guest setpoint on occupy', async () => {
    const { rt } = await setup()
    startSetback(rt)
    const sp = () => (rt.store.read('101/ac')?.value as { setpointC: number }).setpointC
    await rt.store.command('101', '101/occupied', { capability: 'switch', on: true })
    await wait(30)
    await rt.store.command('101', '101/ac', { capability: 'climate', setpointC: 21 })
    await wait(30)
    expect(sp()).toBe(21)
    await rt.store.command('101', '101/occupied', { capability: 'switch', on: false })
    await wait(60)
    expect(sp()).toBe(26)
    expect(summariseRoom('101', rt.store.devices('101'), 26).setback).toBe(true)
    await rt.store.command('101', '101/occupied', { capability: 'switch', on: true })
    await wait(60)
    expect(sp()).toBe(21)
    await rt.stop()
  })
})
