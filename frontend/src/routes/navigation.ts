import { ChartNoAxesColumn, Database, FileCheck2, GitBranch, ShieldCheck } from 'lucide-react'
import type { ProductPageConfig } from '../types/navigation'

export const productPages: ProductPageConfig[] = [
  {
    path: 'workspace',
    title: 'Data Workspace',
    description: 'Load one CSV or XLSX dataset for local inspection and preview.',
    emptyTitle: 'No dataset has been added',
    emptyDescription: 'Choose a supported file to begin local inspection.',
    icon: Database,
  },
  {
    path: 'data-quality',
    title: 'Data Quality',
    description: 'Review structural checks and data quality findings for connected datasets.',
    emptyTitle: 'No quality checks are available',
    emptyDescription: 'Add a CSV or XLSX file in Data Workspace before running quality checks.',
    icon: ShieldCheck,
  },
  {
    path: 'analysis',
    title: 'Analysis',
    description: 'Build a validated analysis request from the active dataset.',
    emptyTitle: 'No analysis has been created',
    emptyDescription: 'Add and inspect a dataset before creating an analysis specification.',
    icon: ChartNoAxesColumn,
  },
  {
    path: 'evidence-lineage',
    title: 'Evidence Lineage',
    description: 'Trace the sources and execution paths behind verified analytical results.',
    emptyTitle: 'No evidence lineage is available',
    emptyDescription:
      'Evidence lineage will appear after analysis and verification are implemented.',
    icon: GitBranch,
  },
  {
    path: 'reports',
    title: 'Reports',
    description: 'Prepare proof reports from completed and verified analyses.',
    emptyTitle: 'No reports have been created',
    emptyDescription: 'Report generation is not connected in Phase 1.',
    icon: FileCheck2,
  },
]
