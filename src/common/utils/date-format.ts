/**
 * Utilidades de formateo de fechas para integración con la DGII.
 * La DGII requiere formato dd-mm-yyyy en los documentos XML de e-CF.
 */

/**
 * Formatea una fecha al formato requerido por la DGII: dd-mm-yyyy
 * @param date - Date object o string ISO parseable
 * @returns Fecha en formato dd-mm-yyyy
 */
export function formatDateDgii(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Formatea una fecha al formato ISO yyyy-mm-dd
 * @param date - Date object o string parseable
 * @returns Fecha en formato yyyy-mm-dd
 */
export function formatDateIso(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}
