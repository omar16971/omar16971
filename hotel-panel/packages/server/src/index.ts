import { resolve } from 'node:path'
import { boot } from './boot'
import { loadProperty } from './config/property'
import { buildServer } from './ws/server'

const file = process.env.PROPERTY ?? resolve(import.meta.dirname, '../../../config/properties/demo.yaml')
const port = Number(process.env.PORT ?? 3000)

const rt = await boot(loadProperty(file))
const app = await buildServer(rt)
await app.listen({ port, host: '0.0.0.0' })
console.log(`property ${rt.config.id} on :${port}  (ws /ws${rt.config.adapter === 'mock' ? ', mock controls /dev' : ''})`)

for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, async () => {
    await app.close()
    await rt.stop()
    process.exit(0)
  })
