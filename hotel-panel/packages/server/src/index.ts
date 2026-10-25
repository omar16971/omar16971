import { resolve } from 'node:path'
import { MockAdapter } from './adapters/mock'
import { boot } from './boot'
import { loadProperty } from './config/property'
import { seedDemo } from './demo-seed'
import { startSetback } from './rules/setback'
import { buildServer } from './ws/server'

const file = process.env.PROPERTY ?? resolve(import.meta.dirname, '../../../config/properties/demo.yaml')
const port = Number(process.env.PORT ?? 3000)

const config = loadProperty(file)
const seeding = config.adapter === 'mock' && process.env.DEMO_SEED !== '0'
// Demo only: room 106's AC controller is dead from the start, so the dashboard has a fault to show.
const mock = seeding ? new MockAdapter(config.rooms.flatMap((r) => r.devices)) : undefined
mock?.setSilent('106/ac', true)
const rt = await boot(config, mock)
startSetback(rt)
const app = await buildServer(rt)
await app.listen({ port, host: '0.0.0.0' })
console.log(`property ${rt.config.id} on :${port}  (ws /ws${rt.config.adapter === 'mock' ? ', mock controls /dev' : ''})`)

if (seeding) void seedDemo(rt)

for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, async () => {
    await app.close()
    await rt.stop()
    process.exit(0)
  })
