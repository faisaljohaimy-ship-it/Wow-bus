# Repository isolation and build recovery

## Goal

Preserve each verified application and its history while removing shared deployment
ownership. New repositories are private by default. Keep the existing production
project IDs, domains, secrets and rollback artifacts.

## Acceptance

- The TanStack application installs with npm ci without peer dependency overrides.
- Production build, TypeScript, source lint, dependency audit and runtime smoke pass.
- Both the static Neexios site and the React application remain available in source.
- Each migration identifies its source ref, subtree and matching tree hash before
  changing its production integration.
- A release is blocked when its project ID, repository, source path or tested SHA
  differs from its manifest. Production integration changes require a captured
  previous configuration and rollback deployment.
- Unrelated Claude and Codex branches cannot publish another application's source.

## Current evidence

The original unbounded @tanstack/react-start range resolves to a version requiring
Vite >=8, while Vite was constrained to ^6. No lockfile existed. The source also
used obsolete Vinxi references, StartClient exports and handler initialization.
Recovery uses explicit compatible versions and the current documented entries.

GitHub repository creation is currently rejected with HTTP 403. Vercel's connected
project-detail tool omits root/build/Git integration fields. Browser settings
inspection requires login. These are outstanding access dependencies.
