import { z } from 'zod'
import { analysisSpecificationSchema } from '../lib/analysisSchema'

const schemaColumn = z.object({
  key: z.string(),
  label: z.string(),
  inferredType: z.enum(['Integer', 'Decimal', 'Boolean', 'Date', 'Text', 'Empty', 'Mixed']),
  missingCount: z.number().int().nonnegative(),
})
const qualitySummary = z.object({
  error: z.number().int().nonnegative(),
  warning: z.number().int().nonnegative(),
  information: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
})
export const analysisPlanRequestSchema = z.object({
  datasetReference: z.object({
    datasetId: z.string(),
    fileName: z.string(),
    selectedSheet: z.string().nullable(),
  }),
  datasetSchema: z.array(schemaColumn),
  dataQualitySummary: qualitySummary,
  question: z.string().min(1).max(1000),
  specification: analysisSpecificationSchema.optional(),
})
export const analysisPlanResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ready'), planId: z.string().min(1), message: z.string() }),
  z.object({
    status: z.literal('needs_clarification'),
    questions: z.array(z.string()),
    message: z.string(),
  }),
  z.object({ status: z.literal('unanswerable'), reason: z.string() }),
  z.object({ status: z.literal('error'), message: z.string() }),
])
export const healthResponseSchema = z.object({ status: z.enum(['ok', 'degraded', 'unavailable']) })
export type AnalysisPlanRequest = z.infer<typeof analysisPlanRequestSchema>
export type AnalysisPlanResponse = z.infer<typeof analysisPlanResponseSchema>
export type HealthResponse = z.infer<typeof healthResponseSchema>
