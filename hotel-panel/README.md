# hotel-panel

Guest room panel + staff dashboard over a third-party smart-home platform. EN/AR.
Architecture and the reasoning behind it: [docs/BLUEPRINT.md](docs/BLUEPRINT.md).

## Status

Milestones 1 and 2 of the blueprint (§10) against the mock, plus the staff dashboard and setback rule from milestone 4. No real vendor yet.

| Done | Not yet |
|---|---|
| `packages/shared` device model + WS protocol | Real hardware, PWA/kiosk packaging |
| `VendorAdapter` interface, `MockAdapter` | Real vendor adapter (vendor unknown) |
| `property.yaml` load + validation (zod) | SQLite journal |
| State store with derived staleness | |
| Guest panel, EN + AR, night mode | |
| Staff dashboard, EN + AR: room grid, faults, overrides | |
| Unoccupied-room setback rule (`rules.setback` in the yaml) | Reviewed Arabic copy (current strings are a first draft) |
| Scene runner with partial failure | i18n catalogue, `COMMISSIONING.md`, `DEVICE_CLASSES.md` |

## Run

```
npm install
npm test          # vitest
npm run typecheck
npm run demo      # fake room changing state in the terminal
npm run serve     # WS on :3000/ws, mock controls on :3000/dev
npm run dev -w @hotel-panel/ui   # UI on :5173
```

- Guest panel: `http://localhost:5173/?room=101&lang=ar` (`lang=en|ar`, `night=1` forces night mode)
- Staff dashboard: `http://localhost:5173/staff?lang=en` (`room=106` opens a room)
- Screenshots: `docs/screens/`

The demo server seeds a believable evening (guests in, a DND, a make-up request) and room 106's AC never reports, so the dashboard has a fault to show. `DEMO_SEED=0` turns that off.

Set `PROPERTY=<path>` to load a different `property.yaml`; the demo one is `config/properties/demo.yaml`.
