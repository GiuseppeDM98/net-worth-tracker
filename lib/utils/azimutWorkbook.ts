/**
 * The browser half of the Azimut import: read one `.xlsx` file into rows across all sheets.
 *
 * The XLSX reader is imported LAZILY so the settings page does not pay for it until the user
 * actually chooses a file. The pure parsing/planning lives in `azimutImport.ts`.
 */

import {
  AzimutParseError,
  parseAzimutWorkbook,
  type AzimutWorkbook,
  type AzimutSheetData,
} from '@/lib/utils/azimutImport';

const XLSX_EXTENSION = '.xlsx';

export async function readAzimutWorkbookFile(file: File): Promise<AzimutWorkbook> {
  if (!file.name.toLowerCase().endsWith(XLSX_EXTENSION)) {
    throw new AzimutParseError('Il file deve essere un .xlsx esportato da Azimut.');
  }
  try {
    const readXlsxFile = (await import('read-excel-file/browser')).default;
    const sheetsData = (await readXlsxFile(file)) as AzimutSheetData[];
    return parseAzimutWorkbook(sheetsData);
  } catch (error) {
    if (error instanceof AzimutParseError) throw error;
    throw new AzimutParseError(
      'Il file non è un XLSX leggibile: esporta di nuovo il portafoglio da Azimut.'
    );
  }
}
