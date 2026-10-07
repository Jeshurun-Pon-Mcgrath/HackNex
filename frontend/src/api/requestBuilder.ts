import { analysisPlanRequestSchema, type AnalysisPlanRequest } from './contracts'
import type { ActiveDataset, DataQualityReport } from '../types/dataset'
import type { AnalysisSpecification } from '../types/analysis'

export function buildAnalysisPlanRequest(
  dataset: ActiveDataset,
  report: DataQualityReport,
  specification: AnalysisSpecification,
): AnalysisPlanRequest {
  return analysisPlanRequestSchema.parse({
    datasetReference: {
      datasetId: dataset.datasetId,
      fileName: dataset.fileName,
      selectedSheet: dataset.selectedSheet,
    },
    datasetSchema: dataset.headers.map((column) => ({
      key: column.key,
      label: column.header,
      inferredType: column.inferredType,
      missingCount: report.columns.find((quality) => quality.key === column.key)?.missingCount ?? 0,
    })),
    dataQualitySummary: { ...report.summary, duplicateCount: report.duplicateCount },
    question: specification.question,
    specification,
  })
}
