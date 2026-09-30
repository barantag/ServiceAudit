# ServiceAudit Architecture

## Stack

Frontend / server:
- Next.js App Router
- TypeScript
- Tailwind CSS

Database:
- PostgreSQL

ORM / migrations:
- Drizzle ORM
- Drizzle Kit

Spreadsheet input:
- Papa Parse
- ExcelJS

Runtime:
- Podman

## Organization Scope

Current local development uses:

SERVICEAUDIT_ORGANIZATION_ID

This variable is server-side only.

All organization-owned data must be scoped by organizationId.

The configured UUID remains the sole scope authority. The organization display
name is presentation metadata only: changing it does not select another
organization or alter imports, findings, reviews, duplicate protection, or
source evidence. The current organization identity experience is not
multi-tenancy and does not provide organization switching.

## Pilot Request Boundaries

State-changing App Router endpoints use one server-side request boundary. In
production, the boundary compares the browser `Origin` (or `Referer`) with the
validated `SERVICEAUDIT_PUBLIC_ORIGIN`; it never derives organization scope from
that header. Requests with a missing, malformed, or different source are
rejected before their body is processed. Local development falls back to the
request URL only when `NODE_ENV` is not `production`.

JSON request bodies are streamed through a 16 KiB application limit. Service
and warranty multipart requests are streamed through an 11 MiB request limit,
and each Excel or CSV file is limited to 10 MiB and 25,000 data rows. Limits reject the
whole request without truncation. The server import layer repeats file and row
checks before any database work, preserving atomicity and source evidence.

Caddy remains the only public ingress and applies a 12 MB coarse request-body
ceiling before proxying. Caddy Basic Auth is an outer pilot gate, not
application authentication. Minimal response headers prevent MIME sniffing and
framing and restrict unused browser capabilities; an unverified aggressive CSP
is intentionally deferred.

## Durability and Recovery

PostgreSQL is the only durable application state. Custom-format logical backups
must be stored outside the database volume and copied to encrypted off-host
storage. Restore verification always targets a newly created isolated database;
the repository intentionally provides no in-place overwrite path for the active
database. Application image rollback and database recovery are separate
decisions because checked-in migrations are forward migrations.
## Main Data Tables

Current important tables include:

- organizations
- imports
- service_records
- warranties
- finding_reviews

## Import Principles

Imports must:

- preserve original file name
- preserve original row number
- preserve raw source values
- normalize structured values separately
- validate again on the server
- use atomic database transactions
- prevent exact duplicate file imports with SHA-256

Client validation is for UX.

Server validation is authoritative.

### Active Analysis Data

Imported service and warranty rows participate in current analysis while their
parent import is active. Imports that are explicitly excluded remain stored with
their source evidence but their linked rows are omitted from current findings,
detail resolution, exports and manager summaries. Legacy records with a nullable
`importId` remain active for backward compatibility.

Finding evidence is calculated dynamically. Review decisions are preserved by
stable finding key when active imports change; a decision is not an immutable
snapshot of the evidence. In particular, an abnormal-price finding can retain
the same current-record key while its historical comparison set changes.

## Finding Architecture

Finding detection should follow:

Database loader
→ pure deterministic detection function
→ finding output
→ UI

Finding rules must not depend on React components.

Calculated findings are not copied into a findings table.

Only review decisions are persisted.

## Stable Finding Keys

Repeated failure:

repeated-failure:<previousRecordId>:<currentRecordId>

Duplicate service:

duplicate-service:<previousRecordId>:<currentRecordId>

Abnormal price:

abnormal-price:<currentRecordId>

Warranty service:

warranty-service:<serviceRecordId>:<warrantyRecordId>

Stable keys must never depend on:

- array position
- display text
- formatted dates
- database result order

## Review Persistence

finding_reviews stores:

- organization
- findingKey
- findingType
- status
- note
- timestamps

A review must never create a finding that no longer exists.

## Money

Avoid JavaScript floating-point arithmetic for exact financial comparisons where precision matters.

Do not combine different currencies into one total.

When manager summaries aggregate review amounts, deduplicate by the underlying current service record so the same service expense is not counted twice when it triggers multiple finding rules.

## Finding Philosophy

Rules should be:

- deterministic
- explainable
- testable
- conservative
- organization-scoped

Do not introduce probabilistic AI into financial finding decisions.

## UI Philosophy

Professional B2B.

Prefer:

- clear cards
- readable tables
- cautious audit wording
- visible evidence
- low cognitive load

Avoid unnecessary charts, animation or decoration.
