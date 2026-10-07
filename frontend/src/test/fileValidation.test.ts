import { MAX_FILE_SIZE, validateDatasetFile } from '../lib/fileValidation'

describe('dataset file validation', () => {
  it('accepts a valid CSV selection', () => {
    const result = validateDatasetFile(new File(['name\nAda'], 'people.csv', { type: 'text/csv' }))
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.metadata.type).toBe('csv')
  })

  it('rejects unsupported extensions', () => {
    const result = validateDatasetFile(
      new File(['data'], 'people.xls', { type: 'application/vnd.ms-excel' }),
    )
    expect(result).toEqual({
      valid: false,
      message: 'This file type is not supported. Choose a CSV or XLSX file.',
    })
  })

  it('rejects files larger than the Phase 2 limit', () => {
    const file = new File(['data'], 'large.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'size', { value: MAX_FILE_SIZE + 1 })
    const result = validateDatasetFile(file)
    expect(result).toEqual({
      valid: false,
      message: 'This file is larger than the 20 MB Phase 2 limit. Choose a smaller file.',
    })
  })
})
