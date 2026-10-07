import { z } from 'zod'

const arithmeticOperatorSchema = z.enum(['add', 'subtract', 'multiply', 'divide'])
const aggregationSchema = z.enum([
  'sum',
  'average',
  'count',
  'count_distinct',
  'minimum',
  'maximum',
])
const limitSchema = z.union([
  z.literal(1),
  z.literal(5),
  z.literal(10),
  z.literal(25),
  z.literal(50),
  z.literal(100),
])

export const analysisMetricSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('column'), column: z.string().min(1) }),
  z.object({ kind: z.literal('row_count') }),
  z.object({
    kind: z.literal('derived'),
    leftColumn: z.string().min(1),
    operator: arithmeticOperatorSchema,
    rightColumn: z.string().min(1),
    displayName: z.string().trim().min(1).max(80),
  }),
])

export const analysisFilterSchema = z.object({
  column: z.string().min(1),
  operator: z.string().min(1),
  value: z.string().optional(),
  secondValue: z.string().optional(),
  interpretMixedAsText: z.boolean().optional(),
})

export const analysisSpecificationSchema = z.object({
  version: z.literal('1.0'),
  datasetId: z.string().min(1),
  question: z.string().trim().min(1).max(1000),
  metric: analysisMetricSchema,
  aggregation: aggregationSchema,
  groupBy: z
    .array(z.string().min(1))
    .max(2)
    .refine((values) => new Set(values).size === values.length, 'Group-by columns must be unique.'),
  filters: z.array(analysisFilterSchema),
  sort: z.object({ target: z.string().min(1), direction: z.enum(['ascending', 'descending']) }),
  limit: limitSchema,
  requiredColumns: z.array(z.string().min(1)),
  assumptions: z.array(z.string()),
  createdAt: z.string().datetime(),
})

export const analysisFormSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, 'Enter one analytical question.')
    .max(1000, 'Question must be 1,000 characters or fewer.'),
  metricKind: z.enum(['', 'column', 'row_count', 'derived']),
  metricColumn: z.string(),
  leftColumn: z.string(),
  arithmeticOperator: arithmeticOperatorSchema,
  rightColumn: z.string(),
  derivedDisplayName: z.string(),
  aggregation: z.union([z.literal(''), aggregationSchema]),
  groupBy: z.array(z.string()).max(2),
  filters: z.array(analysisFilterSchema),
  sortTarget: z.string().min(1),
  sortDirection: z.enum(['ascending', 'descending']),
  limit: limitSchema,
  confirmMissingExclude: z.boolean(),
  confirmDuplicateKeep: z.boolean(),
  dateInterpretation: z.enum(['', 'day_first', 'month_first']),
  divisionHandling: z.enum(['', 'exclude', 'null']),
})
