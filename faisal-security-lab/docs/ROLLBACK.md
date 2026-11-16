# Release & rollback plan (§28/§30)

> ملخّص بالعربية: كيف نرجع لإصدار سابق بأمان إذا فشل التحقق بعد النشر، وكيف
> تبقى قاعدة البيانات متوافقة مع الرجوع. الرجوع هنا = نشر الإصدار السابق؛ لا
> يحذف بيانات ولا يُرجع قاعدة قديمة فوق معاملات جديدة.

Deploying is not the same as a successful release. After a deploy, run
`scripts/post_deploy_verify.py <prod-url>`; if a mandatory check fails, roll back.

## Before promoting a release — record it

Keep a short release log entry (commit it or paste it into the deploy notes):

| Field | Example |
|---|---|
| Commit | `git rev-parse HEAD` |
| Previous good commit | the commit the live service is on **now** (write it down before deploying) |
| Schema version | `app/db.py` `SCHEMA_VERSION` (currently **7**) |
| Tool/rule versions | from the Tools & Licences screen / `tool_registry` |
| Tests | `make test` result + `scripts/acceptance.py` gates |
| Test-plan / benchmark | `tests/test_benchmark.py` result, if run (v4 §15) |
| Deploy id + verified URL | filled in after `post_deploy_verify.py` passes |

## Rolling back

The platform is a single service that builds from this repo. To roll back:

1. **Render (hosting):** open the service → **Deploys** → pick the **previous
   successful deploy** → **Redeploy / Rollback to this deploy**. This is the
   fastest path and needs no code change. (This environment cannot reach Render,
   so this step is done by the owner.)
2. **Or by Git:** `git revert <bad-commit>..HEAD` on the default branch and let
   the service redeploy the reverted head. Prefer `revert` over force-pushing so
   history stays intact.

Either way, confirm recovery by running `post_deploy_verify.py` against the URL
again and checking the app + worker actually serve.

## Why a rollback is safe for the database

Every schema change in this project is **additive and rollback-friendly**: each
migration only **adds a nullable / defaulted column or a new table** (see
`Database._MIGRATIONS` in `app/db.py`). Therefore:

- An **older** build runs correctly against a **newer** database — it simply does
  not read the new columns/tables. So deploying the previous version (the
  rollback) needs **no database change**.
- Rolling the application back **never restores an old database** over newer
  rows, and **never drops** a column or table. No transaction written by the new
  version is lost by going back to the old one.
- There is **no destructive migration**. If a future change ever needs one, it
  must ship with a backup and a tested down-path, and until then it is a
  release blocker (§28).

## If the deploy itself is blocked

If a required credential, permission, or an acceptance gate blocks the deploy,
**do not claim a deploy** and do not ask for a fresh confirmation instead of
fixing the cause (§30). Record the obstacle precisely (which gate, which
credential), finish everything that does not depend on it, and hand the exact
remaining step to the owner — e.g. *"enable Auto-Deploy / click Deploy latest
commit in Render"* when the hosting cannot be reached from the build environment.
