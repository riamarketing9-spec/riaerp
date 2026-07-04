import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LayoutGrid, ListTodo, Users, Gauge, LogOut } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { cn } from '@/lib/utils'

function NavItem({ to, icon: Icon, label }: { to: string; icon: typeof LayoutGrid; label: string }) {
  return (
    <NavLink
      to={to}
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
  const { t } = useTranslation()
  const { profile, role, hasCapability, signOut } = useAuth()
  const canSeeAll = hasCapability('cabinets.read_all')
  // Specialists (montajchi/designer/syomkachi/...) get only their own cabinet
  // and tasks — no project briefs, per TZ: "мутаxассис: faqat o'z shkafi,
  // brief ko'rmaydi".
  const canSeeProjects = hasCapability('projects.manage') || hasCapability('projects.read_scoped')

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border px-3 py-4">
        <div className="mb-6 flex items-center justify-between gap-2 px-2">
          <div className="flex items-center gap-2">
            <img src="/riaerp/logo.png" alt="RIA" className="h-6 w-auto" />
            <span className="text-sm font-semibold tracking-tight">RIA ERP</span>
          </div>
          <LanguageSwitcher />
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          <NavItem to="/cabinet" icon={LayoutGrid} label={t('nav.cabinet')} />
          <NavItem to="/tasks" icon={ListTodo} label={t('nav.tasks')} />
          {canSeeProjects && <NavItem to="/projects" icon={Users} label={t('nav.projects')} />}
          {canSeeAll && <NavItem to="/workload" icon={Gauge} label={t('nav.workload')} />}
        </nav>

        <div className="flex items-center gap-2 rounded-lg px-2 py-2">
          <InitialsTile name={profile?.full_name ?? '?'} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{profile?.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{role?.label_ru}</p>
          </div>
          <button
            onClick={() => signOut()}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={t('common.logout')}
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
