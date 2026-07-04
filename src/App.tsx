import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { SplashScreen } from '@/components/SplashScreen'
import { LoginPage } from '@/routes/LoginPage'
import { AppShell } from '@/routes/AppShell'
import { CabinetPage } from '@/routes/CabinetPage'
import { TasksPage } from '@/routes/TasksPage'
import { ProjectsPage } from '@/routes/ProjectsPage'
import { WorkloadPage } from '@/routes/WorkloadPage'
import { ClientsPage } from '@/routes/ClientsPage'
import { LeadsPage } from '@/routes/LeadsPage'
import { OrgStructurePage } from '@/routes/OrgStructurePage'
import { DocumentsPage } from '@/routes/DocumentsPage'
import { FinancePage } from '@/routes/FinancePage'
import { KpiDashboardPage } from '@/routes/KpiDashboardPage'
import { ContentPlanPage } from '@/routes/ContentPlanPage'
import { KnowledgeBasePage } from '@/routes/KnowledgeBasePage'
import { RequireCapability } from '@/routes/RequireCapability'

const router = createBrowserRouter(
  [
    {
      element: <AppShell />,
      children: [
        { index: true, element: <Navigate to="/cabinet" replace /> },
        { path: 'cabinet', element: <CabinetPage /> },
        { path: 'tasks', element: <TasksPage /> },
        {
          path: 'projects',
          element: (
            <RequireCapability anyOf={['projects.manage', 'projects.read_scoped']}>
              <ProjectsPage />
            </RequireCapability>
          ),
        },
        {
          path: 'workload',
          element: (
            <RequireCapability anyOf={['cabinets.read_all']}>
              <WorkloadPage />
            </RequireCapability>
          ),
        },
        {
          path: 'clients',
          element: (
            <RequireCapability anyOf={['sales.read', 'sales.manage']}>
              <ClientsPage />
            </RequireCapability>
          ),
        },
        {
          path: 'leads',
          element: (
            <RequireCapability anyOf={['sales.read', 'sales.manage']}>
              <LeadsPage />
            </RequireCapability>
          ),
        },
        { path: 'org', element: <OrgStructurePage /> },
        { path: 'docs', element: <DocumentsPage /> },
        { path: 'kb', element: <KnowledgeBasePage /> },
        {
          path: 'content-plan',
          element: (
            <RequireCapability anyOf={['projects.manage', 'projects.read_scoped']}>
              <ContentPlanPage />
            </RequireCapability>
          ),
        },
        {
          path: 'finance',
          element: (
            <RequireCapability anyOf={['finance.read', 'finance.write']}>
              <FinancePage />
            </RequireCapability>
          ),
        },
        {
          path: 'kpi',
          element: (
            <RequireCapability anyOf={['finance.read', 'finance.write']}>
              <KpiDashboardPage />
            </RequireCapability>
          ),
        },
      ],
    },
  ],
  { basename: '/riaerp' }
)

export function App() {
  const { session, isLoading } = useAuth()

  if (isLoading) return <SplashScreen />
  if (!session) return <LoginPage />

  return <RouterProvider router={router} />
}
