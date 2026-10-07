import type { UploadedFileMetadata } from '../types/dataset'

export const csvFixtures = {
  valid: 'name,age\nAda,36\nGrace,40',
  missing: 'name,score\nAda,10\nGrace,\nLinus,   ',
  duplicates: 'name,score\nAda,10\nGrace,20\nAda,10',
  duplicateHeaders: 'name,name\nAda,Lovelace',
  invalidNumeric: 'item,amount\nA,1\nB,2\nC,3\nD,4\nE,not-a-number',
  mixedDates: 'event,date\nA,2024-01-15\nB,13/02/2024\nC,01/02/2024',
  mixedCurrencies: 'item,price\nA,$10\nB,EUR 20',
  outliers: 'item,value\nA,1\nB,2\nC,2\nD,3\nE,100',
  malformed: 'name,age\n"Ada,36',
} as const

export function csvMetadata(
  name = 'fixture.csv',
  content: string = csvFixtures.valid,
): UploadedFileMetadata {
  return {
    name,
    type: 'csv',
    size: new Blob([content]).size,
    mimeType: 'text/csv',
    lastModified: 0,
  }
}
