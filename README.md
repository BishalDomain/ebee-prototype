# eBee Prototype

This workspace includes a zero-dependency conversational commerce prototype for eBee with a cleaner customer-facing chat UI.

## Files

- `index.html`: app shell
- `styles.css`: visual system and responsive layout
- `app.js`: session state, orchestration, and domain logic
- `server.js`: tiny local static server
- `eBee_Detailed_Developer_Playbook.md`: product and engineering playbook

## Run locally

```powershell
node server.js
```

Then open `http://localhost:3000`.

## Prototype coverage

- grocery chat flow
- food ordering flow
- fruit ordering flow
- ride quote flow
- guided chat suggestions and quick starts
- animated response handling with typing state
- compact order sheet and checkout summary
- mock payment verification step
- service-layer structure ready for real API integration

## Next build steps

1. Replace mock catalog and ride data with real APIs.
2. Move orchestration from `app.js` into FastAPI services.
3. Connect Razorpay order creation and verification.
4. Add address search, auth, session persistence, and admin telemetry.
