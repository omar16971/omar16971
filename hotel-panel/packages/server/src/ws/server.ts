import Fastify, { type FastifyInstance } from 'fastify'
import websocket from '@fastify/websocket'
import { parseClientMessage, type ServerMessage } from '@hotel-panel/shared'
import { MockAdapter } from '../adapters/mock'
import type { Runtime } from '../boot'
import { runScene } from '../scenes/run'

const DEV_PAGE = `<!doctype html><meta charset=utf-8><title>Mock controls</title>
<body style="font:16px system-ui;padding:1rem;max-width:30rem">
<h1>Mock adapter</h1>
<p><button onclick="post('offline',{offline:true})">Controller offline</button>
<button onclick="post('offline',{offline:false})">Back online</button></p>
<p><label>Latency ms <input id=l type=number value=150></label>
<button onclick="post('latency',{ms:+l.value})">Set</button></p>
<p><input id=d placeholder="101/main_light" size=24>
<button onclick="post('silent',{id:d.value,silent:true})">Force stale</button>
<button onclick="post('silent',{id:d.value,silent:false})">Resume</button>
<button onclick="post('drop',{id:d.value})">Drop next command</button></p>
<script>const post=(p,b)=>fetch('/dev/'+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)})</script>`

export async function buildServer(rt: Runtime): Promise<FastifyInstance> {
  const app = Fastify()
  await app.register(websocket)

  app.get('/ws', { websocket: true }, (socket) => {
    let room: string | undefined
    const send = (m: ServerMessage) => socket.send(JSON.stringify(m))
    const err = (code: string, message: string) => send({ t: 'error', code, message })

    const onState: Parameters<typeof rt.store.on<'state'>>[1] = (deviceId, reading) => {
      if (room && deviceId.startsWith(`${room}/`)) send({ t: 'state', room, deviceId, reading })
    }
    const onConn = (up: boolean) => send({ t: 'connection', up })
    rt.store.on('state', onState)
    rt.store.on('connection', onConn)
    socket.on('close', () => {
      rt.store.off('state', onState)
      rt.store.off('connection', onConn)
    })

    socket.on('message', async (data: Buffer) => {
      let raw: unknown
      try {
        raw = JSON.parse(data.toString())
      } catch {
        return err('bad_json', 'not JSON')
      }
      const msg = parseClientMessage(raw)
      if (!msg) return err('bad_message', 'unrecognised message')
      const cfg = rt.room(msg.room)
      if (!cfg) return err('unknown_room', msg.room)

      if (msg.t === 'hello') {
        room = msg.room
        send({
          t: 'snapshot',
          room,
          connected: rt.store.isUp(),
          devices: rt.store.devices(room),
          scenes: cfg.scenes.map(({ id, labelKey }) => ({ id, labelKey })),
        })
      } else if (msg.t === 'command') {
        rt.store.command(msg.room, msg.deviceId, msg.command).catch((e: Error) => err('command_failed', e.message))
      } else {
        const scene = cfg.scenes.find((s) => s.id === msg.sceneId)
        if (!scene) return err('unknown_scene', msg.sceneId)
        const r = await runScene(rt.store, msg.room, scene)
        send({ t: 'scene-result', room: msg.room, sceneId: r.sceneId, failed: r.failed })
      }
    })
  })

  if (process.env.NODE_ENV !== 'production' && rt.adapter instanceof MockAdapter) {
    const mock = rt.adapter
    app.get('/dev', async (_, reply) => reply.type('text/html').send(DEV_PAGE))
    app.post<{ Body: { offline: boolean } }>('/dev/offline', async (req) => mock.setOffline(req.body.offline))
    app.post<{ Body: { ms: number } }>('/dev/latency', async (req) => void (mock.latencyMs = req.body.ms))
    app.post<{ Body: { id: string; silent: boolean } }>('/dev/silent', async (req) =>
      mock.setSilent(req.body.id, req.body.silent),
    )
    app.post<{ Body: { id: string } }>('/dev/drop', async (req) => mock.dropNextCommand(req.body.id))
  }

  return app
}
