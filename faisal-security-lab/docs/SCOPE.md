# Authorization & scope guide

A **scope** is the recorded permission to test one asset. No scan runs without
one, and every scan is checked against it twice: when it is requested and when
the worker starts it.

The platform records the authorization you declare. It cannot verify it: the
proof is a text you type. Grant a scope only for a system you own or have
written permission to test.

## Creating a scope (project admin only)

In the console: **Assets & Scopes**, then **+ Add authorization** in the asset's
row. Through the API: `POST /api/projects/{id}/scopes`. The console form has the
fields marked with *; the others are set through the API.

| Field | Meaning |
|---|---|
| `proof` * | reference to the authorization (a ticket, a signed letter, `LAB-SELF-OWNED` for your own lab). Required, free text |
| `owner_contact` * | who authorized it |
| `environment` * | `lab`, `staging` or `prod` |
| `allowed_targets` * | the hosts, URLs, paths or repositories the scope covers, separated by commas in the console. A pattern matches itself; a host name also matches URLs on that host; `*.example.org` matches `example.org` and every host below it; `/path/*` matches `/path` and everything below it. **Leave it empty and targets are not restricted** (see "Known limits") |
| `denied_targets` | explicit exclusions; checked first |
| `scan_types` * | the connector names allowed on this asset. A scope with none allows no scan |
| `valid_from` / `valid_until` | validity dates (ISO date and time, UTC) |
| `window` | `{"start_hour_utc": 1, "end_hour_utc": 5}`: hours of the day in which scans may run |
| `allowed_ports`, `rate_limits` | stored and shown; not enforced in this version |

## How it is enforced

`policy.evaluate_job` runs when a scan is requested (with the caller) and again
in the worker before the tool starts (the scope may have been revoked in
between). It checks, in this order:

1. the global stop is not engaged;
2. the caller has the `analyst` role, or a higher one, in the project (request
   time only);
3. the asset belongs to the project, the scope belongs to that asset, and the
   scope is `active`;
4. the connector is one of the scope's `scan_types`;
5. the time is inside the validity dates and the run window;
6. on a scope whose environment is `prod`, the connector does not send traffic
   to the target, unless `FSL_ALLOW_ACTIVE_IN_PROD=1` (this concerns
   `http_headers`, `tls_certificate` and `ai_redteam`);
7. no target is in `denied_targets`, and, when `allowed_targets` is not empty,
   every target is in it. The targets compared are the asset's identifier and
   the `target`, `url`, `host`, `repo_path` and `image` parameters of the
   request.

A refused request gets HTTP 403 with the code `policy_denied`; a job refused at
start ends in the state `blocked`. Both are written to the audit log.

For the network connectors the destination is resolved when the job runs. An
address in a private, loopback or link-local range is refused unless the asset
is marked internal, the connection goes to the address that was checked, and a
redirect is recorded but not followed.

## Rules the platform enforces

- **Production.** Connectors that send traffic to the target are refused on a
  `prod` scope unless `FSL_ALLOW_ACTIVE_IN_PROD=1`. Start with `lab` or
  `staging`.
- **Internal assets.** A private address is reachable only when the asset
  carries `"internal": true` in its metadata (set through the API when the
  asset is registered) and a scope on that asset allows the connector. Look at
  an asset before you grant a scope on it: the mark is set by whoever registered
  the asset.
- **Withdrawal.** Revoking a scope tells its queued and running jobs to stop
  and refuses any further scan on it.
- **What is shipped.** This version has connectors that read source
  (static analysis, secrets, dependencies), one header check, one TLS
  certificate check and one AI-provider probe. It has no crawler and no active
  web scanner.

## Excluded, always

Internet-wide or random scanning, denial of service, mass password attempts,
exfiltration of user data, planting persistence and detection-evasion are out of
scope and unsupported. The platform has no connector for OT/ICS equipment; do
not point the network connectors at such systems on the strength of a
web-application authorization.

## Known limits

These are properties of this version. Take them into account when you decide
who gets an account and where the worker runs.

- **The proof is a declaration.** Nothing checks that the text in `proof` is
  true.
- **An empty `allowed_targets` list does not restrict targets.** The scope then
  still binds the asset and the scan types, but a `target` parameter in a scan
  request may name another host. Always fill in the allowed targets; the console
  form does not insist on it.
- **The directory of a source scan is not compared with the scope.** A source
  scan reads the asset's identifier, or, when they are given, the asset's
  `local_path` metadata field or the `source_path` parameter of the scan
  request. Only the identifier is compared with `allowed_targets`. Someone with
  the `analyst` role in a project that has an active scope for a source scanner
  can therefore have the worker read any directory the service user can read;
  findings from it appear in that project. Give that role only to people you
  trust with this, run the service as an unprivileged user, and run the worker
  in a container that sees only what you mount into it.
- **A `source` asset is a directory on the machine where the worker runs**, not
  on the machine of the person who registers it.
- **`allowed_ports` and `rate_limits` are not enforced.**
- **A repository clone is checked once.** The host name of a repository address
  is resolved and checked before `git clone` starts. git then resolves the name
  again by itself and can follow a redirect on its first request. Clone only
  from hosts you trust.
