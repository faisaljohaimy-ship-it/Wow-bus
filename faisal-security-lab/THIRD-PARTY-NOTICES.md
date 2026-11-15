# Third-party notices

## What this repository contains

The platform in this directory is written for this project. It contains no
third-party library, bundled or minified script, font, image or scanner rule
pack. The server needs only Python and its standard library (Python is
distributed under the Python Software Foundation License, version 2).

## Tools the platform runs

The platform does not include any scanner. It starts the tools below as
separate programs when they are installed, and reads their output.
`scripts/install-tools.sh` downloads them from the sources shown, at the
versions shown. Each tool stays under its own licence.

| Tool | Version installed by the script | Source | Licence |
|---|---|---|---|
| Semgrep (engine) | 1.185.0 | <https://github.com/semgrep/semgrep> | LGPL-2.1 |
| Bandit | 1.9.4 | <https://github.com/PyCQA/bandit> | Apache-2.0 |
| pip-audit | 2.10.1 | <https://github.com/pypa/pip-audit> | Apache-2.0 |
| Gitleaks | 8.21.2 | <https://github.com/gitleaks/gitleaks> | MIT |
| OSV-Scanner | 1.9.2 | <https://github.com/google/osv-scanner> | Apache-2.0 |
| Trivy | 0.58.1 | <https://github.com/aquasecurity/trivy> | Apache-2.0 |

The licences in this table were read from each project's repository on
2026-11-15. Check them again before you rely on them.

Running these tools as separate programs places no condition on the licence of
this platform. Distributing them is different: if you build and share a
container image from the files in `deploy/`, that image contains the tools, the
Python packages they depend on and the base image, and you have to follow the
licence of each of them.

## Scanner rules

`data/semgrep-rules/python-basics.yml` was written for this project and is
covered by this project's licences.

Rule packs from the Semgrep Registry are not included. If you set
`FSL_SEMGREP_CONFIG` to a registry pack (for example `auto` or `p/ci`), your
own Semgrep downloads those rules, and they are under the Semgrep Rules
License, not under this project's licences. Read that licence before you use
registry rules, especially on an instance other people can reach.

## Advisory text in findings

When pip-audit or OSV-Scanner reports a vulnerable package, the description of
the vulnerability is text from the advisory source: the Python Packaging
Advisory Database (published under CC-BY-4.0) and OSV.dev, whose records keep
the licence of the database each one comes from. The same applies to the
advisory text in the sample reports under `evidence/reports/`. That text is
not covered by this project's licences.

## Tool catalog

`data/tool-catalog.seed.json` is a reference list of security tools: names,
repository addresses, categories and short descriptions written for this
project. The names are trademarks of their owners. Listing a tool does not
mean that this project is affiliated with it, endorses it or runs it; the
platform runs only the tools in the table above.
