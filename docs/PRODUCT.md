# ServiceAudit Product

## One-line Description

ServiceAudit helps companies detect maintenance and service expenses that deserve review.

## Current Customer Problem

Multi-location companies accumulate service records, invoices, warranty data and maintenance history across spreadsheets, ERP systems, email and service vendors.

Individual records may look valid while patterns across records reveal review opportunities.

Examples:

- the same failure occurs again shortly after service
- the same service may have been recorded twice
- a service price is materially higher than comparable history
- a paid service occurs while a warranty is active

## Product Positioning

ServiceAudit is an audit/intelligence layer.

It does not replace:

- ERP
- CMMS
- field service management
- accounting software

It reads operational service data and produces explainable review candidates.

## Current MVP Flow

Service Excel (.xlsx) or CSV (.csv)
→ column mapping
→ validation
→ atomic import
→ deterministic findings
→ evidence
→ human review
→ manager summary

Warranty Excel (.xlsx) or CSV (.csv)
→ mapping
→ validation
→ atomic import
→ cross-check with service data

## Current Finding Types

1. Tekrarlayan Arıza: Requires service records with asset, failure type, and date information to identify failures happening repeatedly within a short window.
2. Mükerrer Servis Kaydı: Requires detailed records combining date, asset, and failure type with either invoice numbers or a combination of vendor name, amount, and currency.
3. Anormal Servis Fiyatı: Requires at least 3 comparable historical service records (matching asset type, failure type, vendor, and currency). **Note:** This comparison is explicitly made against the organization's own historical data, not against external market prices.
4. Garanti Süresinde Ücretli Servis: Requires usable warranty records to have been explicitly supplied to the system. **Note:** ServiceAudit currently does not infer warranty rules from invoices or read PDF contracts; this capability relies strictly on imported warranty data. Features like PDF/ERP parsing or automated warranty rule engines are future work and not existing capabilities.

## Analiz Hazırlığı / Veri Uygunluğu

ServiceAudit includes an "Analiz Hazırlığı" (Analysis Readiness) capability that evaluates the organization's currently active data and informs the user whether their data is suitable ("Hazır", "Sınırlı", "Veri gerekli") for each of the four analysis types.
This ensures the system remains honest and explainable by explicitly stating what data is missing when an analysis cannot produce reliable findings.

## Human Review

Every finding can be:

- İncelenecek
- Doğrulandı
- Geçersiz

A note can be stored with the decision.

## Important Product Language

A finding is not proof of loss.

Use cautious language:

"İncelenmesi önerilir."

"İncelenecek tutar."

Avoid calling a calculated candidate:

- confirmed savings
- waste
- fraud
- overpayment

without explicit evidence.

## MVP Objective

The MVP should be credible enough for a real pilot with a company that has:

- multiple locations
- recurring maintenance/service spend
- historical service records
- asset/equipment identifiers

## Current Priority

Improve usability for larger finding volumes and prepare pilot-ready reporting/export.
