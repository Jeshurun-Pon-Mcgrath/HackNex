import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, CircleHelp, Copy, Plus, ServerOff, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { apiConfiguration, createAnalysisPlan } from '../api/client'
import { buildAnalysisPlanRequest } from '../api/requestBuilder'
import { DatasetSummary } from '../components/dataset/DatasetSummary'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { StatusMessage } from '../components/ui/StatusMessage'
import { analysisFormSchema, analysisSpecificationSchema } from '../lib/analysisSchema'
import {
  buildProofContract,
  compatibleAggregations,
  createSpecification,
  filterOperators,
  operatorLabels,
  validateAnalysis,
} from '../lib/analysisRules'
import { useAnalysisStore } from '../store/analysisStore'
import { useDatasetStore } from '../store/datasetStore'
import type {
  Aggregation,
  AnalysisFormValues,
  AnalysisSpecification,
  ContractState,
} from '../types/analysis'

const aggregationLabels: Record<Aggregation, string> = {
  sum: 'Sum',
  average: 'Average',
  count: 'Count',
  count_distinct: 'Count distinct',
  minimum: 'Minimum',
  maximum: 'Maximum',
}
const contractLabels: Record<ContractState, string> = {
  satisfied: 'Satisfied by current metadata',
  backend_decision: 'Requires a backend decision',
  user_clarification: 'Requires user clarification',
  blocking: 'Blocking issue',
}
const defaultValues: AnalysisFormValues = {
  question: '',
  metricKind: '',
  metricColumn: '',
  leftColumn: '',
  arithmeticOperator: 'add',
  rightColumn: '',
  derivedDisplayName: '',
  aggregation: '',
  groupBy: [],
  filters: [],
  sortTarget: 'metric',
  sortDirection: 'descending',
  limit: 10,
  confirmMissingExclude: false,
  confirmDuplicateKeep: false,
  dateInterpretation: '',
  divisionHandling: '',
}

function valuesFromDraft(draft: AnalysisSpecification): AnalysisFormValues {
  return {
    ...defaultValues,
    question: draft.question,
    metricKind: draft.metric.kind,
    metricColumn: draft.metric.kind === 'column' ? draft.metric.column : '',
    leftColumn: draft.metric.kind === 'derived' ? draft.metric.leftColumn : '',
    arithmeticOperator: draft.metric.kind === 'derived' ? draft.metric.operator : 'add',
    rightColumn: draft.metric.kind === 'derived' ? draft.metric.rightColumn : '',
    derivedDisplayName: draft.metric.kind === 'derived' ? draft.metric.displayName : '',
    aggregation: draft.aggregation,
    groupBy: draft.groupBy,
    filters: draft.filters,
    sortTarget: draft.sort.target,
    sortDirection: draft.sort.direction,
    limit: draft.limit,
    confirmMissingExclude: draft.assumptions.some((item) => item.startsWith('Exclude rows')),
    confirmDuplicateKeep: draft.assumptions.some((item) => item.startsWith('Keep exact')),
    dateInterpretation: draft.assumptions.some((item) => item.includes('day first'))
      ? 'day_first'
      : draft.assumptions.some((item) => item.includes('month first'))
        ? 'month_first'
        : '',
    divisionHandling: draft.assumptions.some((item) => item.startsWith('Exclude rows where'))
      ? 'exclude'
      : draft.assumptions.some((item) => item.startsWith('Return null'))
        ? 'null'
        : '',
  }
}

export function AnalysisPage() {
  const dataset = useDatasetStore((state) => state.activeDataset)
  const report = useDatasetStore((state) => state.qualityReport)
  const { draft, notice, saveDraft, resetDraft } = useAnalysisStore()
  const [review, setReview] = useState<AnalysisSpecification | null>(draft)
  const [validationErrors, setValidationErrors] = useState<
    Array<{ field: string; message: string }>
  >([])
  const [copied, setCopied] = useState(false)
  const [formNotice, setFormNotice] = useState<string | null>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const builderRef = useRef<HTMLDivElement>(null)
  const filterButtonRef = useRef<HTMLButtonElement>(null)
  const previousDatasetIdRef = useRef(dataset?.datasetId)
  const form = useForm<AnalysisFormValues>({
    resolver: zodResolver(analysisFormSchema),
    defaultValues: draft ? valuesFromDraft(draft) : defaultValues,
  })
  const {
    register,
    control,
    handleSubmit,
    getValues,
    setValue,
    reset,
    formState: { errors },
  } = form
  const fields = useFieldArray({ control, name: 'filters' })
  const values = useWatch({ control }) as AnalysisFormValues
  const question = useWatch({ control, name: 'question' })
  const metricKind = useWatch({ control, name: 'metricKind' })
  const metricColumn = useWatch({ control, name: 'metricColumn' })
  const groupBy = useWatch({ control, name: 'groupBy' })

  useEffect(() => {
    if (!groupBy?.filter(Boolean).length) setValue('limit', 1)
    else if (getValues('limit') === 1) setValue('limit', 10)
  }, [getValues, groupBy, setValue])

  useEffect(() => {
    if (previousDatasetIdRef.current && dataset?.datasetId !== previousDatasetIdRef.current) {
      reset(defaultValues)
      setReview(null)
      setValidationErrors([])
      setFormNotice('Metric and specification selections were cleared because the dataset changed.')
    }
    previousDatasetIdRef.current = dataset?.datasetId
  }, [dataset?.datasetId, reset])

  const selectedMetricColumn = dataset?.headers.find((column) => column.key === metricColumn)
  const aggregations = compatibleAggregations(metricKind, selectedMetricColumn)
  const proofContract = useMemo(
    () => (dataset && report ? buildProofContract(values, dataset, report) : []),
    [dataset, report, values],
  )
  const numericColumns =
    dataset?.headers.filter(
      (column) => column.inferredType === 'Integer' || column.inferredType === 'Decimal',
    ) ?? []
  const selectedKeys = useMemo(() => review?.requiredColumns ?? [], [review])
  const selectedQuality =
    report?.columns.filter((column) => selectedKeys.includes(column.key)) ?? []
  const planMutation = useMutation({ mutationFn: createAnalysisPlan })

  if (!dataset || !report) {
    return (
      <div className="page-container">
        <PageHeader
          title="Analysis"
          description="Build a structured analysis request from an inspected dataset."
        />
        <EmptyState
          title="No dataset is available"
          description="Add and inspect a dataset before creating an analysis specification."
        />
        <Link className="button button--primary empty-state-link" to="/workspace">
          Go to Data Workspace
        </Link>
      </div>
    )
  }
  const activeDataset = dataset
  const qualityReport = report

  function reviewSpecification(input: AnalysisFormValues) {
    const found = validateAnalysis(input, activeDataset, qualityReport)
    setValidationErrors(found)
    if (found.length) {
      setReview(null)
      requestAnimationFrame(() => summaryRef.current?.focus())
      return
    }
    const specification = analysisSpecificationSchema.parse(
      createSpecification(input, activeDataset),
    )
    setReview(specification)
    setFormNotice('Specification is valid and ready for review. No analysis has been executed.')
  }

  function invalidForm() {
    const found = validateAnalysis(getValues(), activeDataset, qualityReport)
    const resolverErrors = Object.entries(errors).flatMap(([field, error]) =>
      error?.message ? [{ field, message: String(error.message) }] : [],
    )
    setValidationErrors(found.length ? found : resolverErrors)
    requestAnimationFrame(() => summaryRef.current?.focus())
  }

  async function copySpecification() {
    if (!review) return
    await navigator.clipboard.writeText(JSON.stringify(review, null, 2))
    setCopied(true)
  }

  function addFilter() {
    fields.append({
      column: '',
      operator: '',
      value: '',
      secondValue: '',
      interpretMixedAsText: false,
    })
    requestAnimationFrame(() =>
      document.getElementById(`filter-${fields.fields.length}-column`)?.focus(),
    )
  }

  const labelFor = (key: string) => {
    const column = activeDataset.headers.find((item) => item.key === key)
    const missingCount = qualityReport.columns.find((item) => item.key === key)?.missingCount ?? 0
    return column
      ? `${column.header || 'Blank header'} (${column.key})${missingCount ? ` · ${missingCount} missing` : ''}`
      : key
  }

  return (
    <div className="page-container analysis-page">
      <PageHeader
        title="Analysis Workspace"
        description="Build and validate a deterministic analysis specification from the active dataset."
      />
      {notice && <StatusMessage status="warning">{notice}</StatusMessage>}
      <div className="analysis-layout">
        <div className="analysis-main">
          <section aria-labelledby="dataset-context">
            <h2 id="dataset-context">1. Dataset Context</h2>
            <DatasetSummary dataset={dataset} />
            <dl className="finding-counts">
              {(['error', 'warning', 'information', 'passed'] as const).map((severity) => (
                <div key={severity}>
                  <dt>{severity}</dt>
                  <dd>{report.summary[severity]}</dd>
                </div>
              ))}
            </dl>
            <div className="inline-links">
              <Link to="/workspace">Data Workspace</Link>
              <Link to="/data-quality">Data Quality</Link>
            </div>
          </section>
          <form
            onSubmit={(event) => {
              void handleSubmit(reviewSpecification, invalidForm)(event)
            }}
            noValidate
          >
            {validationErrors.length > 0 && (
              <div ref={summaryRef} className="error-summary" role="alert" tabIndex={-1}>
                <h2>Review the following issues</h2>
                <ul>
                  {validationErrors.map((error, index) => (
                    <li key={`${error.field}-${index}`}>
                      <a href={`#${error.field.replaceAll('.', '-')}`}>{error.message}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <section aria-labelledby="question-title">
              <h2 id="question-title">2. Analytical Question</h2>
              <label htmlFor="question">Ask one analytical question</label>
              <textarea
                id="question"
                maxLength={1000}
                rows={4}
                placeholder="Example question: Which region had the highest total profit during the selected period?"
                aria-describedby="question-help question-count"
                {...register('question')}
              />
              <div className="field-meta">
                <span id="question-help">
                  Automatic question interpretation requires the analysis backend. Build the
                  specification manually in this phase.
                </span>
                <span id="question-count">{question.length}/1000</span>
              </div>
              {errors.question && <p className="field-error">{errors.question.message}</p>}
            </section>
            <section ref={builderRef} aria-labelledby="builder-title">
              <h2 id="builder-title">3. Analysis Builder</h2>
              <fieldset id="metricKind">
                <legend>Metric type</legend>
                <div className="radio-row">
                  <label>
                    <input type="radio" value="column" {...register('metricKind')} />
                    Direct column
                  </label>
                  <label>
                    <input type="radio" value="row_count" {...register('metricKind')} />
                    Row count
                  </label>
                  <label>
                    <input type="radio" value="derived" {...register('metricKind')} />
                    Derived arithmetic
                  </label>
                </div>
              </fieldset>
              {metricKind === 'column' && (
                <div className="form-field">
                  <label htmlFor="metricColumn">Metric column</label>
                  <select id="metricColumn" {...register('metricColumn')}>
                    <option value="">Select a column</option>
                    {dataset.headers.map((column) => (
                      <option key={column.key} value={column.key}>
                        {labelFor(column.key)} · {column.inferredType}
                      </option>
                    ))}
                  </select>
                  {selectedMetricColumn?.inferredType === 'Mixed' && (
                    <p className="field-error">
                      This column has mixed inferred types. Only Count and Count distinct are
                      available.
                    </p>
                  )}
                </div>
              )}
              {metricKind === 'derived' && (
                <fieldset>
                  <legend>Derived metric</legend>
                  <div className="form-grid">
                    <label>
                      Left numeric column
                      <select id="leftColumn" {...register('leftColumn')}>
                        <option value="">Select a column</option>
                        {numericColumns.map((column) => (
                          <option key={column.key} value={column.key}>
                            {labelFor(column.key)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Operator
                      <select {...register('arithmeticOperator')}>
                        <option value="add">Add</option>
                        <option value="subtract">Subtract</option>
                        <option value="multiply">Multiply</option>
                        <option value="divide">Divide</option>
                      </select>
                    </label>
                    <label>
                      Right numeric column
                      <select {...register('rightColumn')}>
                        <option value="">Select a column</option>
                        {numericColumns.map((column) => (
                          <option key={column.key} value={column.key}>
                            {labelFor(column.key)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Display name
                      <input
                        id="derivedDisplayName"
                        maxLength={80}
                        {...register('derivedDisplayName')}
                      />
                    </label>
                  </div>
                </fieldset>
              )}
              <div className="form-field">
                <label htmlFor="aggregation">Aggregation</label>
                <select id="aggregation" {...register('aggregation')}>
                  <option value="">Select an aggregation</option>
                  {aggregations.map((aggregation) => (
                    <option key={aggregation} value={aggregation}>
                      {aggregationLabels[aggregation]}
                    </option>
                  ))}
                </select>
                <p className="help-text">
                  Only aggregations compatible with the selected metric are available.
                </p>
              </div>
              <fieldset>
                <legend>Group by up to two columns</legend>
                <p className="help-text">No grouping produces one overall result.</p>
                <div className="form-grid">
                  {[0, 1].map((index) => (
                    <label key={index}>
                      Group {index + 1}
                      <select
                        id={index === 0 ? 'groupBy' : undefined}
                        {...register(`groupBy.${index}`)}
                      >
                        <option value="">No group</option>
                        {dataset.headers.map((column) => (
                          <option key={column.key} value={column.key}>
                            {labelFor(column.key)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Filters</legend>
                <p className="help-text">All filters use AND. Dataset values are not modified.</p>
                {fields.fields.map((field, index) => {
                  const columnKey = values.filters[index]?.column
                  const column = dataset.headers.find((item) => item.key === columnKey)
                  const operators = column
                    ? filterOperators(
                        column.inferredType,
                        values.filters[index]?.interpretMixedAsText,
                      )
                    : []
                  const operator = values.filters[index]?.operator
                  const needsValue =
                    operator &&
                    !['is_missing', 'is_not_missing', 'is_true', 'is_false'].includes(operator)
                  return (
                    <div className="filter-row" key={field.id}>
                      <label>
                        Column
                        <select
                          id={`filter-${index}-column`}
                          {...register(`filters.${index}.column`)}
                        >
                          <option value="">Select column</option>
                          {dataset.headers.map((item) => (
                            <option key={item.key} value={item.key}>
                              {labelFor(item.key)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {column?.inferredType === 'Mixed' && (
                        <div>
                          <p className="field-error">
                            Mixed-type column. Only missing-value operators are available unless
                            text interpretation is confirmed.
                          </p>
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              {...register(`filters.${index}.interpretMixedAsText`)}
                            />
                            Confirm text interpretation
                          </label>
                        </div>
                      )}
                      <label>
                        Operator
                        <select
                          id={`filters-${index}-operator`}
                          {...register(`filters.${index}.operator`)}
                        >
                          <option value="">Select operator</option>
                          {operators.map((item) => (
                            <option key={item} value={item}>
                              {operatorLabels[item]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {needsValue && (
                        <label>
                          Value
                          <input
                            id={`filters-${index}-value`}
                            {...register(`filters.${index}.value`)}
                          />
                        </label>
                      )}
                      {operator === 'between' && (
                        <label>
                          Upper value
                          <input
                            id={`filters-${index}-secondValue`}
                            {...register(`filters.${index}.secondValue`)}
                          />
                        </label>
                      )}
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove filter ${index + 1}`}
                        title={`Remove filter ${index + 1}`}
                        onClick={() => {
                          fields.remove(index)
                          filterButtonRef.current?.focus()
                        }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )
                })}
                <Button ref={filterButtonRef} type="button" variant="secondary" onClick={addFilter}>
                  <Plus size={18} aria-hidden="true" />
                  Add filter
                </Button>
              </fieldset>
              <div className="form-grid">
                <label>
                  Sort by
                  <select id="sortTarget" {...register('sortTarget')}>
                    <option value="metric">Computed metric</option>
                    {groupBy?.filter(Boolean).map((key) => (
                      <option key={key} value={`group:${key}`}>
                        {labelFor(key)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Direction
                  <select {...register('sortDirection')}>
                    <option value="descending">Descending</option>
                    <option value="ascending">Ascending</option>
                  </select>
                </label>
                <label>
                  Result limit
                  <select
                    {...register('limit', { valueAsNumber: true })}
                    disabled={!groupBy?.filter(Boolean).length}
                  >
                    <option value={1}>1</option>
                    {[5, 10, 25, 50, 100].map((limit) => (
                      <option key={limit} value={limit}>
                        {limit}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
            <section aria-labelledby="contract-title">
              <h2 id="contract-title">4. Proof Contract Preview</h2>
              <p>
                The contract lists requirements for future execution. It is not a pass or
                verification result.
              </p>
              <ul className="contract-list">
                {proofContract.map((item) => (
                  <li key={item.id} className={`contract--${item.state}`}>
                    {item.state === 'satisfied' ? (
                      <CheckCircle2 aria-hidden="true" />
                    ) : item.state === 'blocking' ? (
                      <AlertCircle aria-hidden="true" />
                    ) : (
                      <CircleHelp aria-hidden="true" />
                    )}
                    <div>
                      <strong>{contractLabels[item.state]}</strong>
                      <span>{item.requirement}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="ambiguities-title">
              <h2 id="ambiguities-title">5. Ambiguities and Assumptions</h2>
              {report.columns.some((column) => column.missingCount > 0) && (
                <label className="decision">
                  <input
                    id="confirmMissingExclude"
                    type="checkbox"
                    {...register('confirmMissingExclude')}
                  />
                  <span>
                    <strong>Missing values</strong> Exclude rows with missing values in selected
                    columns.
                  </span>
                </label>
              )}
              {report.duplicateCount > 0 && (
                <label className="decision">
                  <input
                    id="confirmDuplicateKeep"
                    type="checkbox"
                    {...register('confirmDuplicateKeep')}
                  />
                  <span>
                    <strong>Duplicate rows</strong> Keep the {report.duplicateCount} exact duplicate{' '}
                    {report.duplicateCount === 1 ? 'row' : 'rows'}.
                  </span>
                </label>
              )}
              {report.columns.some((column) => column.ambiguousDateRows.length > 0) && (
                <label className="form-field">
                  Ambiguous date interpretation
                  <select id="dateInterpretation" {...register('dateInterpretation')}>
                    <option value="">Choose an interpretation</option>
                    <option value="day_first">Day first</option>
                    <option value="month_first">Month first</option>
                  </select>
                </label>
              )}
              {metricKind === 'derived' && values.arithmeticOperator === 'divide' && (
                <label className="form-field">
                  Division by zero
                  <select id="divisionHandling" {...register('divisionHandling')}>
                    <option value="">Choose handling</option>
                    <option value="exclude">Exclude affected rows</option>
                    <option value="null">Return null</option>
                  </select>
                </label>
              )}
              {report.columns.some((column) => column.currencies.length > 1) && (
                <StatusMessage status="warning">
                  Currency normalization requires backend support. No exchange rate is assumed.
                </StatusMessage>
              )}
            </section>
            <div className="analysis-actions">
              <Button type="submit">Validate and review</Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  reset(defaultValues)
                  resetDraft()
                  setReview(null)
                  setValidationErrors([])
                }}
              >
                Reset draft
              </Button>
            </div>
          </form>
          <section aria-labelledby="review-title">
            <h2 id="review-title">6. Request Review</h2>
            {review ? (
              <>
                <dl className="request-review">
                  <div>
                    <dt>Question</dt>
                    <dd>{review.question}</dd>
                  </div>
                  <div>
                    <dt>Dataset</dt>
                    <dd>{dataset.fileName}</dd>
                  </div>
                  <div>
                    <dt>Aggregation</dt>
                    <dd>{aggregationLabels[review.aggregation]}</dd>
                  </div>
                  <div>
                    <dt>Grouping</dt>
                    <dd>{review.groupBy.map(labelFor).join(', ') || 'Overall result'}</dd>
                  </div>
                  <div>
                    <dt>Filters</dt>
                    <dd>{review.filters.length}</dd>
                  </div>
                  <div>
                    <dt>Limit</dt>
                    <dd>{review.limit}</dd>
                  </div>
                  <div>
                    <dt>Required columns</dt>
                    <dd>{review.requiredColumns.map(labelFor).join(', ') || 'None'}</dd>
                  </div>
                  <div>
                    <dt>Assumptions</dt>
                    <dd>{review.assumptions.join(' ') || 'None confirmed'}</dd>
                  </div>
                  <div>
                    <dt>Blocking issues</dt>
                    <dd>
                      {
                        proofContract.filter(
                          (item) =>
                            item.state === 'blocking' || item.state === 'user_clarification',
                        ).length
                      }
                    </dd>
                  </div>
                </dl>
                <pre tabIndex={0} aria-label="Validated Analysis Specification JSON">
                  {JSON.stringify(review, null, 2)}
                </pre>
                <div className="analysis-actions">
                  <Button type="button" onClick={() => saveDraft(review)}>
                    Save draft
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void copySpecification()}
                  >
                    <Copy size={18} aria-hidden="true" />
                    Copy specification
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => builderRef.current?.scrollIntoView()}
                  >
                    Edit specification
                  </Button>
                </div>
              </>
            ) : (
              <p>
                Validate the form to review the exact Analysis Specification JSON. No analytical
                result will be produced.
              </p>
            )}
          </section>
        </div>
        <aside className="analysis-summary">
          <h2>Backend connection</h2>
          {!apiConfiguration.isConfigured ? (
            <StatusMessage status="warning">
              <ServerOff size={18} aria-hidden="true" />
              Analysis backend is not connected.
            </StatusMessage>
          ) : (
            <StatusMessage>
              API base URL is configured. Any request will use the typed API client.
            </StatusMessage>
          )}
          <Button
            disabled={!apiConfiguration.isConfigured || !review || planMutation.isPending}
            onClick={() =>
              review && planMutation.mutate(buildAnalysisPlanRequest(dataset, report, review))
            }
          >
            {planMutation.isPending ? 'Request pending' : 'Request analysis plan'}
          </Button>
          {!apiConfiguration.isConfigured && (
            <p className="help-text">
              Set VITE_API_BASE_URL explicitly to enable planning requests. No default URL is
              assumed.
            </p>
          )}
          {planMutation.isError && (
            <StatusMessage status="error">
              The configured backend request failed or returned an invalid response.
            </StatusMessage>
          )}
          {planMutation.data && (
            <StatusMessage status={planMutation.data.status === 'error' ? 'error' : 'info'}>
              Backend response: {planMutation.data.status}.{' '}
              {planMutation.data.status === 'ready'
                ? 'A plan was returned, but no analysis result has been executed.'
                : 'Review the response before continuing.'}
            </StatusMessage>
          )}
          <h2>Selected-column facts</h2>
          <ul>
            {selectedQuality.map((column) => (
              <li key={column.key}>
                {labelFor(column.key)}: {column.missingCount} missing
              </li>
            ))}
          </ul>
        </aside>
      </div>
      <div className="visually-hidden" role="status" aria-live="polite">
        {formNotice}
        {copied ? ' Specification copied.' : ''}
        {notice}
      </div>
    </div>
  )
}
