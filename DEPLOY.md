# Deploying Acuity (free, on an Oracle Cloud Always-Free VM)

Runs the whole stack — backend + Redis + frontend + Caddy (auto HTTPS / `wss`) — on one always-free
ARM VM via [docker-compose.prod.yml](docker-compose.prod.yml). Postgres + Auth stay on Supabase
(free). No cold starts, $0/month.

Single domain, path-based routing: Caddy sends `/auth`, `/sessions`, `/ws`, `/health` to the
backend and everything else to the Next.js frontend, so you only need one domain + one cert.

## 1. Create the VM

1. [Oracle Cloud](https://www.oracle.com/cloud/free/) → sign up (needs a card for identity; the
   **Always Free** Ampere A1 resources are never charged).
2. **Compute → Instances → Create**. Image: **Ubuntu 22.04**. Shape: **VM.Standard.A1.Flex**
   (Ampere/ARM) — give it ~2 OCPU / 12 GB (within the free 4 OCPU / 24 GB). Download the SSH key.
3. **Networking → open 80 + 443.** Oracle blocks ingress at *two* layers — open both:
   - VCN → the instance's subnet → **Security List** → add Ingress rules for TCP **80** and **443**
     from `0.0.0.0/0`.
   - On the VM, the Ubuntu image also ships restrictive iptables:
     ```bash
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```

## 2. Point a free domain at it

Caddy needs a real hostname for the TLS cert. [DuckDNS](https://www.duckdns.org) is free: sign in,
create a subdomain (e.g. `acuity-yourname`), and set its IP to the VM's **public IP**. You now have
`acuity-yourname.duckdns.org`.

## 3. Install Docker on the VM

```bash
ssh -i <your-key> ubuntu@<vm-public-ip>
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && newgrp docker   # run docker without sudo
```

## 4. Configure + launch

```bash
git clone https://github.com/PhyoTh/DevLens.git && cd DevLens
cp deploy/.env.example deploy/.env
nano deploy/.env          # fill everything in (see notes below)

docker compose --env-file deploy/.env -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f   # watch it come up
```

`deploy/.env` notes:
- **`ACUITY_DOMAIN`, `FRONTEND_ORIGIN`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`** all use the
  same DuckDNS host (API/WS share the domain). Use `https://` for the origins and **`wss://`** for
  `NEXT_PUBLIC_WS_URL`; `ACUITY_DOMAIN` is the bare host (no scheme).
- **`DATABASE_URL`** must be the Supabase **Session pooler** (port **5432**, `...pooler.supabase.com`)
  in `postgresql+asyncpg://...` form — the direct host is IPv6-only and the transaction pooler
  (6543) breaks asyncpg's prepared statements (Alembic needs them).
- `REDIS_URL` is ignored here — the compose points the backend at the internal `redis` service.
- Keep `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE` = `false` for a real deployment.

The backend runs `alembic upgrade head` on boot, so migrations apply automatically.

## 5. Supabase config for the live URL

Supabase dashboard → **Authentication → URL Configuration**: set **Site URL** to
`https://acuity-yourname.duckdns.org` and add it to **Redirect URLs**. Decide whether to keep
**Confirm email** on (safer for prod, but signups then need an inbox round-trip).

## 6. Verify

- `https://acuity-yourname.duckdns.org/health` → `{"status":"ok"}` (cert should be valid — Caddy
  fetches it automatically the first time, give it ~30s).
- Open the site, sign up as an interviewer, create a session, join from an incognito window, and
  confirm the live code/chat sync (that exercises the WebSocket over `wss`).

## Updating

```bash
git pull
docker compose --env-file deploy/.env -f docker-compose.prod.yml up -d --build
```

Changing any `NEXT_PUBLIC_*` value requires the `--build` (they're baked into the frontend bundle).

---

> The repo also keeps a [render.yaml](render.yaml) blueprint for an all-Render deploy, if you ever
> want the managed-PaaS route instead (paid instances — free Render web services spin down on idle,
> which is rough on a live WebSocket interview).
