# Contributing to Faisal Security Lab

This guide covers the security testing platform in
[`faisal-security-lab/`](faisal-security-lab/README.md). The other project in
this repository does not take contributions through this guide.

## Before you start

- For a vulnerability, do not open an issue. Follow [SECURITY.md](SECURITY.md).
- For anything larger than a small fix, open an issue first and say what you
  want to change. It saves you work if the change does not fit.

## Setting up

You need Linux, Python 3.11 or newer, `make` and `git`. The platform has no
Python dependencies.

```bash
cd faisal-security-lab
make test          # the whole test suite
make acceptance    # the ten acceptance gates; writes var/acceptance-report.json
make serve         # the server and console on http://127.0.0.1:8787
```

Tests that need a scanner skip themselves when the scanner is not installed.
`make install-tools` installs the scanners; the README says what it needs.

## What a change has to keep

- **Standard library only.** The server, the worker and the connectors import
  nothing outside Python's standard library. A change that adds a dependency
  will not be merged.
- **Defensive scope.** The platform does not do internet-wide scanning, denial
  of service, password attacks, exploitation, data extraction, persistence or
  detection evasion. A feature of that kind will not be merged.
- **Authorization is checked twice.** Every scan is checked against its scope
  when it is requested and again when the worker starts it. A new way to start
  a scan has to go through both checks.
- **No shell.** A connector starts its tool with an argument list, never with a
  command string built from data. Follow `app/connectors/base.py`.
- **A connector records where its tool comes from.** Name, source address and
  licence of the tool go in the connector class, and a line for the tool goes
  in `THIRD-PARTY-NOTICES.md`.
- **No real secrets.** Test data uses fabricated values that work nowhere. Do
  not copy scanner rule packs or text from other projects into the repository.
- **Both languages.** A text added to the console is added in Arabic and in
  English.
- **Tests.** A fix comes with a test that fails without it. `make test` and
  `make acceptance` pass before you open the pull request.

## Pull requests

- One subject per pull request, with a description of what changes and why.
- Keep the documentation true: if behaviour, a setting or a limit changes, the
  README or the file under `docs/` that describes it changes in the same pull
  request.
- The checks on a first pull request from a new contributor wait until the
  maintainer approves the run. That is a GitHub default, not a problem with
  your change.

## Licence of contributions

The platform is licensed under either of the Apache License, Version 2.0
([`LICENSE-APACHE`](faisal-security-lab/LICENSE-APACHE)) or the MIT License
([`LICENSE-MIT`](faisal-security-lab/LICENSE-MIT)), at the user's option.

Unless you say otherwise in writing, any contribution you submit for inclusion
in the platform, as defined in the Apache License, Version 2.0, is licensed in
the same way, under both licences, with no additional terms or conditions.
