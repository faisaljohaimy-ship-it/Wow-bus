# Authorization & scope guide

Authorization is the heart of this platform. A **scope** is the enforceable
permission to test one asset. No scan runs without one, and every scan is checked
against it twice.

## Creating a scope (admin only)

A scope binds to an asset and declares:

| Field | Meaning |
|---|---|
| `proof` | reference to the authorization (ticket, signed letter, "LAB-SELF-OWNED") — **required** |
| `owner_contact` | who authorized it |
| `environment` | `lab` \| `staging` \| `prod` |
| `allowed_targets` | exact hosts / URLs / paths / repos permitted (supports `*.host` and `path/*`) |
| `denied_targets` | explicit exclusions (checked first) |
| `allowed_ports` | permitted ports |
| `scan_types` | the connector names allowed for this asset |
| `valid_from` / `valid_until` | validity window |
| `window` | `{start_hour_utc, end_hour_utc}` run window of day |
| `rate_limits` | per-scope overrides |

## How it is enforced

`policy.evaluate_job` runs at **enqueue** (with the caller) and again in the
**worker** at execution (scope may have been revoked meanwhile). It checks, in
order: global stop → role → project/asset/scope integrity → connector ∈
`scan_types` → validity + run window → prod-active gating → target ∈
`allowed_targets` and ∉ `denied_targets`. Targets are re-derived from the stored
asset + validated params, never taken from the caller's word.

For network connectors, the destination is additionally resolved and checked
against private/loopback/link-local ranges at connect time (SSRF/DNS-rebinding
defense), and redirects are never auto-followed.

## Rules the platform enforces

- **Active scanning in production** (connectors that send traffic to / could
  change the target) is disabled unless `FSL_ALLOW_ACTIVE_IN_PROD=1`. Start active
  scans in lab/staging.
- **Internal assets** (private addresses) are reachable only when the asset is
  explicitly marked internal (`metadata.internal=true`) and bound to an
  authorizing scope. Discovering a new asset never authorizes it.
- **Separation of modes.** File/source analysis, crawling and active scanning are
  distinct; crawling excludes state-changing paths. (This build ships passive
  source/dep/secret/header/TLS connectors by default; active web scanners are a
  future connector gated behind scope + policy.)
- **Withdrawal.** Revoking a scope flags its in-flight jobs to stop and blocks any
  further execution immediately.

## Excluded, always

Internet-wide/random scanning, denial of service, mass password attempts, user
data exfiltration, planting persistence, and detection-evasion are out of scope
and unsupported. OT/ICS assets, if ever in a project, require their own isolated
scope and start from logs / lab replicas — a web-app authorization never covers
them.
