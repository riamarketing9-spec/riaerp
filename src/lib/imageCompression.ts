// Phone camera photos routinely land at 3-10MB straight off the device --
// uploaded as-is, that's what was filling up Supabase Storage and making
// uploads crawl/time out on weak mobile connections. Only real photos
// (jpeg/webp) above the threshold get re-encoded; small files and PNGs are
// left untouched since logos/icons often rely on PNG transparency that a
// JPEG re-encode would flatten to a white background.
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.8
const SKIP_BELOW_BYTES = 1024 * 1024

export async function compressImage(file: File): Promise<File> {
  if (file.type !== 'image/jpeg' && file.type !== 'image/webp') return file
  if (file.size < SKIP_BELOW_BYTES) return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob || blob.size >= file.size) return file

  const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], newName, { type: 'image/jpeg' })
}
