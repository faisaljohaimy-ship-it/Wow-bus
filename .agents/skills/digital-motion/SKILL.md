---
name: digital-motion
description: Select and implement accessible digital motion, cinematic scenes, 3D and bilingual motion graphics from the shared catalog.
---

Read motion-library/MOTION_CATALOG.json and playbooks/CINEMATIC_QA.md from the pinned hub revision. Select relevant effects, verify tool licenses and versions, implement deterministic timing, reduced-motion fallback and RTL-safe typography. Test the smallest scene first; record actual rendering and browser evidence. Do not claim a catalog entry is implemented. Keep private assets outside the public hub and do not incur additional charges.

Entries whose status is implemented have a specification in motion-library/specs and browser evidence in motion-library/evidence. Install one with `hub.py register PROJECT --revision SHA --capability motion:ID` and add `pack:motion-runtime` when the page needs stagger, typewriter or counters. To implement another entry, follow motion-library/README.md: write the specification, run the browser verification, then let catalog_status.py set the status. Never edit status or runtime_verified by hand.
