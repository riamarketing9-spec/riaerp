import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Upload, X } from 'lucide-react'
import { toast } from 'sonner'

export function FileUpload({
  value,
  onChange,
  accept,
  folder = 'misc',
}: {
  value: string
  onChange: (url: string) => void
  accept?: string
  folder?: string
}) {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const path = `${folder}/${crypto.randomUUID()}-${file.name}`
      const { error } = await supabase.storage.from('attachments').upload(path, file)
      if (error) throw error
      // Bucket is private — a long-lived signed URL (10 years) is what
      // actually gets stored, since a plain public URL wouldn't resolve.
      const { data, error: signError } = await supabase.storage
        .from('attachments')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
      if (signError) throw signError
      onChange(data.signedUrl)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          className="flex-1"
        />
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" />
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange('')}>
            <X className="size-4" />
          </Button>
        )}
      </div>
      {uploading && <p className="text-xs text-muted-foreground">{t('common.loading')}...</p>}
    </div>
  )
}
