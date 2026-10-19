# Optional private sync

Live messages always come from the desktop app's WebSocket. This server stores an encrypted copy of received messages in your own Cloudflare D1 database. Devices using the same chat token and private sync link can read that history. Without a sync link, acidum works locally and makes no requests to this server.

This repository contains generic code only. Deploy your own Worker and database. Never add a real token, private sync link, account ID, database ID, database export, or collector configuration to Git.

## Deploy a Worker and D1

Use a Cloudflare account on the Free plan and the [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/). No paid services are required.

From this directory:

```sh
cp wrangler.example.jsonc wrangler.jsonc
npx wrangler login
npx wrangler d1 create acidum-sync
```

Put the returned database ID in the ignored `wrangler.jsonc`. Choose a unique Worker name if needed. Keep `observability.enabled` disabled so request logs are not retained by this application.

```sh
npx wrangler d1 execute acidum-sync --remote --file schema.sql
```

Generate a private connection key and its hash locally:

```sh
node --input-type=module -e 'import { randomBytes, createHash } from "node:crypto"; const key = randomBytes(32).toString("base64url"); console.log("Connection key:", key); console.log("Secret hash:", createHash("sha256").update(key).digest("base64url"));'
```

Store the connection key somewhere private. Set `INSTANCE_KEY_HASH` to the **secret hash**, using Wrangler's interactive secret prompt:

```sh
npx wrangler secret put INSTANCE_KEY_HASH
npx wrangler deploy
```

The private sync link is `https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/#key=YOUR_CONNECTION_KEY`. Paste it into **Settings → Sync → Sync server link** and choose **Connect sync** on each device. The connection key is in the URL fragment, so opening the link does not send it as a URL query. The application sends it in a request header when syncing. Do not publish the link.

Existing loaded messages, retained log events, and optional local history are queued on connection. New incoming messages are queued automatically. **Sync now** retries immediately; normal syncing batches messages and polls about once a minute while the page is visible. Scroll up to load older cloud history. **Use device only** disables this device's sync connection without deleting the remote archive. Drafts, preferences, notification settings, and manually saved messages remain local.

## Encryption and duplicate prevention

The browser or collector derives separate encryption, authentication, and record-identity keys from the chat token with HKDF-SHA-256. Each message uses AES-256-GCM with a random nonce. Larger records are compressed before encryption. The Worker receives encrypted records, timestamps, event categories, and a derived authentication value; it never receives the original chat token or message text. Keep the token private: someone with both the token and sync link can access the same history.

A deterministic HMAC of the original receiving account and message key identifies each record. Device IDs and local row numbers do not affect identity. The database has a unique constraint on the token-derived vault and record ID. Simultaneous phone, desktop, and collector uploads therefore store one record, and the browser merges cloud, live, and local copies by their original identity. Public room copies received by different accounts still use the chat's existing room-aware display merging.

## Storage and Free-plan budgets

D1's Free plan allows 500 MB per database. This implementation targets **under 400,000,000 bytes**, including indexes, using D1's reported physical database size and a conservative per-record storage charge:

- Cleanup begins at 350 MB physical size or approximately 250 MB charged storage and removes the oldest encrypted records first, across this private instance.
- A serialized write lease prevents concurrent uploads from bypassing the size check. Writes stop at 380 MB physical size, leaving a margin below 400 MB. Unknown physical size also stops uploads.
- A database trigger separately refuses inserts above 280 MB charged storage.
- Hourly scheduled cleanup also runs when no browser is open. Deleted pages can be reused by SQLite; the file may keep its existing size.
- Application budgets allow at most 4,000 new records and 3,000 upload requests per UTC day, leaving room for index updates, counters, and deletions within the Free-plan write allowance. Additional activity on the same Cloudflare account still shares that account's quotas. Provider limits can defer sync before these application budgets are reached.

At a quota or capacity guard, uploads wait and retry. The live chat remains usable. This is a bound on writes made through this Worker, not a restriction on manual database edits or another service writing into the same database. Use a dedicated database. The server does not upgrade your plan.

See Cloudflare's [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [pricing and indexed-write accounting](https://developers.cloudflare.com/d1/platform/pricing/), and [database-size metadata](https://developers.cloudflare.com/d1/worker-api/return-object/).

## Optional collector

A Node.js 24 process can receive messages even while every browser is closed. It connects to the same upstream WebSocket and only requests history; it never sends chat messages, changes rooms, starts the desktop app, or changes its shutdown schedule. The desktop app must still be running and sending data. If it closes at night, the collector waits and reconnects when it becomes available. It cannot recover messages that the upstream server never retained or supplied.

Create a private file outside this repository, for example `~/.config/acidum/collector.json`:

```json
{
  "token": "YOUR_CHAT_TOKEN",
  "syncLink": "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/#key=YOUR_CONNECTION_KEY",
  "database": "/absolute/private/path/collector.sqlite",
  "statusFile": "/absolute/private/path/collector-status.json"
}
```

```sh
chmod 600 ~/.config/acidum/collector.json
node server/collector.mjs ~/.config/acidum/collector.json
```

The private SQLite buffer stores encrypted pending records and per-account cursors. A cursor is committed together with queued records, so restart does not advance past unsaved data. Replays overlap the last second and retain the same encrypted identity. The collector polls the upstream server once a minute, reconnects after errors or a stale connection, batches uploads, and retries after outages or quotas. It keeps running when the desktop app is offline.

The offline buffer is bounded: it trims the oldest pending records when ciphertext exceeds 40 MB, retaining approximately 35 MB. A prolonged outage or quota shortage can therefore lose the oldest unuploaded records. The browser's separate encrypted outbox retains up to 10,000 pending records per login and sync endpoint. Neither buffer promises unlimited retention.

For a persistent Linux user service, copy `acidum-collector.service.example` to `~/.config/systemd/user/acidum-collector.service`, adjust its Node path and checkout path, then:

```sh
systemctl --user daemon-reload
systemctl --user enable --now acidum-collector.service
loginctl enable-linger "$USER"
systemctl --user status acidum-collector.service
```

Linger keeps the user service available without an interactive login. It does not keep a powered-off server running. The status JSON contains connection state, pending count, timestamps, and generic error descriptions. It contains no message text, token, or connection key.

## Testing

Node.js 24 is required for the sync and collector tests, which use SQLite locally:

```sh
npm test
```

The browser sync suite uses two isolated browser profiles, synthetic WebSocket messages, and the real Worker code with a local D1 adapter. It does not access anyone's live chats. Run it with a production preview server and `npm run test:browser` as described in the main README.
