# Third-party notices

## What this repository contains

The platform in this directory is written for this project. It contains no
third-party library, bundled or minified script, font, image or scanner rule
pack. The server needs only Python and its standard library (Python is
distributed under the Python Software Foundation License, version 2).

## Tools the platform runs

The platform does not include any scanner. It starts the tools below as
separate programs when they are installed, and reads their output.
`scripts/install-tools.sh` installs them at the versions shown: Semgrep, Bandit
and pip-audit with pip from PyPI, and Gitleaks, OSV-Scanner and Trivy as
binaries from the release pages of their GitHub repositories. Trivy is
optional. The "Source" column names each project's own repository. Each tool
stays under its own licence.

| Tool | Version installed by the script | Source | Licence |
|---|---|---|---|
| Semgrep (engine) | 1.185.0 | <https://github.com/semgrep/semgrep> | LGPL-2.1-or-later |
| Bandit | 1.9.4 | <https://github.com/PyCQA/bandit> | Apache-2.0 |
| pip-audit | 2.10.1 | <https://github.com/pypa/pip-audit> | Apache-2.0 |
| Gitleaks | 8.21.2 | <https://github.com/gitleaks/gitleaks> | MIT |
| OSV-Scanner | 1.9.2 | <https://github.com/google/osv-scanner> | Apache-2.0 |
| Trivy | 0.58.1 | <https://github.com/aquasecurity/trivy> | Apache-2.0 |

The licences in this table were read from each project's repository on
2026-11-15, except Semgrep's, which is the label in the metadata of the pinned
package (`License-Expression: LGPL-2.1-or-later`). Check them again before you
rely on them.

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

`data/tool-catalog.seed.json` is a reference list of 76 security tools. Every
entry has the tool's name, the path of its repository on GitHub
(`owner/name`), `year`, `archived`, and a category and a short description in
Arabic that were written for this project. The platform reads these six fields
and no others.

43 entries also carry notes from a check of the project's repository, made on
the date in `metadataChecked` (2026-11-13 or 2026-11-14): on 42 of them a
licence label, and on some the address of the GitHub API record the notes were
read from (`metadataSource`), the date of the last push and the latest
release. The label names a licence on 34 entries and is `NOASSERTION` (no
licence was identified) on 8; the other 34 entries have no label. So the file
does not show that every listed project is open source. Read a project's own
licence before you use it.

The names are trademarks of their owners. Listing a tool does not mean that
this project is affiliated with it, endorses it or runs it; the platform runs
only the tools in the table above.
