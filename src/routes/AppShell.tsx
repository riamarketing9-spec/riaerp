import { useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  LayoutGrid,
  ListTodo,
  Users,
  Gauge,
  LogOut,
  Building2,
  Contact,
  FileText,
  Wallet,
  BarChart3,
  CalendarDays,
  BookOpen,
  UserPlus,
  Menu,
  X,
  ScrollText,
  Clock,
  ListChecks,
  ListTree,
  Pencil,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabaseClient'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Avatar } from '@/components/Avatar'
import { cn } from '@/lib/utils'
import { pickLabel } from '@/lib/localizedLabel'

function NavItem({
  to,
  icon: Icon,
  label,
  onNavigate,
}: {
  to: string
  icon: typeof LayoutGrid
  label: string
  onNavigate: () => void
}) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98]',
          isActive
            ? 'bg-[linear-gradient(to_bottom,var(--primary),color-mix(in_oklch,var(--primary),black_10%))] text-white shadow-brand'
            : 'text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]'
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors',
              isActive ? 'bg-white/15' : 'bg-transparent'
            )}
          >
            <Icon className={cn('size-4', isActive ? 'text-white' : 'text-muted-foreground')} strokeWidth={2.25} />
          </span>
          {label}
        </>
      )}
    </NavLink>
  )
}

// Own avatar, clickable anywhere in the app (sidebar footer) to change it --
// uploads straight to Storage and writes profiles.avatar_url immediately.
function SelfAvatarUpload({ profileId, name, avatarUrl }: { profileId: string; name: string; avatarUrl?: string | null }) {
  const { refreshProfile } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const path = `avatars/${profileId}-${crypto.randomUUID()}-${file.name}`
      const { error } = await supabase.storage.from('attachments').upload(path, file)
      if (error) throw error
      const { data, error: signError } = await supabase.storage
        .from('attachments')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
      if (signError) throw signError
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: data.signedUrl }).eq('id', profileId)
      if (updateError) throw updateError
      await refreshProfile()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="relative shrink-0">
      <Avatar name={name} avatarUrl={avatarUrl} />
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
        onClick={() => inputRef.current?.click()}
        className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-background text-foreground ring-1 ring-border hover:bg-muted disabled:opacity-50"
      >
        <Pencil className="size-2.5" />
      </button>
    </div>
  )
}

export function AppShell() {
  const { t, i18n } = useTranslation()
  const { profile, role, hasCapability, signOut } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const canSeeAll = hasCapability('cabinets.read_all')
  // Capability-based, matching each route's actual RequireCapability
  // anyOf -- not the role-slug-based isCeo boolean, which hid these nav
  // items from e.g. a team.manage-holding PM even though /team itself was
  // already reachable to them.
  const canSeeTeam = hasCapability('org.full_access') || hasCapability('team.manage')
  const canSeeAudit = hasCapability('org.full_access')
  // Specialists (montajchi/designer/syomkachi/...) get only their own cabinet
  // and tasks — no project briefs, per TZ: "мутаxассис: faqat o'z shkafi,
  // brief ko'rmaydi".
  const canSeeProjects = hasCapability('projects.manage') || hasCapability('projects.read_scoped')
  const canSeeSales = hasCapability('sales.read') || hasCapability('sales.manage')
  const canSeeFinance = hasCapability('finance.read') || hasCapability('finance.write')
  const canSeeChecklistAdmin = hasCapability('org.full_access')
  const canSeeLookupAdmin = hasCapability('org.full_access')

  const closeMobileNav = () => setMobileNavOpen(false)

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
      <NavItem to="/cabinet" icon={LayoutGrid} label={t('nav.cabinet')} onNavigate={closeMobileNav} />
      <NavItem to="/tasks" icon={ListTodo} label={t('nav.tasks')} onNavigate={closeMobileNav} />
      {canSeeProjects && (
        <NavItem to="/projects" icon={Users} label={t('nav.projects')} onNavigate={closeMobileNav} />
      )}
      <NavItem to="/content-plan" icon={CalendarDays} label={t('nav.contentPlan')} onNavigate={closeMobileNav} />
      {canSeeAll && (
        <NavItem to="/workload" icon={Gauge} label={t('nav.workload')} onNavigate={closeMobileNav} />
      )}
      {canSeeSales && (
        <NavItem to="/clients" icon={Contact} label={t('nav.clients')} onNavigate={closeMobileNav} />
      )}
      {canSeeSales && (
        <NavItem to="/leads" icon={Contact} label={t('nav.leads')} onNavigate={closeMobileNav} />
      )}
      <NavItem to="/org" icon={Building2} label={t('nav.org')} onNavigate={closeMobileNav} />
      <NavItem to="/docs" icon={FileText} label={t('nav.docs')} onNavigate={closeMobileNav} />
      <NavItem to="/kb" icon={BookOpen} label={t('kb.title')} onNavigate={closeMobileNav} />
      {canSeeFinance && (
        <NavItem to="/finance" icon={Wallet} label={t('finance.title')} onNavigate={closeMobileNav} />
      )}
      {canSeeFinance && (
        <NavItem to="/kpi" icon={BarChart3} label={t('kpi.title')} onNavigate={closeMobileNav} />
      )}
      {canSeeTeam && (
        <NavItem to="/team" icon={UserPlus} label={t('team.title')} onNavigate={closeMobileNav} />
      )}
      {canSeeAudit && (
        <NavItem to="/audit" icon={ScrollText} label={t('nav.audit')} onNavigate={closeMobileNav} />
      )}
      <NavItem to="/attendance" icon={Clock} label={t('nav.attendance')} onNavigate={closeMobileNav} />
      {canSeeChecklistAdmin && (
        <NavItem
          to="/checklist-templates"
          icon={ListChecks}
          label={t('nav.checklistAdmin')}
          onNavigate={closeMobileNav}
        />
      )}
      {canSeeLookupAdmin && (
        <NavItem to="/lookups" icon={ListTree} label={t('nav.lookupAdmin')} onNavigate={closeMobileNav} />
      )}
    </nav>
  )

  const sidebarInner = (
    <>
      <div className="mb-4 flex items-center justify-between gap-2 px-1.5">
        <div className="flex items-center gap-2">
          <img src="/riaerp/logo.png" alt="RIA" className="h-7 w-auto" />
          <span className="text-base font-semibold tracking-tight">RIA ERP</span>
        </div>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <button
            onClick={closeMobileNav}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="mb-3 border-t border-border/30" />

      {nav}

      <div className="mt-3 flex items-center gap-2 rounded-xl bg-background/60 px-2.5 py-2.5 shadow-sm ring-1 ring-foreground/[0.04]">
        {profile && <SelfAvatarUpload profileId={profile.id} name={profile.full_name} avatarUrl={profile.avatar_url} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{profile?.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">{pickLabel(role, i18n.language)}</p>
        </div>
        <ThemeToggle />
        <button
          onClick={() => signOut()}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={t('common.logout')}
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-svh flex-col bg-background md:flex-row">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5 md:hidden">
        <div className="flex items-center gap-2">
          <img src="/riaerp/logo.png" alt="RIA" className="h-6 w-auto" />
          <span className="text-sm font-semibold tracking-tight">RIA ERP</span>
        </div>
        <button
          onClick={() => setMobileNavOpen(true)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Menu className="size-5" />
        </button>
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={closeMobileNav} />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-background px-3 py-4 shadow-xl">
            {sidebarInner}
          </aside>
        </div>
      )}

      <aside className="hidden w-72 shrink-0 flex-col bg-white/90 px-3.5 py-5 shadow-[1px_0_0_rgb(0_0_0_/_0.05),_8px_0_32px_rgb(15_23_20_/_0.06)] backdrop-blur-xl dark:bg-black/30 dark:shadow-[1px_0_0_rgb(255_255_255_/_0.06)] md:flex">
        {sidebarInner}
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10 md:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
