import { resolve } from 'node:path'
import { MockAdapter } from './adapters/mock'
import { boot } from './boot'
import { loadProperty } from './config/property'
import { runScene } from './scenes/run'

const cfg = loadProperty(resolve(import.meta.dirname, '../../../config/properties/demo.yaml'))
const descriptors = cfg.rooms.flatMap((r) => r.devices)
const mock = new MockAdapter(descriptors, { latencyMs: 100, coverTravelSeconds: 3 })
const rt = await boot(cfg, mock)

const t0 = Date.now()
rt.store.on('state', (id, r) => {
  const { capability: _c, ...v } = r.value
  console.log(`+${String(Date.now() - t0).padStart(5)}ms  ${id.padEnd(16)} ${JSON.stringify(v)}${r.stale ? '  STALE' : ''}`)
})
rt.store.on('connection', (up) => console.log(`+${String(Date.now() - t0).padStart(5)}ms  controller ${up ? 'up' : 'DOWN'}`))

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
await wait(200)
console.log('\n— scene: night (room 101)')
const night = rt.room('101')!.scenes.find((s) => s.id === 'night')!
await runScene(rt.store, '101', night)
await wait(3500)
console.log('\n— controller drops')
mock.setOffline(true)
await wait(300)
console.log('\n— controller returns')
mock.setOffline(false)
await wait(300)
await rt.stop()
