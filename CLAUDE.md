# Warriors

## Repository structure

This is a pnpm monorepo. Workspaces are defined in `pnpm-workspace.yaml` and live under `apps/*`.

**Do not restructure the monorepo.** Specifically:

- Do not split packages out into separate repositories.
- Do not flatten `apps/*` into the root, or move app code outside its workspace.
- Do not add new top-level package managers, workspace tools, or build orchestrators (no Turborepo, Nx, Lerna, Yarn workspaces, etc.) without explicit approval.
- Do not change `pnpm-workspace.yaml` or the root `package.json` workspace config without explicit approval.

Adding a new app under `apps/<name>` is fine when the task calls for it. Extracting shared code into a new workspace (e.g. `packages/*`) requires explicit approval first — propose it, don't just do it.
