import { useTranslation } from 'react-i18next'

const DUE_SOON_MS = 3 * 24 * 60 * 60 * 1000

// Spells out overdue/due-soon as a labeled chip instead of a bare date --
// a plain date left the reader to do the "is this late?" math themselves.
export function DeadlineBadge({ deadline }: { deadline: string | null }) {
  const { t } = useTranslation()

  if (!deadline) return <span className="shrink-0 text-xs text-muted-foreground">—</span>

  const time = new Date(deadline).getTime()
  const now = Date.now()
  const dateStr = new Date(deadline).toLocaleDateString()

  if (time < now) {
    return (
      <span
        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
        style={{ background: '#a3c9bc', color: '#05261d' }}
      >
        {t('dashboard.overdue')} · {dateStr}
      </span>
    )
  }
  if (time <= now + DUE_SOON_MS) {
    return (
      <span
        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
        style={{ background: '#eaf3f0', color: '#0a4235' }}
      >
        {t('dashboard.dueSoon')} · {dateStr}
      </span>
    )
  }
  return <span className="shrink-0 text-xs text-muted-foreground">{dateStr}</span>
}
