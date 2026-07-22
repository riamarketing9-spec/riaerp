import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Play, Square } from 'lucide-react'

function deviceLabel() {
  const ua = navigator.userAgent
  if (/Mobi|Android/i.test(ua)) return 'Telefon'
  if (/Mac/i.test(ua)) return 'Mac'
  if (/Win/i.test(ua)) return 'Windows'
  return 'Brauzer'
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

export function TimeTrackerWidget() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [now, setNow] = useState(() => Date.now())
  // mutation.isPending only flips true after the next render, leaving a
  // window for a fast double-click to fire two inserts before the button
  // visually disables -- this local flag disables it synchronously.
  const [justClicked, setJustClicked] = useState(false)

  const { data: openEntry, isLoading } = useQuery({
    queryKey: ['my-open-time-entry', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('id, started_at')
        .eq('profile_id', profile!.id)
        .is('ended_at', null)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    if (!openEntry) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [openEntry])

  function reportError(err: Error) {
    // A double-click race can still slip two inserts past the disabled
    // button; the DB's one-open-entry-per-profile unique index rejects the
    // second one -- translate that into something an employee understands
    // instead of showing raw Postgres constraint text.
    if (err.message.includes('time_entries_one_open_per_profile')) {
      toast.error(t('attendance.alreadyStarted'))
      queryClient.invalidateQueries({ queryKey: ['my-open-time-entry', profile?.id] })
      return
    }
    toast.error(err.message)
  }

  const startMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('time_entries')
        .insert({ profile_id: profile!.id, started_device: deviceLabel() })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-open-time-entry', profile?.id] }),
    onError: reportError,
    onSettled: () => setJustClicked(false),
  })

  const stopMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('time_entries')
        .update({ ended_at: new Date().toISOString(), ended_device: deviceLabel() })
        .eq('id', openEntry!.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-open-time-entry', profile?.id] }),
    onError: reportError,
    onSettled: () => setJustClicked(false),
  })

  const elapsedMs = openEntry ? now - new Date(openEntry.started_at).getTime() : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{t('attendance.widgetTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        {openEntry ? (
          <>
            <div className="flex flex-col">
              <span className="font-mono text-xl font-semibold tabular-nums">{formatElapsed(elapsedMs)}</span>
              <span className="text-xs text-muted-foreground">{t('attendance.working')}</span>
            </div>
            <Button
              variant="destructive"
              disabled={justClicked || stopMutation.isPending}
              onClick={() => {
                setJustClicked(true)
                stopMutation.mutate()
              }}
            >
              <Square className="size-4" />
              {t('attendance.stop')}
            </Button>
          </>
        ) : (
          <>
            <span className="text-sm text-muted-foreground">{t('attendance.notWorking')}</span>
            <Button
              disabled={isLoading || justClicked || startMutation.isPending}
              onClick={() => {
                setJustClicked(true)
                startMutation.mutate()
              }}
            >
              <Play className="size-4" />
              {t('attendance.start')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
