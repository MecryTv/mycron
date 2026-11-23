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
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }
}
```

Traefik: put the container on Traefik's network, remove the `ports:` block from `compose.yaml` and add a router for your domain with port 8080 as the service port.

`TRUST_PROXY=1` (set in `compose.yaml`) makes the service read the client address from `X-Forwarded-For`. That address is used to block an address after five wrong codes within an hour. Only keep it on behind a proxy.

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
- Revoke: in Discord `/works unlink` in the channel (all devices there), or `works discord unlink` on a computer. `/works status` lists the linked devices of a server.

## Security

| Topic | How |
|---|---|
| Bot token | Only in `.env` or a Docker secret on the server, never in the repository or the image. |
| Who may link | Only members with **Manage Server**. `/works` is restricted to them, and the service checks again. |
| Codes | 8 characters, valid for 10 minutes, single use. An address is blocked for an hour after 5 wrong codes. |
| Device keys | 256 bit, stored only as a SHA-256 hash, revocable at any time. |
| What a key may do | Post into its linked channel, edit and pin only the messages it created. At most 30 new messages, 120 edits and 10 pins per minute. |
| Mentions | Only the user who ran `/works link`, never `@everyone` or roles. |
| Contents | Messages pass through, nothing is stored except which message belongs to which key (30 days). |

## Limits

- Discord allows a bot 50 requests per second in total and 5 messages per 5 seconds per channel. works bundles its status posts, so this is enough for a few hundred users.
- From 100 servers on, Discord requires the bot to be verified (with the developer's ID).

## API

The routes mirror the Discord routes works uses, so works needs no second code path.

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

Every route except `/health`, `/v1/info` and `POST /v1/link` needs `Authorization: Bearer <device key>`.

## Development

```sh
node services/works-bot/test.mjs   # against a fake Discord, needs Node 22
```
