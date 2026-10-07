# Zynex frontend

Zynex is a frontend for proof-carrying data analysis workflows. Phase 3 adds a manual Analysis Specification workspace and typed future API boundary while retaining local dataset inspection, deterministic quality checks, the accessible application shell, and release gates.

## Phase 3 functionality

- Dataset-bound analytical question form with a 1,000-character limit
- Manual direct-column, row-count, and derived arithmetic metrics
- Type-aware aggregations, grouping, filters, sorting, and result limits
- Deterministic Proof Contract Preview based on selected columns and real quality findings
- Explicit decisions for missing values, duplicate rows, ambiguous dates, and division by zero
- Validated request review and copyable JSON specification
- Browser-session draft saving that is invalidated when the active dataset changes
- Typed, schema-validated contracts for `POST /api/v1/analysis/plan` and `GET /api/v1/health`

Automatic question interpretation is unavailable. No calculation, SQL, Python, AI interpretation, proof verification, chart, or analytical result is produced in Phase 3.

## Analysis Specification 1.0

The manual workflow produces a validated structure containing:

- `version`, fixed to `1.0`
- `datasetId` bound to the current in-memory dataset
- `question`
- `metric`, using a direct column, row count, or supported two-column arithmetic definition
- `aggregation`
- up to two `groupBy` columns
- AND-only `filters`
- result-shape-aware `sort`
- `limit`
- `requiredColumns`
- confirmed `assumptions`
- `createdAt`

The specification never contains results, SQL, Python, confidence, proof scores, verification states, or evidence nodes.

## Proof Contract Preview

The preview describes requirements implied by the current specification and actual data-quality findings. Items can be satisfied by metadata, require user clarification, require a backend decision, or be blocking. The preview is not a completed proof and is never presented as passed.

## Future API configuration

The API client has no default URL. To explicitly configure a future backend, provide:

```bash
VITE_API_BASE_URL=https://your-reviewed-api.example
```

Do not place secrets in this variable. When it is absent, the interface displays that the analysis backend is not connected and disables submission. Planning payloads contain the dataset reference, schema summary, quality summary, question, and optional validated specification. Complete dataset rows are never included.

## Phase 2 features

- Contained file picker and drag-and-drop upload for CSV and XLSX files
- Extension, MIME signal, filename, empty-file, and 20 MB size validation before parsing
- Local browser parsing with Papa Parse and SheetJS
- Explicit worksheet selection for multi-sheet workbooks
- One active dataset held in typed Zustand memory state
- Paginated TanStack Table preview with 10, 25, 50, and 100 row page sizes
- Column type labels, visibility controls, missing-value treatment, and safe text rendering
- Deterministic quality findings with affected row indices
- Accessible dataset removal confirmation and complete state clearing

Files are processed locally in application memory. Dataset rows are not sent to a Zynex server and are not stored in localStorage, sessionStorage, IndexedDB, cookies, analytics tools, or application logs. Reloading the page may clear the active dataset.

## Supported files

- `.csv`
- `.xlsx`
- Maximum file size: 20 MB

Legacy `.xls`, PDFs, images, executables, unsupported extensions, and password-protected workbooks are not supported. Larger-file streaming and backend processing are later work.

## Data-quality definitions

- **Missing values:** `null`, `undefined`, empty strings, and whitespace-only strings. Zero, `false`, `N/A`, and `NA` are preserved as present values.
- **Duplicate rows:** exact matches after normalizing value type and trimming surrounding string whitespace. Only occurrences after the first are counted.
- **Type inference:** each column is classified as Integer, Decimal, Boolean, Date, Text, Empty, or Mixed. Missing values are ignored. Integer and decimal values combine as Decimal. A column with at least 80% numeric values is treated as mostly numeric so incompatible values can be reported without conversion.
- **Invalid numeric values:** original values in a mostly numeric column that cannot be parsed as integers or decimals. Values are preserved and affected row indices are shown.
- **Date consistency:** recognizes ISO 8601, `YYYY/MM/DD`, and common slash or hyphen short dates. Ambiguous day-month and month-day values are reported without inferring locale.
- **Currency consistency:** recognizes common explicit currency symbols and three-letter currency codes. Columns with multiple markers are reported without conversion or an assumed currency.
- **Numeric outliers:** calculated for numeric columns with at least four numeric values using Q1 and Q3 interpolation. Bounds are `Q1 - 1.5 × IQR` and `Q3 + 1.5 × IQR`. Outliers are values requiring review, not automatic errors.
- **Header quality:** reports blank, duplicate, whitespace-padded, and case-only conflicting headers. Original headers remain unchanged and distinct internal keys prevent silent data loss.

Zynex does not calculate an overall quality score in Phase 2.

## Technology

- React, strict TypeScript, Vite, and Tailwind CSS
- React Router and Lucide React
- Papa Parse for CSV reading
- SheetJS for XLSX reading
- Zustand for non-persistent in-memory dataset state
- Zod for internal dataset validation
- TanStack Table for controlled pagination and visibility
- React Hook Form and Zod resolvers for accessible specification validation
- TanStack React Query for real future API request states
- Vitest and React Testing Library
- ESLint and Prettier

## Install and run

```bash
cd frontend
npm install
npm run dev
```

## Verification

```bash
npm run lint
npm run test -- --run
npm run build
npm run format:check
npm audit
```

## Known limitations

Phase 3 supports one active dataset and one in-memory analysis draft. It does not provide automatic question interpretation, execution, streaming, permanent storage, workbook formula execution, currency conversion, automatic date conversion, duplicate removal, outlier removal, or an overall quality score. Spreadsheet formula cells are displayed using values supplied by the workbook and are identified with a warning.

No FastAPI backend, AI integration, SQL engine, Python execution, authentication, analytical answer engine, proof verifier, or permanent storage is included.

The next implementation step is the FastAPI analytics backend. Phase 4 has not been started.
