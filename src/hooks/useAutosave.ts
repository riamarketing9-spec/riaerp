import { useEffect, useRef, useState } from 'react'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// Debounced "save as you type" for form sheets/dialogs, so closing a form
// without hitting the explicit submit button doesn't lose in-progress work.
// No debounce library in the project -- this is deliberately small and
// dependency-free rather than pulling in lodash/use-debounce for one hook.
//
// `resetKey` should change whenever `values` is repopulated from a freshly
// loaded record (e.g. the record id, or its updated_at) so that populating
// the form doesn't itself look like a user edit and trigger a save.
export function useAutosave<T>(
  values: T,
  onSave: (values: T) => Promise<void>,
  opts: { enabled: boolean; resetKey: unknown; delay?: number }
): AutosaveStatus {
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const baselineRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Always call the latest onSave (not the one captured when the timer was
  // scheduled) -- a draft's id can change between scheduling and firing.
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const serialized = JSON.stringify(values)
  const wasEnabledRef = useRef(opts.enabled)

  useEffect(() => {
    baselineRef.current = serialized
    setStatus('idle')
    // Only rebase on resetKey changes, not on every value change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.resetKey])

  useEffect(() => {
    if (!opts.enabled) {
      clearTimeout(timerRef.current)
      // `enabled` just flipped true -> false (e.g. a dialog closing) with
      // an edit still sitting in the debounce window -- without this, the
      // pending setTimeout above gets cancelled by the cleanup below and
      // that edit is silently lost forever, never reaching the DB. Save it
      // immediately instead of dropping it (fire-and-forget: nothing is
      // listening for status once the dialog is gone).
      if (wasEnabledRef.current && baselineRef.current !== null && serialized !== baselineRef.current) {
        onSaveRef.current(JSON.parse(serialized) as T).catch(() => {})
        baselineRef.current = serialized
      }
      wasEnabledRef.current = opts.enabled
      return
    }
    wasEnabledRef.current = opts.enabled

    if (baselineRef.current === null) baselineRef.current = serialized
    if (serialized === baselineRef.current) return

    clearTimeout(timerRef.current)
    setStatus('saving')
    timerRef.current = setTimeout(() => {
      onSaveRef.current(JSON.parse(serialized) as T)
        .then(() => {
          baselineRef.current = serialized
          setStatus('saved')
        })
        .catch(() => setStatus('error'))
    }, opts.delay ?? 900)

    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, opts.enabled])

  return status
}
