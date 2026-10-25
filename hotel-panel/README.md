# hotel-panel

Guest room panel + staff dashboard over a third-party smart-home platform. EN/AR.
Architecture and the reasoning behind it: [docs/BLUEPRINT.md](docs/BLUEPRINT.md).

## Status

Milestone 1 of the blueprint (§10): shared types, protocol, `MockAdapter`, server skeleton.

| Done | Not yet |
|---|---|
| `packages/shared` device model + WS protocol | Guest panel and staff UI (`packages/ui`) |
| `VendorAdapter` interface, `MockAdapter` | Real vendor adapter (vendor unknown) |
| `property.yaml` load + validation (zod) | SQLite journal |
| State store with derived staleness | Unoccupied-room setback rule |
| Scene runner with partial failure | i18n catalogue, `COMMISSIONING.md`, `DEVICE_CLASSES.md` |

## Run

```
npm install
npm test          # vitest
npm run typecheck
npm run demo      # fake room changing state in the terminal
npm run serve     # WS on :3000/ws, mock controls on :3000/dev
```

Set `PROPERTY=<path>` to load a different `property.yaml`; the demo one is `config/properties/demo.yaml`.
