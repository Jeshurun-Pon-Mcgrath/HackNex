# Zynex launch checklist

This checklist is a release gate. Zynex must not be described as launched until every item is complete.

- [ ] Custom domain is connected and verified. Not part of Phase 3.
- [ ] Production favicon and application icons are installed. A development SVG favicon is present; the full production icon set is outstanding.
- [x] Generator branding and "Made with AI" labels are absent.
- [ ] Privacy Policy is reviewed and complete. The current policy is a draft.
- [ ] Terms and Conditions are reviewed and complete. The current terms are a draft.
- [ ] Accessibility checks pass. Keyboard, focus, dialog, navigation, and table foundations have automated coverage; a full production audit is outstanding.
- [ ] Production metadata is verified. Basic metadata is present but has not received production review.
- [x] No fake content, placeholder claims, or demonstration labels are present. Required legal placeholders are clearly labeled and block production release.

## Phase 1 verification

- [x] Responsive application navigation is implemented.
- [x] Product routes use honest empty states.
- [x] Draft legal pages are present.
- [x] A development favicon and basic metadata are present.
- [x] Automated tests cover core navigation and accessibility interactions.
- [ ] Production deployment review is complete.

## Phase 2 verification

- [x] CSV and XLSX files are parsed locally in browser memory.
- [x] File type, empty-file, filename, and 20 MB size validation are implemented.
- [x] Multi-sheet workbooks require explicit worksheet selection.
- [x] Dataset preview is paginated and supports column visibility controls.
- [x] Missing values, duplicate rows, types, invalid numeric values, date formats, currencies, headers, and IQR outliers are inspected deterministically.
- [x] Removing a dataset clears rows, metadata, and quality findings from memory.
- [x] Automated fixture coverage includes parser, quality, navigation, pagination, and dialog behavior.
- [x] No backend, AI, SQL engine, or permanent dataset storage is connected.
- [ ] Backend security review is complete. No backend exists in Phase 2.
- [ ] Scalable processing for files larger than 20 MB is implemented.
- [ ] Production deployment review is complete.

## Phase 3 verification

- [x] Analysis requires a real active dataset.
- [x] Manual Analysis Specification 1.0 builder uses actual dataset columns.
- [x] Metric, aggregation, grouping, filter, sort, and limit validation is deterministic.
- [x] Proof Contract Preview reflects actual selected-column quality conditions.
- [x] Required ambiguity decisions are explicit and stored as assumptions.
- [x] Valid specifications can be reviewed, copied, and saved in memory.
- [x] Drafts are bound to dataset IDs and invalidated when the dataset changes.
- [x] Typed, Zod-validated health and analysis-plan API contracts are present.
- [x] Complete dataset rows are excluded from analysis-plan payloads.
- [x] No default backend URL, mock response, analytical result, SQL, Python, or verification state is displayed.
- [ ] End-to-end analysis execution is implemented.
- [ ] Backend security review is complete.
- [ ] Production deployment review is complete.
