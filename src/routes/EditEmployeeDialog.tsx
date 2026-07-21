import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { pickLabel } from '@/lib/localizedLabel'

const CAPABILITIES = [
  { slug: 'org.full_access', labelKey: 'team.capOrgFullAccess' },
  { slug: 'finance.read', labelKey: 'team.capFinanceRead' },
  { slug: 'finance.write', labelKey: 'team.capFinanceWrite' },
  { slug: 'cabinets.read_all', labelKey: 'team.capCabinetsReadAll' },
  { slug: 'projects.manage', labelKey: 'team.capProjectsManage' },
  { slug: 'projects.read_scoped', labelKey: 'team.capProjectsReadScoped' },
  { slug: 'sales.read', labelKey: 'team.capSalesRead' },
  { slug: 'sales.manage', labelKey: 'team.capSalesManage' },
  { slug: 'docs.admin', labelKey: 'team.capDocsAdmin' },
] as const

export function EditEmployeeDialog({
  profileId,
  open,
  onOpenChange,
}: {
  profileId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const { profile: currentProfile } = useAuth()
  const queryClient = useQueryClient()

  const [roleId, setRoleId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [staffStatusId, setStaffStatusId] = useState('')
  const [effectiveCaps, setEffectiveCaps] = useState<Set<string>>(new Set())
  const [secondaryRoleIds, setSecondaryRoleIds] = useState<Set<string>>(new Set())

  const { data: profileRow } = useQuery({
    queryKey: ['employee-detail', profileId],
    enabled: !!profileId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role_id, department_id, staff_status_id')
        .eq('id', profileId!)
        .single()
      if (error) throw error
      return data
    },
  })

  const { data: roles } = useQuery({
    queryKey: ['roles-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('id, slug, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('id, slug, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: staffStatuses } = useQuery({
    queryKey: ['staff_statuses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_statuses').select('id, slug, label_ru, label_uz')
      if (error) throw error
      return data
    },
  })

  const { data: roleDefaults } = useQuery({
    queryKey: ['role_capabilities', roleId],
    enabled: !!roleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_capabilities')
        .select('capability')
        .eq('role_id', roleId)
      if (error) throw error
      return new Set(data.map((r) => r.capability))
    },
  })

  const { data: overrides } = useQuery({
    queryKey: ['profile_capability_overrides', profileId],
    enabled: !!profileId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile_capability_overrides')
        .select('capability, granted')
        .eq('profile_id', profileId!)
      if (error) throw error
      return data
    },
  })

  const { data: employeeRoles } = useQuery({
    queryKey: ['employee_roles', profileId],
    enabled: !!profileId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_roles')
        .select('role_id')
        .eq('profile_id', profileId!)
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    if (profileRow) {
      setRoleId(profileRow.role_id)
      setDepartmentId(profileRow.department_id ?? '')
      setStaffStatusId(profileRow.staff_status_id ?? '')
    }
  }, [profileRow])

  useEffect(() => {
    if (!roleDefaults) return
    const next = new Set(roleDefaults)
    for (const o of overrides ?? []) {
      if (o.granted) next.add(o.capability)
      else next.delete(o.capability)
    }
    setEffectiveCaps(next)
  }, [roleDefaults, overrides])

  useEffect(() => {
    setSecondaryRoleIds(new Set((employeeRoles ?? []).map((r) => r.role_id)))
  }, [employeeRoles])

  function toggleCap(slug: string, checked: boolean) {
    setEffectiveCaps((prev) => {
      const next = new Set(prev)
      if (checked) next.add(slug)
      else next.delete(slug)
      return next
    })
  }

  function toggleSecondaryRole(id: string, checked: boolean) {
    setSecondaryRoleIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({
          role_id: roleId,
          department_id: departmentId || null,
          staff_status_id: staffStatusId || null,
        })
        .eq('id', profileId!)
      if (profileErr) throw profileErr

      const defaults = roleDefaults ?? new Set<string>()
      const toUpsert: { profile_id: string; capability: string; granted: boolean; granted_by: string | null }[] = []
      const toDelete: string[] = []

      for (const cap of CAPABILITIES) {
        const isEffective = effectiveCaps.has(cap.slug)
        const isDefault = defaults.has(cap.slug)
        if (isEffective === isDefault) {
          toDelete.push(cap.slug)
        } else {
          toUpsert.push({
            profile_id: profileId!,
            capability: cap.slug,
            granted: isEffective,
            granted_by: currentProfile?.id ?? null,
          })
        }
      }

      if (toDelete.length) {
        await supabase
          .from('profile_capability_overrides')
          .delete()
          .eq('profile_id', profileId!)
          .in('capability', toDelete)
      }
      if (toUpsert.length) {
        const { error: upsertErr } = await supabase
          .from('profile_capability_overrides')
          .upsert(toUpsert, { onConflict: 'profile_id,capability' })
        if (upsertErr) throw upsertErr
      }

      const currentSecondary = new Set((employeeRoles ?? []).map((r) => r.role_id))
      const toAddRoles = [...secondaryRoleIds].filter((id) => !currentSecondary.has(id))
      const toRemoveRoles = [...currentSecondary].filter((id) => !secondaryRoleIds.has(id))

      if (toRemoveRoles.length) {
        await supabase
          .from('employee_roles')
          .delete()
          .eq('profile_id', profileId!)
          .in('role_id', toRemoveRoles)
      }
      if (toAddRoles.length) {
        const { error: rolesErr } = await supabase
          .from('employee_roles')
          .insert(toAddRoles.map((role_id) => ({ profile_id: profileId!, role_id })))
        if (rolesErr) throw rolesErr
      }
    },
    onSuccess: () => {
      toast.success(t('team.saved'))
      queryClient.invalidateQueries({ queryKey: ['team-profiles'] })
      queryClient.invalidateQueries({ queryKey: ['employee-detail', profileId] })
      queryClient.invalidateQueries({ queryKey: ['profile_capability_overrides', profileId] })
      queryClient.invalidateQueries({ queryKey: ['employee_roles', profileId] })
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Нет активной сессии')

      const res = await fetch(
        'https://emrnxnhyiqnjjptmgwvd.supabase.co/functions/v1/admin-delete-user',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ profile_id: profileId }),
        }
      )
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Не удалось удалить сотрудника')
    },
    onSuccess: () => {
      toast.success(t('common.delete') + ': ' + (profileRow?.full_name ?? ''))
      queryClient.invalidateQueries({ queryKey: ['team-profiles'] })
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function handleDelete() {
    if (window.confirm(t('team.confirmDelete', { name: profileRow?.full_name ?? '' }))) {
      deleteMutation.mutate()
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{profileRow?.full_name ?? t('team.editEmployee')}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t('team.role')}</Label>
              <Select value={roleId} onValueChange={(v: string | null) => setRoleId(v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="—">
                    {() => pickLabel(roles?.find((r) => r.id === roleId), i18n.language)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {roles?.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {pickLabel(r, i18n.language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('team.department')}</Label>
              <Select value={departmentId} onValueChange={(v: string | null) => setDepartmentId(v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder={t('org.none')}>
                    {() => pickLabel(departments?.find((d) => d.id === departmentId), i18n.language)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {departments?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {pickLabel(d, i18n.language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('team.secondaryRoles')}</Label>
            <p className="text-xs text-muted-foreground">{t('team.secondaryRolesHint')}</p>
            <div className="flex flex-wrap gap-3 rounded-lg border border-border p-3">
              {roles
                ?.filter((r) => r.id !== roleId)
                .map((r) => (
                  <div key={r.id} className="flex items-center gap-1.5">
                    <Checkbox
                      id={`secrole-${r.id}`}
                      checked={secondaryRoleIds.has(r.id)}
                      onCheckedChange={(checked) => toggleSecondaryRole(r.id, checked === true)}
                    />
                    <Label htmlFor={`secrole-${r.id}`} className="font-normal">
                      {pickLabel(r, i18n.language)}
                    </Label>
                  </div>
                ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('team.status')}</Label>
            <Select value={staffStatusId} onValueChange={(v: string | null) => setStaffStatusId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="—">
                  {() => pickLabel(staffStatuses?.find((s) => s.id === staffStatusId), i18n.language)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {staffStatuses?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {pickLabel(s, i18n.language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('team.permissions')}</Label>
            <p className="text-xs text-muted-foreground">{t('team.permissionsHint')}</p>
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              {CAPABILITIES.map((cap) => {
                const isEffective = effectiveCaps.has(cap.slug)
                const isDefault = (roleDefaults ?? new Set()).has(cap.slug)
                return (
                  <div key={cap.slug} className="flex items-center gap-2">
                    <Checkbox
                      id={`cap-${cap.slug}`}
                      checked={isEffective}
                      onCheckedChange={(checked) => toggleCap(cap.slug, checked === true)}
                    />
                    <Label htmlFor={`cap-${cap.slug}`} className="flex-1 font-normal">
                      {t(cap.labelKey)}
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      {isEffective === isDefault ? t('team.permissionFromRole') : t('team.permissionCustom')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <SheetFooter className="flex-row justify-between px-0">
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {t('common.delete')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {t('common.save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
