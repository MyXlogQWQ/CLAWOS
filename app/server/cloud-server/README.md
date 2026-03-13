# CLAWOS Cloud Server (Stage-0)

Local runnable cloud service for the Stage-0 scope in `ref-data/dev-steps.md`.

## Implemented APIs

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /devices/bind`
- `POST /sessions/create`
- `POST /relay/send`
- `GET /relay/pull`
- `POST /share/create`
- `POST /share/join`
- `GET /files/list`
- `GET /files/preview`

## Local Run

```bash
cd app/server/cloud-server
npm install
npm start
```

Server starts on `http://localhost:8787` by default.
Open `http://localhost:8787/` for the button-based local API console.

## Smoke Test (E2E)

Keep the server running, then execute:

```bash
cd app/server/cloud-server
npm run smoke
```

Optional custom server URL:

```bash
powershell -ExecutionPolicy Bypass -File ./scripts/e2e-smoke.ps1 -BaseUrl http://localhost:8787
```

## Notes

- This service stores ciphertext payloads only in relay messages (`content` is treated as encrypted blob).
- No key storage is implemented server-side.
- Data persistence is JSON file based (`data/db.json`) for local development speed.
