import { z } from 'zod'

const cellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

export const activeDatasetSchema = z.object({
  datasetId: z.string().min(1),
  fileName: z.string().min(1),
  fileType: z.enum(['csv', 'xlsx']),
  fileSize: z.number().nonnegative(),
  selectedSheet: z.string().nullable(),
  availableSheets: z.array(z.object({ name: z.string(), index: z.number().int().nonnegative() })),
  headers: z.array(
    z.object({
      key: z.string().min(1),
      header: z.string(),
      position: z.number().int().nonnegative(),
      inferredType: z.enum(['Integer', 'Decimal', 'Boolean', 'Date', 'Text', 'Empty', 'Mixed']),
    }),
  ),
  rows: z.array(z.record(z.string(), cellValueSchema)),
  rowCount: z.number().int().nonnegative(),
  columnCount: z.number().int().nonnegative(),
  parseWarnings: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      row: z.number().int().positive().optional(),
      column: z.number().int().positive().optional(),
    }),
  ),
  loadedAt: z.string(),
})
