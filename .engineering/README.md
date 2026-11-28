# Link to the shared engineering hub

This repository is registered with the
[Global AI Engineering Hub](https://github.com/faisaljohaimy-ship-it/Global-AI-Engneering-Hub).
`capabilities.json` pins one hub commit and lists every file that came from it, each
with its SHA-256. The `hub-link` workflow fetches the hub at that commit and compares
the files; an edited, missing or unlisted file fails the check.

## What is installed

| Capability | Files | Purpose |
|---|---|---|
| `skill:hub-capabilities` | `.claude/skills/`, `.agents/skills/` | Find a fitting hub skill, playbook or motion before a task |
| `skill:digital-motion`, `skill:cinematic-production` | same | Motion and film work across the sites in this repository |
| `skill:release-engineering` | same | Releases: this repository feeds several independent deployments |
| `pack:motion-runtime`, five `motion:*` | `.engineering/vendor/hub-motion/` | Browser-verified motions, ready to use |

The hub skill `security-review` is not installed: its name collides with a built-in
Claude Code command.

The `catalog-media-tools` skill and `tools/shared_catalog.py`, `tools/media_tools.py` are
this repository's own files. The hub no longer offers them as a pack, so they are not
part of the link and are not checked by it.

## What it does not change

- No page loads `vendor/hub-motion/` yet. To use a motion, link its `.css` and add the
  class `hub-motion-<id>`, or import `hub-motion.mjs` and call `play(element, spec)`.
  Inline motions mirror by themselves on right-to-left pages.
- No build, test, deployment setting or existing instruction file was modified. The
  workflow runs only when link files change, so nothing here waits on the hub.

## Check and re-pin

```sh
git clone https://github.com/faisaljohaimy-ship-it/Global-AI-Engneering-Hub hub
git -C hub checkout "$(python3 -c "import json; print(json.load(open('.engineering/capabilities.json'))['hub_revision'])")"
python3 hub/hub.py verify .                                  # compare this checkout with the pin
python3 hub/hub.py register . --revision NEW_SHA --apply     # move every capability to a newer hub commit
```

Files listed in the manifest are copies. Change them in the hub and re-pin; an edit
made here fails verification.
