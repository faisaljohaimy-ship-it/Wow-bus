---
name: digital-motion
description: Select and implement accessible digital motion, cinematic scenes, 3D and bilingual motion graphics from the shared catalog.
---

Read motion-library/MOTION_CATALOG.json, motion-library/components.json and playbooks/CINEMATIC_QA.md from the pinned hub revision. Use `hub.py recommend` to select relevant entries. Treat catalog-only, implemented, automated-tested, runtime-verified and used as separate states. Verify tool licenses and versions, implement deterministic timing, reduced-motion fallback and RTL-safe typography. Test the smallest scene first; record actual rendering and browser evidence. An adapter test does not prove the optional Remotion or Three.js runtime. Keep private assets outside the public hub and do not incur additional charges.

Entries with current browser evidence can be installed from a reviewed main commit
with `hub.py register PROJECT --revision SHA --capability motion:ID`; add
`pack:motion-runtime` for stagger, typewriter or counters. Follow
motion-library/README.md to add specifications and regenerate evidence. Never edit
catalog status or `runtime_verified` by hand.
