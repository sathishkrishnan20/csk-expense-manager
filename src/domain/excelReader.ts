import * as XLSX from "xlsx";

// Binary .xls starts with the Compound Document File signature D0 CF 11 E0.
// .xlsx starts with PK (50 4B), the ZIP header.
export function isExcelBinary(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const xls = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  const xlsx = bytes[0] === 0x50 && bytes[1] === 0x4b;
  return xls || xlsx;
}

// Reads the first sheet of a binary XLS or XLSX file and returns its contents
// as CSV text, ready for parseStatement.
export function excelToCSV(bytes: Uint8Array): string {
  const wb = XLSX.read(bytes, { type: "array" });
  if (wb.SheetNames.length === 0) {
    throw new Error("The Excel file has no sheets.");
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_csv(ws);
}
