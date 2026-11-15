# Recorded evidence

The files in this directory record runs on the reference build: a Linux x86_64
container with the scanners installed by `scripts/install-tools.sh`, and Python
3.13 unless a file says otherwise. The dates are written inside the files or
listed below. The files are examples of what the platform produces. They do not
describe your installation.

Tool states in these files describe that environment: `blocked` for Trivy,
whose binary could not be downloaded there, and `ready` instead of `verified`
for OSV-Scanner, whose service could not be reached from there. The states of
your own installation come from `make verify`, and your own acceptance result
from `make acceptance`, which writes `var/acceptance-report.json` and leaves
this directory alone.

| File | What it records | When |
|---|---|---|
| `acceptance-report.json` | the result of the ten acceptance gates ([ACCEPTANCE.md](../ACCEPTANCE.md)), with the evidence of each gate and the tool states at that moment. `make acceptance-evidence` refreshes it | last refreshed 2026-11-15 (UTC) |
| `test-run.txt` | the result lines of full runs of the test suite | the dates are in the file |
| `tool-install.json` | which scanners were installed on the reference build, with versions and paths | `recorded_at` in the file |
| `reports/sample-report.*` | one report on the bundled `samples/vulnerable-app` in every format: JSON, SARIF, Markdown in Arabic and English, HTML in Arabic | `generated_at` in the JSON file |
| `ui/*.png` | screenshots of the console in a browser | taken on 2026-11-14 and 2026-11-15 |

Things to know when reading them:

- **Counts change over time.** The sample report lists 43 findings, 28 of them
  advisories reported by pip-audit. Advisory databases grow, so a run today
  gives a different number.
- **The secrets are fabricated.** The token-shaped values that the sample
  contains were written for the secret scanner to find. The reports show them
  redacted.
- **Advisory text is not this project's.** The descriptions of the pip-audit
  findings in `reports/sample-report.json` come from the PyPI Advisory Database
  through pip-audit and stay under that database's licence; see
  [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md).
- **Screenshots can lag behind the console.** They show the console as it was
  when they were taken.
