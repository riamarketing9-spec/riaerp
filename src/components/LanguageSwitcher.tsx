import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

const LANGS = [
  { code: 'ru', label: 'RU' },
  { code: 'uz', label: "UZ" },
] as const

export function LanguageSwitcher() {
  const { i18n } = useTranslation()

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
      {LANGS.map((lang) => (
        <button
          key={lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
          className={cn(
            'rounded px-2 py-1 text-xs font-medium transition-colors',
            i18n.resolvedLanguage === lang.code
              ? 'bg-brand-500 text-white'
              : 'text-muted-foreground hover:bg-muted'
          )}
        >
          {lang.label}
        </button>
      ))}
    </div>
  )
}
