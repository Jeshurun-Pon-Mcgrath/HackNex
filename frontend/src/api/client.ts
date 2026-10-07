import {
  analysisPlanRequestSchema,
  analysisPlanResponseSchema,
  healthResponseSchema,
  type AnalysisPlanRequest,
} from './contracts'

const rawApiBaseUrl: unknown = import.meta.env.VITE_API_BASE_URL
const configuredBaseUrl =
  typeof rawApiBaseUrl === 'string' && rawApiBaseUrl.trim() ? rawApiBaseUrl.trim() : null
export const apiConfiguration = {
  baseUrl: configuredBaseUrl,
  isConfigured: configuredBaseUrl !== null,
} as const

async function request(path: string, init?: RequestInit) {
  if (!configuredBaseUrl) throw new Error('Analysis backend is not configured.')
  const response = await fetch(`${configuredBaseUrl.replace(/\/$/, '')}${path}`, init)
  if (!response.ok)
    throw new Error(`Analysis backend request failed with status ${response.status}.`)
  return response.json() as Promise<unknown>
}
export async function getHealth() {
  return healthResponseSchema.parse(await request('/api/v1/health'))
}
export async function createAnalysisPlan(input: AnalysisPlanRequest) {
  const payload = analysisPlanRequestSchema.parse(input)
  return analysisPlanResponseSchema.parse(
    await request('/api/v1/analysis/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  )
}
