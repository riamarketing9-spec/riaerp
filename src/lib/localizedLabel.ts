export function pickLabel(
  row: { label_ru: string; label_uz: string } | null | undefined,
  language: string
): string | undefined {
  if (!row) return undefined
  return language.startsWith('uz') ? row.label_uz : row.label_ru
}

export function formatLocalDate(dateStr: string | null | undefined, language: string): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString(language.startsWith('uz') ? 'uz-Latn-UZ' : 'ru-RU')
}
