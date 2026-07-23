import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Combobox } from '@/components/ui/combobox'
import { Avatar } from '@/components/Avatar'
import { formatLocalDateTime } from '@/lib/localizedLabel'
import { Square, Trophy } from 'lucide-react'

type DateMode = 'today' | 'yesterday' | 'week' | 'month' | 'range'

function dayBounds(date: Date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

function formatDuration(ms: number) {
  const totalMinutes = Math.floor(ms / 60000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}h ${m}m`
}

export function AttendancePage() {
  const { t, i18n } = useTranslation()
  const { hasCapability } = useAuth()
  const canForceStop = hasCapability('org.full_access')
  // A plain employee only ever gets their own rows back from RLS anyway, so
  // the "who else is working"/leaderboard/employee-picker sections -- built
  // for PM/CEO to watch the team -- are hidden rather than shown pointlessly
  // scoped to just themselves.
  const isManagement = hasCapability('org.full_access') || hasCapability('projects.manage')
  const queryClient = useQueryClient()
  const [dateMode, setDateMode] = useState<DateMode>('today')
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')

  const { data: profiles } = useQuery({
    queryKey: ['profiles-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, avatar_url')
      if (error) throw error
      return data
    },
  })

  const { start, end } = useMemo(() => {
    if (dateMode === 'today') return dayBounds(new Date())
    if (dateMode === 'yesterday') {
      const y = new Date()
      y.setDate(y.getDate() - 1)
      return dayBounds(y)
    }
    if (dateMode === 'week') {
      const { end: todayEnd } = dayBounds(new Date())
      const weekStart = new Date(todayEnd)
      weekStart.setDate(weekStart.getDate() - 7)
      return { start: weekStart, end: todayEnd }
    }
    if (dateMode === 'month') {
      const { end: todayEnd } = dayBounds(new Date())
      const monthStart = new Date(todayEnd)
      monthStart.setDate(monthStart.getDate() - 30)
      return { start: monthStart, end: todayEnd }
    }
    return {
      start: rangeFrom ? new Date(rangeFrom) : dayBounds(new Date()).start,
      end: rangeTo ? new Date(new Date(rangeTo).getTime() + 24 * 60 * 60 * 1000) : dayBounds(new Date()).end,
    }
  }, [dateMode, rangeFrom, rangeTo])

  const { data: currentlyWorking } = useQuery({
    queryKey: ['attendance-open'],
    enabled: isManagement,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('id, profile_id, started_at, started_device')
        .is('ended_at', null)
      if (error) throw error
      return data
    },
    refetchInterval: 30_000,
  })

  const { data: entries, isLoading } = useQuery({
    queryKey: ['attendance-entries', start.toISOString(), end.toISOString(), employeeFilter, dateMode],
    queryFn: async () => {
      let query = supabase
        .from('time_entries')
        .select('id, profile_id, started_at, ended_at, started_device, ended_device')
        .order('started_at', { ascending: false })
      // "Today" should also surface a session that started before midnight
      // and is still running -- otherwise someone working through the
      // night silently disappears from the "today" history the moment
      // their shift crosses midnight, even though the live panel above
      // still shows them as working.
      if (dateMode === 'today') {
        query = query.or(`and(started_at.gte.${start.toISOString()},started_at.lt.${end.toISOString()}),ended_at.is.null`)
      } else {
        query = query.gte('started_at', start.toISOString()).lt('started_at', end.toISOString())
      }
      if (employeeFilter) query = query.eq('profile_id', employeeFilter)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })

  const forceStopMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('time_entries')
        .update({ ended_at: new Date().toISOString(), ended_device: 'CEO (majburiy to\'xtatish)' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-open'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-entries'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const nameFor = (id: string) => profiles?.find((p) => p.id === id)?.full_name ?? '—'
  const avatarUrlFor = (id: string) => profiles?.find((p) => p.id === id)?.avatar_url

  // Who worked most in the selected period -- aggregates the same `entries`
  // the history list below already fetched, so no extra query.
  const leaderboard = useMemo(() => {
    const totals = new Map<string, number>()
    for (const e of entries ?? []) {
      const durationMs = (e.ended_at ? new Date(e.ended_at).getTime() : Date.now()) - new Date(e.started_at).getTime()
      totals.set(e.profile_id, (totals.get(e.profile_id) ?? 0) + durationMs)
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1])
  }, [entries])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">{t('attendance.title')}</h1>

      {isManagement && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">{t('attendance.currentlyWorking')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(currentlyWorking?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">{t('attendance.noneWorking')}</p>
            )}
            {currentlyWorking?.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg border border-emerald-300/50 bg-emerald-50 p-2.5 text-sm dark:bg-emerald-900/20">
                <div className="flex items-center gap-2">
                  <Avatar name={nameFor(e.profile_id)} avatarUrl={avatarUrlFor(e.profile_id)} className="size-6 rounded-full" />
                  <span className="font-medium">{nameFor(e.profile_id)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t('attendance.since')} {formatLocalDateTime(e.started_at, i18n.language)}
                    {e.started_device ? ` · ${e.started_device}` : ''}
                  </span>
                  <Badge className="bg-emerald-500 text-white">{t('attendance.working')}</Badge>
                  {canForceStop && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={forceStopMutation.isPending}
                      onClick={() => forceStopMutation.mutate(e.id)}
                    >
                      <Square className="size-3.5" />
                      {t('attendance.forceStop')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{t('attendance.period')}</Label>
          <div className="flex gap-1">
            <Button size="sm" variant={dateMode === 'today' ? 'default' : 'outline'} onClick={() => setDateMode('today')}>
              {t('attendance.today')}
            </Button>
            <Button size="sm" variant={dateMode === 'yesterday' ? 'default' : 'outline'} onClick={() => setDateMode('yesterday')}>
              {t('attendance.yesterday')}
            </Button>
            <Button size="sm" variant={dateMode === 'week' ? 'default' : 'outline'} onClick={() => setDateMode('week')}>
              {t('attendance.week')}
            </Button>
            <Button size="sm" variant={dateMode === 'month' ? 'default' : 'outline'} onClick={() => setDateMode('month')}>
              {t('attendance.month')}
            </Button>
            <Button size="sm" variant={dateMode === 'range' ? 'default' : 'outline'} onClick={() => setDateMode('range')}>
              {t('attendance.range')}
            </Button>
          </div>
        </div>
        {dateMode === 'range' && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t('attendance.from')}</Label>
              <Input type="date" className="w-40" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t('attendance.to')}</Label>
              <Input type="date" className="w-40" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
            </div>
          </>
        )}
        {isManagement && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t('attendance.employee')}</Label>
            <Combobox
              className="w-48"
              options={(profiles ?? []).map((p) => ({ value: p.id, label: p.full_name }))}
              value={employeeFilter}
              onChange={setEmployeeFilter}
              placeholder={t('attendance.allEmployees')}
            />
          </div>
        )}
      </div>

      {isManagement && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base font-medium">
              <Trophy className="size-4 text-amber-500" />
              {t('attendance.leaderboard')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {leaderboard.length === 0 && <p className="text-sm text-muted-foreground">{t('attendance.empty')}</p>}
            {leaderboard.map(([profileId, totalMs], i) => (
              <div key={profileId} className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-sm">
                <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">{i + 1}</span>
                <Avatar name={nameFor(profileId)} avatarUrl={avatarUrlFor(profileId)} className="rounded-full" />
                <span className="flex-1 truncate font-medium">{nameFor(profileId)}</span>
                <Badge variant="secondary">{formatDuration(totalMs)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">{t('attendance.history')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>}
          {!isLoading && (entries?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">{t('attendance.empty')}</p>
          )}
          {entries?.map((e) => {
            const durationMs = (e.ended_at ? new Date(e.ended_at).getTime() : Date.now()) - new Date(e.started_at).getTime()
            return (
              <div key={e.id} className="flex items-center justify-between rounded-lg border border-border p-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <Avatar name={nameFor(e.profile_id)} avatarUrl={avatarUrlFor(e.profile_id)} className="size-6 rounded-full" />
                  <span className="font-medium">{nameFor(e.profile_id)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatLocalDateTime(e.started_at, i18n.language)}</span>
                  <span>→</span>
                  <span>{e.ended_at ? formatLocalDateTime(e.ended_at, i18n.language) : t('attendance.working')}</span>
                  <Badge variant="secondary">{formatDuration(durationMs)}</Badge>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
