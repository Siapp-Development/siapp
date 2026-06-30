---
description: "Use whenever the user asks for research, planning, ideation, strategy, product/project management notes, RFCs, design docs, roadmaps, brainstorms, market analysis, or any non-code written deliverable. ALL such documents MUST be created under /plans/ — never in the repo root, /docs, or beside code."
---

# Plans Folder Rule

**All** research, planning, ideation, and project-management writeups live under [/plans/](../../plans/). No exceptions.

## What belongs in `/plans/`

Anything that is *thinking on paper* rather than shipped code or user-facing docs:

- Product/project ideation and brainstorms
- Market research and competitive analysis
- Go-to-market plans, pricing experiments
- Roadmaps, milestones, OKRs
- Design docs / RFCs / ADRs (drafts)
- Meeting notes that drive decisions
- Spike writeups and prototype evaluations
- Risk logs, open questions, decision logs

## What does NOT belong in `/plans/`

- Source code (`src/`)
- End-user documentation (`README.md`, `/docs`)
- API references (auto-generated or hand-written)
- Tests, fixtures, configs

## Rules for agents

1. **Default location.** When the user asks to "research", "plan", "brainstorm", "draft a strategy", "write a doc about X", "ideate", or similar — create the file under `/plans/`. Do not put it in the repo root, `/docs`, or next to code.
2. **No silent moves.** If a planning file already exists outside `/plans/`, ask the user before moving it.
3. **Naming.** Use kebab-case with an optional ordering prefix: `01-overview.md`, `competitive-analysis.md`, `2026-q3-roadmap.md`.
4. **Subfolders are fine** for grouping (e.g. `/plans/gtm/`, `/plans/research/`, `/plans/rfcs/`). Keep the top level shallow.
5. **Index.** When `/plans/` has more than a handful of files, maintain `/plans/README.md` as a one-line-per-file index. Update it when you add a doc.
6. **Markdown only** unless the user specifies otherwise (`.md`, with optional Mermaid/KaTeX). No `.docx`, no `.pdf` drafts.
7. **Front-matter is optional**, but if you add it, include at minimum:

   ```yaml
   ---
   title: "Competitive Analysis"
   status: draft   # draft | in-review | accepted | superseded
   updated: 2026-06-16
   ---
   ```

8. **Link, don't duplicate.** Reference other plans by relative link rather than copying their content.

## When in doubt

If you cannot tell whether a document is "planning" or "shipped docs", default to `/plans/` and ask the user.
