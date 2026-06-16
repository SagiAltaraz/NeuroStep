# Deploy NeuroStep to DigitalOcean — step by step

Goal: the full real-time stack (WebSocket + Redpanda/Kafka + agents) live on a
DigitalOcean Droplet, behind your domain with HTTPS, auto-deploying on push to main.

The whole stack runs from `docker-compose.prod.yml` + a Caddy reverse proxy that
fetches Let's Encrypt certificates automatically.

---

## Part 1 — Buy a domain (~$10/yr)

1. Create a Cloudflare account → https://dash.cloudflare.com/sign-up
2. Buy the domain at **Cloudflare Registrar** (at-cost, no markup):
   https://www.cloudflare.com/products/registrar/
   (Or Porkbun https://porkbun.com / Namecheap https://www.namecheap.com.)
3. Keep the Cloudflare dashboard open — you'll add DNS records in Part 5.

---

## Part 2 — Create the Droplet

1. In the DigitalOcean console: **Create → Droplets**.
2. Settings:
   - **Image**: Ubuntu 24.04 (LTS) x64
   - **Type**: Basic · **Regular** (or Premium) ·
     **2 vCPU / 4 GB** — comfortable for the whole stack including Redpanda.
   - **Region**: closest to your users.
   - **Authentication**: **SSH key** — add your public key (or create one and
     download the private key; you need it for SSH and for GitHub auto-deploy).
3. Create. Note the **public IPv4** once it's running.

> On DigitalOcean the default login user is **`root`** (not `ubuntu`).

---

## Part 3 — Open ports 80 + 443 (and keep SSH)

DigitalOcean Droplets are open by default; lock them down with the on-host
firewall (`ufw`). SSH in first:

```bash
ssh -i /path/to/private-key root@YOUR_DROPLET_IP

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

> Prefer a managed **DigitalOcean Cloud Firewall**? Create one with inbound rules
> for TCP 22, 80, 443 and attach it to the Droplet instead of using `ufw`.

---

## Part 4 — Install Docker on the Droplet

```bash
curl -fsSL https://get.docker.com | sh
docker version   # should work (you're root)
```
Docs: https://docs.docker.com/engine/install/ubuntu/

---

## Part 5 — Point your domain at the Droplet

In the **Cloudflare dashboard → your domain → DNS → Records**, add two **A** records
to your Droplet's public IP:

| Type | Name | IPv4 (target) | Proxy status |
|------|------|---------------|--------------|
| A | `@`  | YOUR_DROPLET_IP | **DNS only** (grey cloud) |
| A | `ws` | YOUR_DROPLET_IP | **DNS only** (grey cloud) |

> Set them to **DNS only (grey cloud)** at first so Caddy can obtain Let's Encrypt
> certificates over HTTP. You can switch to "Proxied" (orange) later if you want
> Cloudflare in front — WebSockets still work proxied.

---

## Part 6 — Get the code + secrets onto the Droplet

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/NeuroStep.git
cd NeuroStep

# 1) root .env (domain + public frontend vars)
cp .env.prod.example .env
nano .env          # set DOMAIN, VITE_WS_URL=wss://ws.DOMAIN, VITE_FIREBASE_*

# 2) backend/.env (runtime secrets: Firebase admin key, Anthropic key, etc.)
nano backend/.env  # paste the same backend/.env you use locally
```

---

## Part 7 — Launch 🚀

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps     # all "running"/"healthy"
docker compose -f docker-compose.prod.yml logs -f caddy   # watch cert issuance
```
Visit **https://YOUR_DOMAIN**. The game connects to **wss://ws.YOUR_DOMAIN** automatically.
(First HTTPS load can take ~30–60s while Caddy fetches certificates.)

---

## Part 8 — Auto-deploy on every push to main

The workflow is already in `.github/workflows/deploy.yml`. Add 4 repo secrets:

GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
- `SSH_HOST` = your Droplet public IP
- `SSH_USER` = `root`
- `SSH_KEY`  = the **private** SSH key (full contents, the one from Part 2)
- `APP_DIR`  = `/root/NeuroStep`

Now every `git push origin main` → GitHub SSHes in, pulls, and rebuilds. Done.
Action used: https://github.com/appleboy/ssh-action

---

## Notes & gotchas
- **Redpanda replaces Kafka+Zookeeper** — same Kafka API, your `kafkajs` code is
  unchanged; the broker is just `redpanda:9092` internally.
- **Firestore** stays as-is (Google-managed) — only needs the credentials in `backend/.env`.
- **Memory**: 4 GB runs everything comfortably. 2 GB works but is tight once
  Redpanda + both app containers are up — add swap or size up if builds OOM.
- **Logs**: `docker compose -f docker-compose.prod.yml logs -f game-server` to watch
  the adaptive engine ([Adaptive] P/D lines) in production.
- **Backups**: enable DigitalOcean Droplet backups/snapshots if you want a restore
  point; your code is safe in GitHub regardless.
