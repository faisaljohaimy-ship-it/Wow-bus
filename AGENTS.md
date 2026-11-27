# Instructions for coding agents

This repository holds independent projects: the bus site at the root, `biltix-hse/` and
`faisal-security-lab/`. Each has its own instructions, checks and deployment. Read the
project's own files first, and never let a change in one project deploy another.

The shared engineering reference is the
[Global AI Engineering Hub](https://github.com/faisaljohaimy-ship-it/Global-AI-Engneering-Hub),
pinned in `.engineering/capabilities.json`.

- Before a task, use the `hub-capabilities` skill to look for a hub skill, playbook or
  motion that fits, and read it from the pinned commit. A project's own instructions win
  where they differ.
- Files listed in the manifest are copies of the hub at the pin. Do not edit them here:
  change the hub, then re-pin as described in `.engineering/README.md`.
- The link adds no runtime dependency. Builds, tests and deployments must keep working
  when the hub is unreachable.
- This repository is public. No secret, customer data or paid service goes into it.
