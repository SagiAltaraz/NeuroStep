# Deploy NeuroStep to Oracle Cloud (Always Free) — step by step

Goal: the full real-time stack (WebSocket + Kafka/Redpanda + agents) live on a
free always-on VM, behind your domain with HTTPS, auto-deploying on push to main.

Total cost: ~$10/year (just the domain). Hosting is free.

---

## Part 1 — Buy a domain (~$10/yr)

1. Create a Cloudflare account → https://dash.cloudflare.com/sign-up
2. Buy the domain at **Cloudflare Registrar** (at-cost, no markup):
   https://www.cloudflare.com/products/registrar/
   (Or Porkbun https://porkbun.com / Namecheap https://www.namecheap.com.)
3. Keep the Cloudflare dashboard open — you'll add DNS records in Part 5.

---

## Part 2 — Create the free Oracle VM

1. Sign up for Oracle Cloud Free Tier → https://www.oracle.com/cloud/free/
   (Credit card required for identity only; "Always Free" resources are never charged.)
2. In the console: **Menu → Compute → Instances → Create instance**.
3. Settings:
   - **Image**: Canonical Ubuntu 22.04
   - **Shape**: change to **Ampere (Arm) → VM.Standard.A1.Flex**, set
     **2 OCPU / 12 GB RAM** (well within Always Free; plenty for the whole stack).
     - If you get "Out of host capacity", try again later or pick another
       Availability Domain / region. This is the one common Oracle annoyance.
   - **SSH keys**: choose "Generate a key pair for me" and **download the private key**
     (or paste your own public key). Keep the private key safe — you need it for SSH
     and for GitHub auto-deploy.
4. Create. Note the **public IP** once it's running.

---

## Part 3 — Open ports 80 + 443

Oracle blocks everything except SSH by default, in **two** places:

**A) Cloud firewall (VCN security list):**
- Instance page → **Virtual cloud network** → **Security Lists** → default list →
  **Add Ingress Rules**, twice:
  - Source `0.0.0.0/0`, IP Protocol TCP, Destination port **80**
  - Source `0.0.0.0/0`, IP Protocol TCP, Destination port **443**

**B) OS firewall (iptables on the VM)** — SSH in first:
```bash
ssh -i /path/to/private-key ubuntu@YOUR_VM_IP

sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## Part 4 — Install Docker on the VM

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
# log out and back in so the group applies:
exit
ssh -i /path/to/private-key ubuntu@YOUR_VM_IP
docker version   # should work without sudo
```
Docs: https://docs.docker.com/engine/install/ubuntu/

---

## Part 5 — Point your domain at the VM

In the **Cloudflare dashboard → your domain → DNS → Records**, add two **A** records
to your VM's public IP:

| Type | Name | IPv4 (target) | Proxy status |
|------|------|---------------|--------------|
| A | `@`  | YOUR_VM_IP | **DNS only** (grey cloud) |
| A | `ws` | YOUR_VM_IP | **DNS only** (grey cloud) |

> Set them to **DNS only (grey cloud)** at first so Caddy can obtain Let's Encrypt
> certificates over HTTP. You can switch to "Proxied" (orange) later if you want
> Cloudflare in front — WebSockets still work proxied.

---

## Part 6 — Get the code + secrets onto the VM

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
- `SSH_HOST` = your VM public IP
- `SSH_USER` = `ubuntu`
- `SSH_KEY`  = the **private** SSH key (full contents, the one from Part 2)
- `APP_DIR`  = `/home/ubuntu/NeuroStep`

Now every `git push origin main` → GitHub SSHes in, pulls, and rebuilds. Done.
Action used: https://github.com/appleboy/ssh-action

---

## Notes & gotchas
- **Redpanda replaces Kafka+Zookeeper** — same Kafka API, your `kafkajs` code is
  unchanged; the broker is just `redpanda:9092` internally.
- **Firestore** stays as-is (Google-managed) — only needs the credentials in `backend/.env`.
- **Memory**: 12 GB ARM runs everything comfortably. If you took the 1 GB AMD micro
  shape instead, it's too small — use the Ampere A1 shape.
- **Backups**: Oracle may reclaim *idle* Always-Free accounts — log in occasionally,
  and your code is safe in GitHub regardless.
- **Logs**: `docker compose -f docker-compose.prod.yml logs -f game-server` to watch
  the adaptive engine ([Adaptive] P/D lines) in production.
