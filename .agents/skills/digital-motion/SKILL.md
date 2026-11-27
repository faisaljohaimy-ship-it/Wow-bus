---
name: digital-motion
description: Select and implement accessible digital motion, cinematic scenes, 3D and bilingual motion graphics from the shared catalog.
---

Read motion-library/MOTION_CATALOG.json, motion-library/components.json and playbooks/CINEMATIC_QA.md from the pinned hub revision. Use `hub.py recommend` to select relevant entries. Treat catalog-only, implemented, automated-tested, runtime-verified and used as separate states. Verify tool licenses and versions, implement deterministic timing, reduced-motion fallback and RTL-safe typography. Test the smallest scene first; record actual rendering and browser evidence. An adapter test does not prove the optional Remotion or Three.js runtime. Keep private assets outside the public hub and do not incur additional charges.

A component whose runtime_status is browser-verified has evidence in motion-library/evidence. Install one with `hub.py register PROJECT --revision SHA --capability motion:ID`, and add `pack:motion-runtime` when the page needs stagger, typewriter or counters. To implement another catalog entry, follow motion-library/README.md: specification, component row, browser verification, then let component_status.py set the status. Never edit runtime_status by hand.
