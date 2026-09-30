# ServiceAudit Roadmap

Last updated: 2026-09-12

## Completed

- [x] PostgreSQL / Drizzle foundation
- [x] Organization-scoped local environment
- [x] Service Excel (.xlsx) and CSV (.csv) parsing
- [x] Service column mapping
- [x] Service row validation and normalization
- [x] Atomic service-record import
- [x] Exact duplicate-file protection
- [x] Repeated-failure finding
- [x] Duplicate-service finding
- [x] Abnormal-price finding
- [x] Warranty table and migration
- [x] Warranty Excel (.xlsx) and CSV (.csv) import
- [x] Paid-service-during-warranty finding
- [x] Stable finding keys
- [x] Finding review workflow
- [x] Review notes and statuses
- [x] Manager summary
- [x] Findings filtering and search
- [x] Excel findings export
- [x] Improve navigation consistency
- [x] Import history
- [x] Better empty/error states
- [x] Reversible import exclusion and correction
- [x] Pilot organization identity: display and edit the active organization name
- [x] Controlled single-organization pilot deployment: deployment foundation
- [x] Controlled single-organization pilot deployment: request/security boundaries
- [x] Controlled single-organization pilot deployment: backup/recovery and operations

## Current

- [ ] Controlled single-organization pilot deployment: pilot environment deployment

## After That

Candidate pilot-readiness work:

- [ ] Authentication design
- [ ] Pilot feedback cycle

## Future Finding Candidates

Do not implement automatically.

Possible future research:

- contract-included service billed separately
- inactive/decommissioned asset receiving maintenance charges
- service frequency / preventive-maintenance anomalies

These require additional data structures and should be validated with real customer data first.

## Not Current Priority

- generic workflow engine
- AI agents
- RAG
- chatbot
- dashboards with many charts
- mobile app
- complex role/permission system
- ERP replacement functionality
