import type { Runtime } from './boot'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Gives the demo property a believable evening: guests in, a DND, a make-up request, one AC that never reports (see index.ts). */
export async function seedDemo(rt: Runtime): Promise<void> {
  const sw = (room: string, local: string, on: boolean) =>
    rt.store.command(room, `${room}/${local}`, { capability: 'switch', on })
  await wait(300)
  for (const r of ['101', '102', '104', '105', '107']) await sw(r, 'occupied', true)
  await sw('102', 'dnd', true)
  await sw('104', 'makeup', true)
  await rt.store.command('101', '101/main_light', { capability: 'light', on: true, brightness: 60 })
  await rt.store.command('101', '101/bath_light', { capability: 'light', on: true })
  await sw('101', 'shower_heater', true)
  await rt.store.command('107', '107/curtain', { capability: 'cover', position: 30 })
  await wait(300)
  await rt.store.command('105', '105/ac', { capability: 'climate', setpointC: 22 }) // after the setback restore settles
}
