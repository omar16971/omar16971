import { useEffect, useMemo, useState } from 'react'
import { deg, dirOf, pct, translate, type Lang } from '../i18n'
import { live, useRoom } from './useRoom'

const params = new URLSearchParams(location.search)
const ROOM = params.get('room') ?? '101'
const PHONE = params.get('phone') ?? '0'

const pad = (n: number) => String(n).padStart(2, '0')

/** Local-time night mode (blueprint: 22:00–06:00). `?night=1|0` forces it for demos. */
function isNight(d: Date): boolean {
  const forced = params.get('night')
  if (forced) return forced === '1'
  return d.getHours() >= 22 || d.getHours() < 6
}

export function Panel() {
  const [lang, setLang] = useState<Lang>(params.get('lang') === 'en' ? 'en' : 'ar')
  const [now, setNow] = useState(new Date())
  const room = useRoom(ROOM)
  const t = useMemo(() => (k: string, v?: Record<string, string>) => translate(lang, k, v), [lang])

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dirOf(lang)
  }, [lang])
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 10_000)
    return () => clearInterval(i)
  }, [])

  const night = isNight(now)
  const light = live(room, `${ROOM}/main_light`, 'light')
  const ac = live(room, `${ROOM}/ac`, 'climate')
  const curtain = live(room, `${ROOM}/curtain`, 'cover')
  const dnd = live(room, `${ROOM}/dnd`, 'switch')
  const makeup = live(room, `${ROOM}/makeup`, 'switch')
  const bathLight = live(room, `${ROOM}/bath_light`, 'light')
  const shower = live(room, `${ROOM}/shower_heater`, 'switch')
  const unreachable = !room.linked && room.empty

  return (
    <main className={`panel ${night ? 'night' : ''}`} data-lang={lang}>
      <header className="bar">
        <div className="clock">
          <span className="time">{pad(now.getHours())}:{pad(now.getMinutes())}</span>
          <span className="where">{t('property.demo01')} · {ROOM}</span>
        </div>
        <div className="bar-end">
          <span className={`dot ${room.linked && room.controllerUp ? 'ok' : 'down'}`} aria-hidden />
          <button className="lang" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{t('ui.language')}</button>
        </div>
      </header>

      {unreachable ? (
        <p className="notice">{t('ui.offline', { phone: PHONE })}</p>
      ) : room.empty ? (
        <p className="notice">{t('ui.waiting')}</p>
      ) : (
        <>
          <section className="scenes">
            {room.scenes.map((s) => (
              <button key={s.id} className={`scene scene-${s.id}`} onClick={() => room.scene(s.id)}>
                <span className="glyph" aria-hidden>{{ bright: '☀', relax: '☾', night: '●' }[s.id] ?? '○'}</span>
                {t(s.labelKey)}
              </button>
            ))}
          </section>

          <section className="controls">
            <Row label={t('device.main_light')} stale={light?.stale} staleText={t('ui.stale')} value={light ? pct(light.state.on ? light.state.brightness ?? 100 : 0) : '–'}>
              <input type="range" min={0} max={100} step={5} disabled={!light}
                value={light ? (light.state.on ? light.state.brightness ?? 100 : 0) : 0}
                onChange={(e) => {
                  const b = Number(e.target.value)
                  room.command(`${ROOM}/main_light`, { capability: 'light', on: b > 0, brightness: b })
                }} />
            </Row>

            <Row label={t('device.ac')} stale={ac?.stale} staleText={t('ui.stale')}
              value={ac ? `${t('ui.now')} ${deg(ac.state.currentC ?? NaN, 1)}` : '–'}>
              <div className="stepper">
                <button aria-label={t('ui.cooler')} disabled={!ac}
                  onClick={() => ac && room.command(`${ROOM}/ac`, { capability: 'climate', setpointC: ac.state.setpointC - 1 })}>−</button>
                <span className="set"><small>{t('ui.set')}</small>{ac ? deg(ac.state.setpointC) : '–'}</span>
                <button aria-label={t('ui.warmer')} disabled={!ac}
                  onClick={() => ac && room.command(`${ROOM}/ac`, { capability: 'climate', setpointC: ac.state.setpointC + 1 })}>+</button>
              </div>
            </Row>

            <Row label={t('device.curtain')} stale={curtain?.stale} staleText={t('ui.stale')} value={curtain ? pct(curtain.state.position) : '–'}>
              <input type="range" min={0} max={100} step={5} disabled={!curtain}
                value={curtain ? Math.round(curtain.state.position) : 0}
                onChange={(e) => room.command(`${ROOM}/curtain`, { capability: 'cover', position: Number(e.target.value) })} />
            </Row>
          </section>

          <section className="toggles">
            <Toggle label={t('device.bath_light')} state={bathLight && { state: { on: bathLight.state.on }, stale: bathLight.stale }} staleText={t('ui.stale')}
              onToggle={(on) => room.command(`${ROOM}/bath_light`, { capability: 'light', on })} />
            <Toggle label={t('device.shower_heater')} state={shower} staleText={t('ui.stale')}
              onToggle={(on) => room.command(`${ROOM}/shower_heater`, { capability: 'switch', on })} />
          </section>

          <section className="toggles">
            <Toggle label={t('device.dnd')} state={dnd} onToggle={(on) => room.command(`${ROOM}/dnd`, { capability: 'switch', on })} staleText={t('ui.stale')} />
            <Toggle label={t('device.makeup')} state={makeup} onToggle={(on) => room.command(`${ROOM}/makeup`, { capability: 'switch', on })} staleText={t('ui.stale')} />
          </section>
        </>
      )}
    </main>
  )
}

function Row(p: { label: string; value: string; stale?: boolean; staleText: string; children: React.ReactNode }) {
  return (
    <div className={`row ${p.stale ? 'stale' : ''}`}>
      <div className="row-head">
        <span className="label">{p.label}</span>
        <span className="value">{p.stale && <em>{p.staleText}</em>}{p.value}</span>
      </div>
      {p.children}
    </div>
  )
}

function Toggle(p: { label: string; state: { state: { on: boolean }; stale: boolean } | undefined; staleText: string; onToggle(on: boolean): void }) {
  const on = p.state?.state.on ?? false
  return (
    <button className={`toggle ${on ? 'on' : ''} ${p.state?.stale ? 'stale' : ''}`} disabled={!p.state}
      aria-pressed={on} onClick={() => p.onToggle(!on)}>
      <span>{p.label}</span>
      {p.state?.stale && <em>{p.staleText}</em>}
      <i className="switch" aria-hidden />
    </button>
  )
}
