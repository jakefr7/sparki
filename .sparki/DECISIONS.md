# Decisions

- **2026-08-13 — Repository-backed project memory.** `.sparki/` is the durable source for phase state and run artifacts; terminal history is not project memory.
- **2026-08-13 — Local-first orchestration.** Node built-ins and installed CLIs are used. GitHub is optional and no deployment or merge is automated.
- **2026-08-13 — Independent roles.** Codex implements approved work; Claude reviews read-only; the PM pass is read-only.
- **2026-08-13 — Human control.** A passing phase stops at `READY_FOR_FOUNDER_REVIEW`.
