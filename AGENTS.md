# Engineering coordination

Read README.md, SECURITY.md and specs/004-repository-isolation/spec.md first.
Preserve the separate static Neexios site, React shell, BILTIX and Security Lab
sources until their independent repositories and production releases are verified.
Subdirectory instructions apply to their own projects.

Use claude/<task> and codex/<task> feature branches. Record the active files and
test evidence in the PR before handing a task to another writer. Use independent
worktrees when two tasks overlap. Fetch current main and resolve overlapping
changes before merge. One release owner promotes an exact tested SHA per project.

Run npm ci and npm run check for the React application. Run the relevant
subdirectory test and security workflows when those files change. Never weaken a
required check, commit credentials or put production data into fixtures.

Production integration changes need an exported previous configuration, source
tree comparison, preview verification and a known-good artifact rollback target.
See DEPLOYMENT.md and RELEASE_MANIFEST.json for the release status.
