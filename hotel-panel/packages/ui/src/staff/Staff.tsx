import { useEffect, useMemo, useState } from 'react'
import type { DeviceView, RoomStatus, RoomSummary } from '@hotel-panel/shared'
import { deg, dirOf, pct, translate, type Lang } from '../i18n'
import { useStaff, type StaffView } from './useStaff'

const params = new URLSearchParams(location.search)
const STATUSES: RoomStatus[] = ['fault', 'dnd', 'makeup', 'occupied', 'vacant']

export function Staff() {
  const [lang, setLang] = useState<Lang>(params.get('lang') === 'ar' ? 'ar' : 'en')
  const [filter, setFilter] = useState<RoomStatus | 'all'>('all')
  const [open, setOpen] = useState<string | null>(params.get('room'))
  const [now, setNow] = useState(Date.now())
  const view = useStaff()
  const t = useMemo(() => (k: string, v?: Record<string, string>) => translate(lang, k, v), [lang])

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dirOf(lang)
  }, [lang])
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(i)
  }, [])

  const ago = (ts?: number) => {
    if (ts === undefined) return t('staff.never')
    const s = Math.max(0, Math.round((now - ts) / 1000))
    if (s < 5) return t('staff.ago_now')
    if (s < 60) return t('staff.ago_s', { n: String(s) })
    if (s < 3600) return t('staff.ago_m', { n: String(Math.round(s / 60)) })
    return t('staff.ago_h', { n: String(Math.round(s / 3600)) })
  }

  const counts = Object.fromEntries(STATUSES.map((s) => [s, view.summaries.filter((r) => r.status === s).length])) as Record<RoomStatus, number>
  const shown = view.summaries.filter((r) => filter === 'all' || r.status === filter)
  const faulty = view.summaries.filter((r) => r.faults.length)
  const selected = open ? view.rooms[open] : undefined

  return (
    <div className="staff" data-lang={lang}>
      <header className="s-bar">
        <div>
          <h1>{t('staff.title')}</h1>
          <p>{t('property.demo01')} · {t('staff.subtitle')}</p>
        </div>
        <button className="s-lang" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{t('ui.language')}</button>
      </header>

      {!view.linked ? (
        <div className="s-banner bad">{t('staff.link_down')}. {t('staff.unreachable_help')}</div>
      ) : !view.controllerUp ? (
        <div className="s-banner warn">{t('staff.controller_down')}</div>
      ) : null}

      <nav className="s-filters">
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>{t('staff.all')} <b>{view.summaries.length}</b></button>
        {STATUSES.map((s) => (
          <button key={s} className={`${filter === s ? 'on' : ''} st-${s}`} onClick={() => setFilter(s)}>
            <i className="swatch" />{t(`status.${s}`)} <b>{counts[s]}</b>
          </button>
        ))}
      </nav>

      <div className="s-main">
        <section className="s-grid">
          {shown.map((r) => (
            <button key={r.room} className={`card st-${r.status} ${open === r.room ? 'sel' : ''}`} onClick={() => setOpen(r.room)}>
              <div className="card-top">
                <span className="num">{r.room}</span>
                <span className="badge">{t(`status.${r.status}`)}</span>
              </div>
              <div className="temps">
                <span>{r.currentC !== undefined ? deg(r.currentC, 1) : '–'}</span>
                {r.setpointC !== undefined && <small><span className="arrow">→</span> {deg(r.setpointC)}</small>}
              </div>
              <div className="card-foot">
                {r.setback && <span className="tag setback">{t('staff.setback')}</span>}
                {r.faults.length > 0 && <span className="tag fault">{t('status.fault')} · {r.faults.length}</span>}
                <small className="seen">{ago(r.lastSeen)}</small>
              </div>
            </button>
          ))}
        </section>

        <aside className="s-side">
          {selected && open ? (
            <RoomDetail room={open} data={selected.devices} scenes={selected.scenes} summary={view.summaries.find((s) => s.room === open)!}
              view={view} t={t} ago={ago} onClose={() => setOpen(null)} />
          ) : (
            <FaultList faulty={faulty} t={t} ago={ago} onPick={setOpen} lang={lang} />
          )}
        </aside>
      </div>
    </div>
  )
}

function FaultList(p: { faulty: RoomSummary[]; t: (k: string, v?: Record<string, string>) => string; ago(ts?: number): string; onPick(r: string): void; lang: Lang }) {
  const { t } = p
  return (
    <div className="panelbox">
      <h2>{t('staff.faults')}</h2>
      {p.faulty.length === 0 ? <p className="muted">{t('staff.no_faults')}</p> : (
        <ul className="faults">
          {p.faulty.flatMap((r) => r.faults.map((id) => (
            <li key={id}>
              <button onClick={() => p.onPick(r.room)}>
                <b>{r.room}</b> <span>{t(`device.${id.split('/')[1]}`)}</span>
                <small>{t('staff.not_reporting')} · {p.ago(r.lastSeen)}</small>
              </button>
            </li>
          )))}
        </ul>
      )}
    </div>
  )
}

function RoomDetail(p: { room: string; data: DeviceView[]; scenes: { id: string; labelKey: string }[]; summary: RoomSummary; view: StaffView; t: (k: string, v?: Record<string, string>) => string; ago(ts?: number): string; onClose(): void }) {
  const { room, t, view } = p
  const dev = (l: string) => p.data.find((d) => d.descriptor.id === `${room}/${l}`)
  const sw = (l: string) => { const s = dev(l)?.reading?.value; return s?.capability === 'switch' ? s.on : false }
  const ac = (() => { const s = dev('ac')?.reading?.value; return s?.capability === 'climate' ? s : undefined })()
  const flip = (l: string) => view.command(room, `${room}/${l}`, { capability: 'switch', on: !sw(l) })

  const describe = (d: DeviceView): string => {
    const s = d.reading?.value
    if (!s) return '–'
    switch (s.capability) {
      case 'light': return s.on ? pct(s.brightness ?? 100) : t('staff.off')
      case 'switch': return s.on ? t('staff.on') : t('staff.off')
      case 'cover': return pct(s.position)
      case 'climate': return `${deg(s.setpointC)} (${deg(s.currentC ?? NaN, 1)})`
      default: return String(s.value)
    }
  }

  return (
    <div className="panelbox">
      <div className="detail-head">
        <h2>{room} <span className={`badge st-${p.summary.status}`}>{t(`status.${p.summary.status}`)}</span></h2>
        <button className="x" onClick={p.onClose} aria-label={t('staff.close')}>×</button>
      </div>
      <p className="muted">{t('staff.last_seen')}: {p.ago(p.summary.lastSeen)}{p.summary.setback ? ` · ${t('staff.setback_hint', { c: deg(p.summary.setpointC ?? NaN) })}` : ''}</p>

      <h3>{t('staff.overrides')}</h3>
      <div className="btns">
        <button className={sw('occupied') ? 'on' : ''} onClick={() => flip('occupied')}>{sw('occupied') ? t('staff.mark_occupied') : t('staff.vacant_btn')}</button>
        {sw('dnd') && <button onClick={() => flip('dnd')}>{t('device.dnd')} · {t('staff.clear')}</button>}
        {sw('makeup') && <button onClick={() => flip('makeup')}>{t('device.makeup')} · {t('staff.clear')}</button>}
        <button onClick={() => ac && view.command(room, `${room}/ac`, { capability: 'climate', setpointC: ac.setpointC - 1 })}>{deg(-1, 0, true)} {t('device.ac')}</button>
        <button onClick={() => ac && view.command(room, `${room}/ac`, { capability: 'climate', setpointC: ac.setpointC + 1 })}>{deg(1, 0, true)} {t('device.ac')}</button>
        <button onClick={() => view.command(room, `${room}/curtain`, { capability: 'cover', position: 100 })}>{t('device.curtain')} · {t('staff.open')}</button>
        <button onClick={() => view.command(room, `${room}/curtain`, { capability: 'cover', position: 0 })}>{t('device.curtain')} · {t('staff.shut')}</button>
      </div>
      <div className="btns">
        {p.scenes.map((s) => <button key={s.id} className="ghost" onClick={() => view.scene(room, s.id)}>{t(s.labelKey)}</button>)}
      </div>

      <h3>{t('staff.devices')}</h3>
      <table className="devtable"><tbody>
        {p.data.map((d) => (
          <tr key={d.descriptor.id} className={!d.reading || d.reading.stale ? 'bad' : ''}>
            <td>{t(d.descriptor.labelKey)}</td>
            <td className="val">{describe(d)}</td>
            <td className="when">{!d.reading ? t('staff.never') : d.reading.stale ? t('staff.not_reporting') : ''}</td>
          </tr>
        ))}
      </tbody></table>
    </div>
  )
}
