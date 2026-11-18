# 502offensive — AWS EC2 / Tailscale deployment profile

This profile documents the intended server setup for Fivezero2.group. It does not create AWS resources, change DNS, enroll devices in Tailscale, or deploy the application.

## Profile

- Profile name: `502offensive`
- Connector intent: `tag:server`
- AWS EC2 preset requested: `aws-ec2-ap-east-1` (AWS Hong Kong region, `ap-east-1`)
- Application: Fivezero2.group
- Application port: `3000/tcp` (keep private; expose only through a TLS reverse proxy)
- Tailscale tailnet: `falcon-triggerfish.ts.net`
- Tailscale API service: `api.falcon-triggerfish.ts.net`
- Tailscale WSS service: `wss.falcon-triggerfish.ts.net`
- DNS resolver details supplied by operator: split DNS `100.122.3.3`; global NextDNS profile ID `362745`

## Important security handling

- Never commit API keys, auth keys, OAuth client secrets, Hasura Admin Secret, DeepSeek keys, bootstrap tokens, or session secrets.
- The Tailscale API key previously pasted into chat must be revoked and replaced. Store the replacement in the server's secret manager only.
- Treat webhook IDs, tailnet IDs, and internal DNS details as operational metadata; disclose only to administrators who need them.
- Do not copy the entire AWS public IP range list into an EC2 inbound allowlist. AWS publishes ranges for many services and regions; they are not a substitute for a narrowly scoped source CIDR or a Tailscale-only administrative path.
- Do not expose SSH (22/tcp) or the Node app (3000/tcp) to the public internet. Prefer Tailscale SSH or a restricted administrator CIDR, and terminate HTTPS at a reverse proxy.

## AWS EC2 baseline

1. Create/choose an EC2 instance in `ap-east-1`. Confirm the account has access to the region and required instance types.
2. Attach an instance role only if required; grant least privilege. Do not place AWS access keys on the instance.
3. Security group inbound:
   - TCP 443 from intended public clients if the app is public.
   - TCP 80 only if needed for HTTP-to-HTTPS redirect or ACME validation.
   - SSH: deny public access; use Tailscale SSH or a narrowly restricted admin CIDR.
   - TCP 3000: no public ingress.
4. Use encrypted EBS, IMDSv2 required, automatic security updates, and CloudWatch/instance monitoring.
5. Configure a DNS A/AAAA record for the application domain to the reverse proxy/load balancer, not directly to the Node process.
6. Back up persistent application data before upgrades.

## Tailscale

1. Install Tailscale on the EC2 host using the official installation procedure for its operating system.
2. Enroll the host using a short-lived, least-privilege auth key or an approved OAuth flow. Do not use a reusable personal key in user data or GitHub Actions.
3. Apply the intended device tag `tag:server` only after the tailnet ACL/tag-owner policy authorizes it.
4. Validate the host appears in the correct tailnet and that ACLs permit only required administrator-to-server traffic.
5. Configure Tailscale DNS/split DNS only after confirming the authoritative zone and resolver reachability. The supplied resolver `100.122.3.3` must be verified from the EC2 host before use.
6. Prefer Tailscale SSH for administration. Do not enable subnet routing or exit-node behavior unless forwarding, routes, ACLs, and an explicit operational need have been reviewed.

## Application environment

Populate these values in the EC2 secret manager or a root-readable deployment environment file. Keep actual values out of Git.

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
SESSION_SECRET=<generate-unique-random-secret-32-plus-characters>
BOOTSTRAP_TOKEN=<generate-separate-random-token-24-plus-characters>
DATA_FILE=./data/state.json
TRUST_PROXY=1
ALLOWED_ORIGIN=https://<your-application-domain>

DEEPSEEK_API_KEY=<secret-if-enabled>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

HASURA_GRAPHQL_ENDPOINT=https://thankful-beagle-31.hasura.app/v1/graphql
HASURA_ADMIN_SECRET=<rotated-secret-if-enabled>
HASURA_JWT_SECRET=<secret-only-if-used>
```

The current app uses JSON file persistence in `data/state.json`. Hasura is currently only a connectivity/health integration; this profile does not claim that application records are stored in Hasura. Do not remove the JSON volume or migrate data until a tested schema, migration, backup, and rollback plan exist.

## AWS IP ranges

AWS IP ranges are broad, dynamic service prefixes. Do not use a full downloaded list as a blanket inbound allowlist. If an integration specifically requires AWS source ranges, retrieve the official JSON, filter by the exact service and region, review the result, and automate updates with change control. For copying locally, replace clipboard piping with a file output, for example:

```sh
curl -fsS https://ip-ranges.amazonaws.com/ip-ranges.json -o aws-ip-ranges.json
```

This saves the source document; it does not configure a security group.

## Deployment checklist

- [ ] Rotate the exposed Tailscale API key and any other credentials pasted into chat.
- [ ] Confirm EC2 account/region access for `ap-east-1`.
- [ ] Confirm OS, instance size, public/private subnet, and domain ownership.
- [ ] Confirm Tailscale tag-owner policy and ACL rules for `tag:server`.
- [ ] Confirm split DNS and NextDNS behavior from the EC2 host.
- [ ] Configure secrets outside Git and outside container images.
- [ ] Configure TLS reverse proxy and restrict port 3000.
- [ ] Back up `data/state.json` and test restore.
- [ ] Run CI and a staging health/authentication test before production deployment.
- [ ] Document rollback and key-rotation procedures.

## Scope and verification

This file is a deployment plan only. No AWS EC2 instance, security group, Tailscale device, DNS record, webhook, or production deployment has been changed or verified by committing this document.

## Install and enroll Tailscale on the EC2 host

Run these commands **on the EC2 Linux instance**, not in a GitHub repository terminal. This runbook deliberately contains no usable auth key.

Install the package using Tailscale's official installer:

```sh
curl -fsSL https://tailscale.com/install.sh | sh
```

Enable forwarding required by an exit node:

```sh
echo 'net.ipv4.ip_forward = 1' | sudo tee /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
sudo sysctl -p /etc/sysctl.d/99-tailscale.conf
```

Supply a **newly generated, short-lived, one-off auth key** without putting it in shell history or directly in the command arguments. The Tailscale CLI accepts `--auth-key=file:<path>`:

```sh
sudo install -m 600 /dev/null /root/ts-auth-key
sudo sh -c 'cat > /root/ts-auth-key'
```

After the second command, paste the new key and press Ctrl-D. Then enroll the machine and remove the temporary key file:

```sh
sudo tailscale up --auth-key=file:/root/ts-auth-key --advertise-exit-node
sudo rm -f /root/ts-auth-key
```


If this node must carry the `tag:server` tag, use a tag-authorized auth key and add `--advertise-tags=tag:server` to `tailscale up`. The tailnet tag-owner policy must authorize the tag. Do not use an ordinary untagged key and assume the tag will be accepted.

Verify on the host:

```sh
sudo tailscale status
tailscale ip
sysctl net.ipv4.ip_forward net.ipv6.conf.all.forwarding
```

Then in the Tailscale admin console, open **Machines**, find this host, and approve **Use as exit node** under its route settings. A node advertising the exit-node route is not automatically approved for use. Restrict which tailnet users/devices can use it through the tailnet access policy. Confirm firewall forwarding behavior and test connectivity from a separate authorized client before relying on it. Do not expose the EC2 host's SSH or application port publicly just because Tailscale is installed.

**Credential incident:** the auth key supplied in the conversation must be revoked. Do not reuse it, commit it, paste it into a GitHub issue, or place it in a workflow file. If automation is later required, store a freshly rotated key as a protected GitHub Actions secret and pass it to the remote host through a controlled deployment mechanism; never print it in logs.

