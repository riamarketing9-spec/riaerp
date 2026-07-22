import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { ThemeToggle } from '@/components/ThemeToggle'
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
          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )
      }
    >
      <Icon className="size-4" strokeWidth={2} />
      {label}
    </NavLink>
  )
}

function InitialsTile({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-500 text-xs font-semibold text-white">
      {initials}
    </div>
  )
}

export function AppShell() {
  const { t, i18n } = useTranslation()
  const { profile, role, hasCapability, isCeo, signOut } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const canSeeAll = hasCapability('cabinets.read_all')
  // Specialists (montajchi/designer/syomkachi/...) get only their own cabinet
  // and tasks — no project briefs, per TZ: "мутаxассис: faqat o'z shkafi,
  // brief ko'rmaydi".
  const canSeeProjects = hasCapability('projects.manage') || hasCapability('projects.read_scoped')
  const canSeeSales = hasCapability('sales.read') || hasCapability('sales.manage')
  const canSeeFinance = hasCapability('finance.read') || hasCapability('finance.write')
  const canSeeAttendance = hasCapability('org.full_access')

  const closeMobileNav = () => setMobileNavOpen(false)

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
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
      {isCeo && (
        <NavItem to="/team" icon={UserPlus} label={t('team.title')} onNavigate={closeMobileNav} />
      )}
      {isCeo && (
        <NavItem to="/audit" icon={ScrollText} label={t('nav.audit')} onNavigate={closeMobileNav} />
      )}
      {canSeeAttendance && (
        <NavItem to="/attendance" icon={Clock} label={t('nav.attendance')} onNavigate={closeMobileNav} />
      )}
    </nav>
  )

  const sidebarInner = (
    <>
      <div className="mb-6 flex items-center justify-between gap-2 px-2">
        <div className="flex items-center gap-2">
          <img src="/riaerp/logo.png" alt="RIA" className="h-6 w-auto" />
          <span className="text-sm font-semibold tracking-tight">RIA ERP</span>
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

      {nav}

      <div className="flex items-center gap-2 rounded-lg px-2 py-2">
        <InitialsTile name={profile?.full_name ?? '?'} />
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

      <aside className="hidden w-60 shrink-0 flex-col border-r border-border px-3 py-4 md:flex">
        {sidebarInner}
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-8 md:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
