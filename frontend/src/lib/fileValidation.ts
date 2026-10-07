import type { FileType, UploadedFileMetadata } from '../types/dataset'

export const MAX_FILE_SIZE = 20 * 1024 * 1024
const mimeTypes: Record<FileType, string[]> = {
  csv: ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'],
  xlsx: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
  ],
}

export type FileValidationResult =
  { valid: true; metadata: UploadedFileMetadata } | { valid: false; message: string }

export function validateDatasetFile(file: File | null): FileValidationResult {
  if (!file) return { valid: false, message: 'Choose a CSV or XLSX file to continue.' }
  if (
    [...file.name].some((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127
    })
  ) {
    return {
      valid: false,
      message:
        'The filename contains unsupported control characters. Rename the file and try again.',
    }
  }
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension !== 'csv' && extension !== 'xlsx') {
    return { valid: false, message: 'This file type is not supported. Choose a CSV or XLSX file.' }
  }
  if (file.size === 0) {
    return {
      valid: false,
      message: 'This file is empty. Choose a CSV or XLSX file that contains data.',
    }
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      message: 'This file is larger than the 20 MB Phase 2 limit. Choose a smaller file.',
    }
  }
  if (file.type && !mimeTypes[extension].includes(file.type)) {
    return {
      valid: false,
      message: `The file extension and browser file type do not agree. Choose a valid .${extension} file.`,
    }
  }
  return {
    valid: true,
    metadata: {
      name: file.name,
      type: extension,
      size: file.size,
      mimeType: file.type,
      lastModified: file.lastModified,
    },
  }
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
