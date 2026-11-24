# works-bot

The shared Discord bot for [works](../../plugins/works). Users invite it to their server, run `/works link` in a channel and enter the one-time code in works. Nobody needs to create a bot of their own.

works-bot is the only place that knows the bot token. Each works installation gets a device key when it links. With that key it may post into its linked channel only, and edit or pin only the messages it created itself. The service stores no message contents.

```
works on a computer  --HTTPS, device key-->  works-bot (Docker, bot token)  --REST/gateway-->  Discord
```

If the service is down, works keeps its events in its outbox and sends them later.

## What you need

- A server with Docker and Docker Compose.
- A domain or subdomain (for example `works.example.com`) with a reverse proxy that does TLS: Caddy, nginx or Traefik.
- A Discord application for the shared bot.

## 1. Create the Discord application

1. Open https://discord.com/developers/applications, then **New Application**, name it `works`.
2. **Bot**: click **Reset Token** and copy the token. Leave **Public Bot** on, so others can invite it. No privileged gateway intents are needed.
3. Optional: set an avatar and a description on the **General Information** page.

The invite link with the right permissions comes from the service itself (`/v1/info`). The permissions are: view channel, send messages, embed links, read message history, pin messages, plus the slash command scope.

## 2. Start the service

On the server, in a checkout of this repository:

```sh
cd services/works-bot
cp .env.example .env
nano .env               # DISCORD_TOKEN=<the token>
chmod 600 .env
docker compose up -d --build
docker compose logs -f  # "works-bot works listening on 0.0.0.0:8080"
```

The service listens on `127.0.0.1:8787`, reachable only from the server itself. Its data (links, message ownership) lives in the volume `works-bot-data`.

If you prefer Docker secrets: set `DISCORD_TOKEN_FILE` to the path of a file that contains the token, instead of `DISCORD_TOKEN`.

Optional settings in `.env`: `WORKS_BOT_GUILD_CAP` (devices per server, default 20), `WORKS_BOT_MSG_CAP` (remembered messages per device, default 300).

## 3. Reverse proxy

Caddy:

```
works.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

nginx (with a certificate from certbot):

```nginx
server {
    server_name works.example.com;
    listen 443 ssl;
    # ssl_certificate ... (certbot)
    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header Host $host;
    }
}
```

Traefik: put the container on Traefik's network, remove the `ports:` block from `compose.yaml` and add a router for your domain with port 8080 as the service port.

`TRUST_PROXY=1` (set in `compose.yaml`) makes the service take the client address from the last `X-Forwarded-For` entry, the one your proxy adds; earlier entries come from the client and are ignored. That address is used to block it for an hour after five wrong codes. Only keep it on behind a proxy that sets the header (Caddy, nginx as above, Traefik).

Check it:

```sh
curl https://works.example.com/health   # {"ok":true,"gateway":true}
curl https://works.example.com/v1/info  # app id, bot name, invite link
```

## 4. Tell works the address

Until the address is built into the works plugin, set it per computer:

```sh
works discord set service=https://works.example.com
works discord                    # shows the invite link and the next steps
```

Then in Discord, in the channel works should post to: `/works link` (shown as `/works verbinden` in German Discord clients). Enter the code: `works discord link ABCD-2345`.

## Operation

- Update: `git pull && docker compose up -d --build`
- Logs: `docker compose logs -f works-bot`. They contain no tokens, keys or message contents.
- Backup: the volume `works-bot-data` (`links.json`). Without it, every device has to link again.
- Revoke: in Discord `/works unlink` in the channel (all devices there), or `works discord unlink` on a computer. `/works help` lists the linked devices of a server, broken ones marked.
- If `links.json` is not valid JSON, the service refuses to start instead of overwriting it. Fix the file or restore it from the backup.

## Security

| Topic | How |
|---|---|
| Bot token | Only in `.env` or a Docker secret on the server, never in the repository or the image. |
| Who may link | Only members with **Manage Server**. `/works` is restricted to them, and the service checks again. |
| Codes | 8 characters (32^8 ≈ 10^12 possibilities), valid for 10 minutes, single use. An address (IPv6: its /64) is blocked for an hour after 5 wrong codes. |
| Device keys | 256 bit, stored only as a SHA-256 hash, revocable at any time. |
| What a key may do | Post into its linked channel, edit, pin and delete only the messages it created (the newest 300 per device). At most 30 new messages, 120 edits, 10 pins and 60 deletions per minute. |
| Devices | At most 20 per server. Links unused for 90 days expire. `/works link` only hands out a code if the bot can view, post and embed in the channel. |
| Broken links | If Discord denies the channel (bot removed, permissions taken away, channel deleted), the link is marked broken and works gets status 410: its bot stops and asks to link again, instead of failing over and over. |
| Discord bans | Discord bans an IP after 10 000 answers with 401, 403 or 429 in 10 minutes. The service paces all calls (40 per second) and pauses posting for everyone above 5 000 such answers. |
| Mentions | Only the user who ran `/works link`, never `@everyone` or roles. |
| Commands and buttons | Only the user who ran `/works link` may use them; everyone else gets a refusal. Clicks go to the device that wrote the message, commands to the device of whoever typed them in the channel that was active last. Devices may only attach buttons and select menus with the works scheme (`w:…`), so a click can never reach another device. The interaction token stays in the service; answers are visible only to the person who clicked. |
| Files | Only the dashboard image: one PNG of at most 256 KB per message, sent as base64 in JSON and passed on to Discord. |
| Contents | Messages pass through, nothing is stored except which message belongs to which key (30 days). |

## Limits

- Discord allows a bot 50 requests per second in total and 5 messages per 5 seconds per channel. works bundles its dashboard edits, so this is enough for a few hundred users.
- From 100 servers on, Discord requires the bot to be verified (with the developer's ID).

## Commands and buttons

`/works help`, `link` and `unlink` are answered by the service. `status`, `tasks`, `new` and `instruct` and every click go to a device: the service answers Discord at once with a deferred reply (Discord waits only 3 seconds) and puts the request into the device's inbox. Dialogs (back to Claude, instruction, new task) cannot be deferred, the service opens them itself; the device gets the answer from the dialog. works fetches its inbox with a long poll and answers through the service. If no device fetches a request within 10 seconds, the service tells the user that the computer seems to be off, or that works there needs an update if that device never asked for its inbox.

## API

The message routes mirror the Discord routes works uses, so works needs no second code path for messages.

| Route | Purpose |
|---|---|
| `GET /health` | Liveness and gateway state |
| `GET /v1/info` | Public: app id, bot name, invite link |
| `POST /v1/link {code, device}` | Exchange a code for a device key |
| `DELETE /v1/link` | Revoke the own key |
| `GET /v1/users/@me` | Check the key |
| `POST /v1/channels/:id/messages` | New message in the linked channel |
| `PATCH /v1/channels/:id/messages/:mid` | Edit an own message |
| `PUT /v1/channels/:id/messages/pins/:mid` | Pin an own message |
| `DELETE /v1/channels/:id/messages/:mid` | Delete an own message (the channel cleans itself up) |
| `GET /v1/inbox?wait=s&ack=ids` | Commands and clicks for this device, long poll up to 25 s. `ack` confirms the ids of the last answer; unconfirmed ones come again |
| `POST /v1/interactions/:id/reply` | Answer one of them (only once, only the own) |
| `GET /v1/guild/channels` | Text channels of the linked server by category, with `can` (the bot may view, send and embed) and `missing` |
| `POST /v1/link/channel {channel_id}` | Move the link to another channel of the same server, only one the bot can post in. Own messages in the channels left behind stay editable and deletable, so the device can remove its old dashboard |

Every route except `/health`, `/v1/info` and `POST /v1/link` needs `Authorization: Bearer <device key>`.

## Development

```sh
node services/works-bot/test.mjs   # against a fake Discord, needs Node 22
```
