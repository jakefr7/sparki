# Terminology

- **Phase:** a founder-approved, bounded unit of development described by `CURRENT_PHASE.md`.
- **Run:** one immutable-at-creation directory of plan, implementation, verification, and review artifacts.
- **Verification:** deterministic repository commands defined in the phase configuration.
- **Review:** Claude's independent read-only assessment of the phase diff and surrounding system.
- **Remediation:** Codex changes limited to a failed verification or actionable review findings.
- **Founder review:** the mandatory human checkpoint after automated verification and review pass.
- **Founder decision:** an immediate stop when policy, destructive action, secrets, deployment, architecture, or material scope requires human authority.
