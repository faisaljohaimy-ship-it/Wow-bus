# Security policy

This policy covers the security testing platform in
[`faisal-security-lab/`](faisal-security-lab/README.md). It does not cover the
other project in this repository.

## Supported version

Fixes are made on the `main` branch (version 2.0.x). There are no maintained
older releases.

## Reporting a vulnerability

Please report it privately:

1. Open the **Security** tab of this repository.
2. Choose **Report a vulnerability**.

Do not open a public issue or pull request for a vulnerability that has not
been fixed. If the **Report a vulnerability** button is not there, open an
issue that says only that you have a security report, with no details, and
wait to be contacted.

Include, as far as you can:

- what an attacker can do, and what they need for it (no account, a guest of
  the public view, a signed-in reader, and so on);
- the version or commit, and how the platform was started (local, container,
  which settings);
- the steps or the request that shows it;
- logs, with secrets and personal data removed.

This project has one maintainer and no guaranteed response time. A fix is
published together with a short note that credits you, unless you ask not to
be named.

## In scope

- Code under `faisal-security-lab/`: the server, the worker, the connectors,
  the console and the deploy files.
- Ways around the authorization checks: running a scan without a valid scope,
  reading another project's data, a guest of the public view reading something
  the documentation says a guest cannot read.

## Out of scope

- `faisal-security-lab/samples/vulnerable-app/`. It is vulnerable on purpose,
  and it is what the demo scans.
- The credential-shaped strings in that sample, in `tests/` and in
  `scripts/acceptance.py`. They are fabricated and do not work anywhere. The
  file `.gitleaksignore` at the repository root lists them, so a Gitleaks scan
  of the git history is clean; a scan of the directory itself, and GitHub's
  secret scanning, still report them.
- Vulnerabilities in the tools the platform runs (Semgrep, Bandit, Gitleaks,
  pip-audit, OSV-Scanner, Trivy). Report those to their own projects.
- Load testing or denial-of-service testing of any public instance. The limits
  of a small instance are described in
  [`docs/OPERATIONS.md`](faisal-security-lab/docs/OPERATIONS.md).

Test only on an instance you run yourself. There is no bounty.

## Using the platform safely

The platform is for systems you own or have written permission to test. See
"Responsible use" in the [platform README](faisal-security-lab/README.md).
