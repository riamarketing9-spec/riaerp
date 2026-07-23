import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { Folder, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

// A full square tile: shows the project's logo edge-to-edge once set, a
// folder placeholder otherwise. The pencil button in the corner uploads a
// new image straight from disk and writes projects.logo_url immediately --
// no separate dialog, since this square IS the logo once one exists.
export function ProjectLogoSquare({
  projectId,
  logoUrl,
  onUploaded,
  className,
}: {
  projectId: string
  logoUrl: string | null
  onUploaded: () => void
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const path = `project-logos/${projectId}-${crypto.randomUUID()}-${file.name}`
      const { error } = await supabase.storage.from('attachments').upload(path, file)
      if (error) throw error
      // Bucket is private — a long-lived signed URL is what actually gets
      // stored, since a plain public URL wouldn't resolve.
      const { data, error: signError } = await supabase.storage
        .from('attachments')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
      if (signError) throw signError
      const { error: updateError } = await supabase.from('projects').update({ logo_url: data.signedUrl }).eq('id', projectId)
      if (updateError) throw updateError
      onUploaded()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={cn('relative aspect-square w-full overflow-hidden bg-muted', className)}>
      {logoUrl ? (
        <img src={logoUrl} alt="" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center">
          <Folder className="size-10 text-muted-foreground" />
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={(e) => {
          e.stopPropagation()
          inputRef.current?.click()
        }}
        className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background disabled:opacity-50"
      >
        <Pencil className="size-3.5" />
      </button>
    </div>
  )
}
