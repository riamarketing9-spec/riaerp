import { Folder } from 'lucide-react'
import { cn } from '@/lib/utils'

// A full square tile: shows the project's logo edge-to-edge once set, a
// folder placeholder otherwise. Logo changes happen in the project edit
// dialog (Projects page) only -- no quick-upload here, since it made the
// folder grid confusing (unclear it was an edit action, not part of
// navigating into the folder).
export function ProjectLogoSquare({
  logoUrl,
  className,
}: {
  logoUrl: string | null
  className?: string
}) {
  return (
    <div className={cn('relative aspect-square w-full overflow-hidden bg-muted', className)}>
      {logoUrl ? (
        <img src={logoUrl} alt="" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center">
          <Folder className="size-10 text-muted-foreground" />
        </div>
      )}
    </div>
  )
}
