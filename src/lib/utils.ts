import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Users type URLs into plain text inputs (reference_url, video_url, ...)
// without a scheme, e.g. "google.com" -- used directly as an <a href>, the
// browser resolves that as a path on the current site instead of an
// external link, so the "link" silently does nothing. Prepend https:// for
// anything that isn't already a recognized absolute scheme.
export function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}
