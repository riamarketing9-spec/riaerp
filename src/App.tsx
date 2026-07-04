import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { SplashScreen } from '@/components/SplashScreen'
import { LoginPage } from '@/routes/LoginPage'
import { AppShell } from '@/routes/AppShell'
import { CabinetPage } from '@/routes/CabinetPage'
import { TasksPage } from '@/routes/TasksPage'
import { ProjectsPage } from '@/routes/ProjectsPage'
import { WorkloadPage } from '@/routes/WorkloadPage'

const router = createBrowserRouter(
  [
    {
      element: <AppShell />,
      children: [
        { index: true, element: <Navigate to="/cabinet" replace /> },
        { path: 'cabinet', element: <CabinetPage /> },
        { path: 'tasks', element: <TasksPage /> },
        { path: 'projects', element: <ProjectsPage /> },
        { path: 'workload', element: <WorkloadPage /> },
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
