# Room panel — architecture blueprint

A guest-facing room control panel and a staff dashboard for boutique hotels,
sitting on top of a third-party smart-home integration platform. English and
Arabic. Contract build, one property at a time, configured rather than forked.

This document is the starting brief for the repo. It records the decisions that
are expensive to change later and the reasoning behind each, so a later session
can disagree with one on purpose rather than by accident.

**Status of the unknowns.** The vendor platform is not yet known. Nor is the
panel hardware, the room count, or whether a PMS is in play. The architecture
below is shaped so that learning those does not invalidate it — which is the
main thing it is for.

---

## 1. The one decision everything else hangs on

**Nothing above the adapter layer may know which vendor it is talking to.**

The vendor is unknown today, Mahmoud sells more than one system, and a hotel
group may well run two. If vendor concepts leak upward — their device ids,
their state shape, their naming — then finding out which platform it is becomes
a rewrite, and adding a second one becomes a fork.

So:

```
┌─────────────────────────────────────────────────────────┐
│  SURFACES          guest panel · guest phone · staff     │   TypeScript/React
│                    speak only the internal device model  │
└────────────────────────────┬────────────────────────────┘
                             │  WebSocket, typed messages
┌────────────────────────────┴────────────────────────────┐
│  PROPERTY SERVER   authoritative state · scenes · rules  │   Node/TypeScript
│                    property.yaml · i18n catalogue        │   on-prem box
└────────────────────────────┬────────────────────────────┘
                             │  VendorAdapter interface  ← the boundary
┌────────────────────────────┴────────────────────────────┐
│  ADAPTER           one file per vendor. The ONLY code    │
│                    that knows their API exists.          │
└────────────────────────────┬────────────────────────────┘
                             │
                    the integration platform
```

The adapter interface is small on purpose:

```ts
interface VendorAdapter {
  connect(): Promise<void>
  disconnect(): Promise<void>
  /** Everything the vendor exposes, mapped to our model. Called once at boot. */
  discover(): Promise<DeviceDescriptor[]>
  /** Fire-and-forget. Confirmation arrives through onState, not a return value. */
  send(deviceId: string, command: Command): Promise<void>
  /** Push. Poll inside the adapter and synthesise this if the vendor has no push. */
  onState(handler: (deviceId: string, state: DeviceState) => void): void
  onConnectionChange(handler: (up: boolean) => void): void
}
```

Four rules for it:

1. **Vendor ids never leave the adapter.** It owns a map from their id to ours.
   Ours come from `property.yaml` and are stable across a vendor swap.
2. **`send` does not report success.** Hotel devices lie, and a vendor ACK is
   not the curtain moving. Truth arrives via `onState` or it did not happen.
3. **No vendor types in shared code.** If `@vendor/sdk` appears in an import
   outside `adapters/`, the boundary has already leaked.
4. **A mock adapter is a first-class citizen**, not a test fixture. See §7.

---

## 2. Device model

Model **capabilities**, not products. A dimmer is a dimmer whether it is KNX or
Zigbee, and the panel should never learn the difference.

```ts
type Capability = 'light' | 'climate' | 'cover' | 'switch' | 'scene' | 'sensor'

interface DeviceDescriptor {
  id: string                 // ours, from property.yaml. Stable forever.
  room: string
  capability: Capability
  labelKey: string           // an i18n key — NEVER a display string
  features: Feature[]        // 'dimmable' | 'colorTemp' | 'position' | 'fanSpeed'
  readOnly?: boolean
}

type DeviceState =
  | { capability: 'light';   on: boolean; brightness?: number; kelvin?: number }
  | { capability: 'climate'; mode: 'off'|'cool'|'heat'|'auto'; setpointC: number
                           ; currentC?: number; fan?: 'low'|'med'|'high'|'auto' }
  | { capability: 'cover';   position: number }          // 0 shut … 100 open
  | { capability: 'switch';  on: boolean }
  | { capability: 'sensor';  value: number | boolean; kind: string }

interface Reading<T> {
  value: T
  at: number                 // ms epoch, when the vendor last confirmed it
  stale: boolean             // no confirmation inside the freshness window
}
```

**`labelKey`, never a literal name.** The moment a device is called
`"Bedside Lamp"` in config, Arabic is a find-and-replace across YAML files. Keys
resolve through the i18n catalogue on the surface, in the surface's language.

**Every state is a `Reading`, and `stale` is rendered.** A panel showing a
confident "ON" for a light whose controller dropped twenty minutes ago is worse
than one showing nothing. This is the same rule the ALINE engine follows for
unmeasured joints: absence of evidence is not evidence, and it must not be
storable as a value.

---

## 3. What the two surfaces actually are

### Guest panel — eight controls, no settings, no login

The guest is a stranger, in the room for three nights, who will never read
anything and may be operating it at 1am in the dark. The vendor interface is
complicated because it is built for an owner who learns the system over months.
We are not simplifying it; we are building a different, much smaller thing and
using maybe 15% of the API.

```
  ┌──────────────────────────────────────┐
  │  22:14            ٢٢:١٤ / EN ⇄ ع     │   language toggle, always reachable
  │                                      │
  │   ☀ Bright    🌙 Relax    🌑 Night    │   SCENES FIRST — three or four,
  │                                      │   big, one tap, no submenu
  │   ──────────────────────────────     │
  │   Lights          ●───────○   60%    │
  │   Temperature     ◂  22°  ▸   24.1°  │   setpoint and actual, both visible
  │   Curtains        ▭▭▭▭▭▭░░░░  70%    │
  │                                      │
  │   ┌─────────────┐ ┌────────────────┐ │
  │   │ Do not       │ │ Make up        │ │   the two the guest actually uses
  │   │ disturb   ○  │ │ my room     ○  │ │
  │   └─────────────┘ └────────────────┘ │
  └──────────────────────────────────────┘
```

Rules that are not negotiable, because they are the product:

- **Scenes first, raw controls second.** Most guests tap a scene and never
  touch a slider.
- **No menu, no settings, no "more".** Anything that needs a second screen is
  not a guest feature.
- **Every control reflects real state**, and shows stale when it cannot.
- **Touch targets ≥ 48px**, because this is a wall panel operated with a thumb.
- **No guest login, ever.** The panel is the room's; possession is the auth.
- **A dark-adapted night mode** that triggers on local time. A full-brightness
  white panel at 03:00 is the single most complained-about thing in hotel rooms.

### Staff dashboard — this is what gets bought

Nobody buys a hotel system because the light switch is pretty. They buy
housekeeping visibility and an energy bill that drops.

- Room grid: occupied / vacant / DND / make-up-room / fault
- One room, expanded: current state, override controls, last-seen
- Unoccupied-room setback (AC to 26 °C when nobody is in) — the ROI line
- Fault list: devices not reporting, controller offline
- No PMS in v1 (see §8), so occupancy comes from DND + a staff toggle

---

## 4. Stack

| Layer | Choice | Why |
|---|---|---|
| Surfaces | React + Vite + **TypeScript**, PWA in a kiosk browser | One build runs on an in-wall Android panel, an iPad, and a phone. Native buys kiosk control you can get from the launcher instead. |
| Styling | Tailwind, **logical properties only** | `ms-4`, never `ml-4`. RTL stops being a port. |
| Server | **Node + TypeScript** (Fastify), on-prem | Shared types with the client across a WS boundary is the single biggest productivity win available on a project this size. |
| Transport | WebSocket both directions, typed envelopes | State is push-shaped. REST for commands adds a second path to keep consistent for nothing. |
| Config | `property.yaml` | §6. |
| State store | In-memory + a small SQLite journal | Nothing here needs a real database. SQLite is for staff history and surviving a reboot. |
| Cloud | **None in v1** | §5. |

**On Node over FastAPI.** Python is the more familiar stack, and for a bigger
backend it would win. Here the server is small and the value is in one `Message`
union type that the client and server both import, so a protocol change is a
compile error instead of a bug found on a wall in Giza. If the adapter turns out
to need a Python-only vendor SDK, run it as a sidecar process behind the same
adapter interface rather than moving the whole server.

---

## 5. On-prem, and offline is a feature

**The property server runs on a small box in the building.** The panel talks to
it over the LAN. There is no cloud dependency in the control path.

This is not an optimisation. A room whose lights stop working because an ADSL
line in Giza dropped is a product that gets ripped out, and the hotel's internet
will drop. Put it in the proposal as a feature, because the vendor's own cloud
offering probably cannot say it.

What that implies:

- Panel ⇄ server over LAN, mDNS or a static IP in the kiosk URL
- Server ⇄ vendor controller over LAN
- The panel **caches the last known state** and renders it marked stale on
  reconnect rather than showing an empty screen
- WebSocket reconnect with backoff, and a visible but unalarming connection dot
- If the panel cannot reach the server at all: show the room phone number. Fail
  to something a guest can act on.

Cloud, if it is ever added, is for remote monitoring and multi-property
management only — never in the path between a thumb and a light.

---

## 6. `property.yaml` — the thing that makes it a product-shaped contract

One file per property. Commissioning a new hotel is writing this file and
testing it, which is exactly what the per-property fee is for. No forks, no
per-site branches.

```yaml
property:
  id: pyramids-boutique-01
  name_key: property.pyramids01
  languages: [en, ar]
  default_language: ar
  timezone: Africa/Cairo
  night_mode: { from: "22:00", to: "06:00" }

vendor:
  adapter: <vendor>           # the only place the vendor is named
  host: 192.168.1.50
  # credentials come from .env, never from here

room_types:                   # layouts live here, not on rooms
  standard:
    devices:
      - { id: main_light,  capability: light,   features: [dimmable], label: device.main_light }
      - { id: bed_light,   capability: light,   features: [dimmable], label: device.bed_light }
      - { id: ac,          capability: climate, features: [fanSpeed], label: device.ac }
      - { id: curtain,     capability: cover,   features: [position], label: device.curtain }
      - { id: dnd,         capability: switch,  label: device.dnd }
      - { id: makeup,      capability: switch,  label: device.makeup }
    scenes:
      - id: bright
        label: scene.bright
        set: [ {main_light: {on: true, brightness: 100}},
               {bed_light:  {on: true, brightness: 80}},
               {curtain:    {position: 100}} ]
      - id: relax
        label: scene.relax
        set: [ {main_light: {on: false}},
               {bed_light:  {on: true, brightness: 30}} ]
      - id: night
        label: scene.night
        set: [ {main_light: {on: false}}, {bed_light: {on: false}},
               {curtain: {position: 0}}, {ac: {setpointC: 24}} ]

rooms:
  - { number: "101", type: standard, vendor_map: { main_light: "KNX/1/2/3", ac: "..." } }
  - { number: "102", type: standard, vendor_map: { ... } }
```

`vendor_map` is the only vendor-shaped thing in the file, and the adapter is the
only code that reads it.

---

## 7. Build the simulator first

**Before any vendor integration, write `MockAdapter`.** It implements the full
interface against an in-memory room: devices with plausible latency, state that
drifts, a controller that can be told to go offline, a curtain that takes eleven
seconds to travel.

This is not a nicety. It means:

- the entire UI gets built without the vendor hardware, which will not be on
  your desk most of the time
- every failure mode — stale state, offline controller, a command that never
  lands — is reproducible instead of waiting for it to happen in a hotel
- demos to Mahmoud and to developers work on a laptop
- the day the real adapter lands, the UI is already finished and the only new
  variable is the vendor

Give it a dev-only control page: toggle the controller offline, inject latency,
force a device stale. Those three switches will save more debugging time than
anything else in the repo.

---

## 8. Arabic and RTL as architecture, not styling

Most Arabic software in this category is machine-translated English in a flipped
layout and reads like it. Done properly this is the differentiator, and it is
cheap if decided now and expensive if retrofitted.

- **`dir` on `<html>`**, switched with language. Never per-component.
- **Logical CSS properties everywhere.** `margin-inline-start`, `padding-inline`,
  `inset-inline-start`. Tailwind's `ms-*`/`me-*`/`start-*`/`end-*`. A single
  `ml-4` in a component is a bug that only shows in Arabic.
- **Numerals: decide and write it down.** Egyptian hospitality generally uses
  Western digits (22°, not ٢٢°) even in Arabic copy. Pick one, put it in the
  i18n layer, do not let each component decide.
- **Icons: three classes.** Mirror (back arrows, progress), never mirror (play,
  clock, logos), and mirror-with-thought (sliders — the "more" end follows
  reading direction). Tag each icon at definition.
- **Type is not the Latin scale with a different font.** Arabic needs more line
  height and sits differently on the baseline. Pick a real Arabic face (IBM Plex
  Sans Arabic, Noto Kufi Arabic, Cairo) and give it its own scale.
- **Expansion: budget +30%** on Arabic strings against English and test the long
  one, not the short one.
- **No text baked into images, ever.**
- **Have the Arabic written, not translated.** A guest reading stilted Arabic in
  a Cairo hotel notices immediately.

Both languages on one panel, toggled in one tap, with the toggle always visible
in the same place in both directions.

---

## 9. Repo layout

```
hotel-panel/
├── packages/
│   ├── shared/          # types + protocol. Imported by both. No deps.
│   │   ├── devices.ts   # DeviceDescriptor, DeviceState, Command, Reading
│   │   └── protocol.ts  # the WS message union — the contract
│   ├── server/
│   │   ├── adapters/
│   │   │   ├── adapter.ts    # the interface. Nothing else exports vendor types.
│   │   │   ├── mock.ts       # build this first
│   │   │   └── <vendor>.ts   # the only file that imports their SDK
│   │   ├── state/            # authoritative store, staleness, reconciliation
│   │   ├── scenes/           # scene execution, ordering, partial failure
│   │   ├── config/           # property.yaml load + validate (zod)
│   │   └── ws/
│   └── ui/
│       ├── panel/            # the guest surface
│       ├── staff/            # the dashboard
│       ├── components/       # shared, RTL-safe
│       └── i18n/
│           ├── en.json
│           └── ar.json
├── config/
│   └── properties/<property>.yaml
└── docs/
    ├── COMMISSIONING.md      # how to bring up a new property — your fee
    └── DEVICE_CLASSES.md     # what v1 covers. The change-order boundary.
```

`DEVICE_CLASSES.md` is a contract document that happens to live in the repo.
When the fourth new device type is requested in month three, it is the thing you
point at.

---

## 10. Build order, which is also the payment schedule

| # | Deliverable | Demonstrable as |
|---|---|---|
| 1 | Shared types, protocol, mock adapter, server skeleton | A fake room changing state in a terminal |
| 2 | Guest panel against the mock, EN + AR complete | The real product on a laptop, both languages |
| 3 | Real vendor adapter, one real room | The panel driving actual hardware |
| 4 | Staff dashboard, setback rule | The dashboard a buyer sees |
| 5 | `property.yaml` for site one, commissioning, handover docs | Working rooms, signed off |

Milestone 2 is the one to demo to Mahmoud and to developers — it is visually
complete and needs no hardware. Milestone 3 is where the vendor's reality
arrives, so leave slack there, not in 2.

---

## 11. Explicitly out of v1

Written down because this list is the change-order boundary, and an unwritten
scope is a fixed fee that becomes an hourly rate without the hourly.

- Cloud, remote access, multi-property management
- PMS integration (Opera / Mews / Cloudbeds) — check-in-triggers-scene needs it
- Door locks, safes, minibar sensors
- Voice control
- Media and TV control beyond source select
- Energy reporting and charts (the *setback rule* is in; the dashboard is not)
- Guest phone as a second surface (design for it, do not build it)
- Scheduling and automation UI for staff
- Any second vendor

Each of these is a priced addition. Several are good v2s; one of them —
PMS — is where hotel software usually lives or dies, so price it as a project
rather than a feature when it comes.

---

## 12. Open questions, in the order they block work

1. **Which vendor platform, and what does the reseller licence say about a
   third-party front end?** Some are dealer-locked and contractually restrict
   this. Blocks milestone 3; does not block 1 or 2.
2. **What is physically on the wall?** In-wall Android panel, iPad, something
   proprietary? Sets the resolution, the kiosk strategy, and whether PWA is
   right. Blocks milestone 2's layout work.
3. **One layout per property, or per room type?** The YAML above assumes room
   types, which is the safer default and costs little.
4. **Device classes for v1** — the §11 boundary, agreed in writing with Mahmoud.
5. Room and property counts, and the deadline against the construction schedule.
6. Does the vendor push state, or must the adapter poll? Changes latency
   expectations and the staleness window; contained inside the adapter.
