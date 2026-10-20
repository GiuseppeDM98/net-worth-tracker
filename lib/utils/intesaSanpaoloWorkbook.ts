/**
 * The browser half of the Intesa Sanpaolo import: read one `.xlsx` file into rows.
 *
 * The XLSX reader is imported LAZILY so the settings page does not pay for it until the user
 * actually chooses a file. The pure parsing/planning lives in `intesaSanpaoloImport.ts`.
 */

import {
  IntesaParseError,
  parseIntesaWorkbook,
  type IntesaWorkbook,
} from '@/lib/utils/intesaSanpaoloImport';

const XLSX_EXTENSION = '.xlsx';

export async function readIntesaWorkbookFile(file: File): Promise<IntesaWorkbook> {
  if (!file.name.toLowerCase().endsWith(XLSX_EXTENSION)) {
    throw new IntesaParseError('Il file deve essere un .xlsx esportato da Intesa Sanpaolo.');
  }
  try {
    const { readSheet } = await import('read-excel-file/browser');
    const rows = await readSheet(file);
    return parseIntesaWorkbook(rows);
  } catch (error) {
    if (error instanceof IntesaParseError) throw error;
    throw new IntesaParseError(
      'Il file non è un XLSX leggibile: esporta di nuovo il portafoglio da Intesa Sanpaolo.'
    );
  }
}
