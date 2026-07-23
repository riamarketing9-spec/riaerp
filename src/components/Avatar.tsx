import { cn } from '@/lib/utils'

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// Single source of truth for "person tile" everywhere in the app: shows the
// uploaded photo once profiles.avatar_url is set, falls back to initials
// otherwise. Defaults to a small rounded square (matches the sidebar); pass
// className (e.g. "rounded-full size-6") to override shape/size elsewhere.
export function Avatar({
  name,
  avatarUrl,
  className,
}: {
  name: string
  avatarUrl?: string | null
  className?: string
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={cn('size-8 shrink-0 rounded-md object-cover', className)}
      />
    )
  }
  return (
    <div
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-500 text-xs font-semibold text-white',
        className
      )}
    >
      {initialsOf(name)}
    </div>
  )
}
