# Specs

Spec-Driven Development (SDD) specs for this project, managed with [Spec Kit](https://github.com/github/spec-kit)
(`specify` CLI) and consumed by **opencode** via the slash commands in `.opencode/commands/`.

## Workflow

1. **New spec** — run `/speckit.specify` in opencode (or copy `spec-starter-template.md` and rename it).
2. **Plan** — `/speckit.plan` turns a spec into an implementation plan.
3. **Tasks** — `/speckit.tasks` breaks the plan into actionable tasks.
4. **Implement** — `/speckit.implement` executes the tasks (creates branches via `/speckit.git.feature`).
5. **Validate** — `/speckit.checklist` + `/speckit.analyze` before `/speckit.git.commit`.
6. **Assess** — `/speckit.converge` reconciles unplanned work into task list.

> Specs are the single source of truth. Never hand-edit code against an un-planned spec.

## Conventions

- Filename: `specs/<kebab-case-feature>.spec.md` (e.g. `dark-mode-preference.spec.md`).
- Branch: `[###-feature-name]` (assigned by `/speckit.git.feature`).
- Status: `Draft` → `In Review` → `Approved` → `Implemented` → `Done`.

See `.specify/templates/spec-template.md` for the canonical template and `specs/spec-starter-template.md`
for a concrete worked example you can duplicate.
