import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/AuthContext'
import { LoadingScreen } from './components/States'
import { MinimalErrorBoundary } from './components/minimal/MinimalErrorBoundary'
import { AppShell } from './layout/AppShell'
import { AuthLayout } from './layout/AuthLayout'
import { useUiMode } from './UiModeProvider'
import { ProfileControllerProvider } from './pages/minimal/operations/ProfileController'
import { MinimalNotFoundPage } from './pages/MinimalNotFoundPage'

const ActivitiesPage = lazy(() => import('./pages/ActivitiesPage').then((module) => ({ default: module.ActivitiesPage })))
const MinimalActivitiesPage = lazy(() => import('./pages/minimal/activities/MinimalActivitiesPage').then((module) => ({ default: module.MinimalActivitiesPage })))
const ActivityAnalysisPage = lazy(() => import('./pages/ActivityAnalysisPage').then((module) => ({ default: module.ActivityAnalysisPage })))
const MinimalActivityAnalysisPage = lazy(() => import('./pages/minimal/activities/MinimalActivityAnalysisPage').then((module) => ({ default: module.MinimalActivityAnalysisPage })))
const ActivityDetailPage = lazy(() => import('./pages/ActivityDetailPage').then((module) => ({ default: module.ActivityDetailPage })))
const MinimalActivityDetailPage = lazy(() => import('./pages/minimal/activities/MinimalActivityDetailPage').then((module) => ({ default: module.MinimalActivityDetailPage })))
const BootstrapPage = lazy(() => import('./pages/BootstrapPage').then((module) => ({ default: module.BootstrapPage })))
const ComparePage = lazy(() => import('./pages/ComparePage').then((module) => ({ default: module.ComparePage })))
const MinimalComparePage = lazy(() => import('./pages/minimal/analytics').then((module) => ({ default: module.MinimalComparePage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const MinimalDashboardPage = lazy(() => import('./pages/MinimalDashboardPage').then((module) => ({ default: module.MinimalDashboardPage })))
const DevelopmentPage = lazy(() => import('./pages/DevelopmentPage').then((module) => ({ default: module.DevelopmentPage })))
const MinimalDevelopmentPage = lazy(() => import('./pages/minimal/analytics').then((module) => ({ default: module.MinimalDevelopmentPage })))
const GamificationPage = lazy(() => import('./pages/GamificationPage').then((module) => ({ default: module.GamificationPage })))
const MinimalGamificationPage = lazy(() => import('./pages/MinimalGamificationPage').then((module) => ({ default: module.MinimalGamificationPage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })))
const MinimalProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.MinimalProfilePage })))
const RecordsPage = lazy(() => import('./pages/RecordsPage').then((module) => ({ default: module.RecordsPage })))
const MinimalRecordsPage = lazy(() => import('./pages/minimal/analytics').then((module) => ({ default: module.MinimalRecordsPage })))
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((module) => ({ default: module.RegisterPage })))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then((module) => ({ default: module.ResetPasswordPage })))
const StatisticsPage = lazy(() => import('./pages/StatisticsPage').then((module) => ({ default: module.StatisticsPage })))
const MinimalStatisticsPage = lazy(() => import('./pages/minimal/analytics').then((module) => ({ default: module.MinimalStatisticsPage })))
const McpAdminPage = lazy(() => import('./pages/McpAdminPage').then((module) => ({ default: module.McpAdminPage })))
const MinimalMcpAdminPage = lazy(() => import('./pages/McpAdminPage').then((module) => ({ default: module.MinimalMcpAdminPage })))

function AuthenticatedShell() {
  const { minimal } = useUiMode()
  const shell = <AppShell />
  return minimal ? <MinimalErrorBoundary>{shell}</MinimalErrorBoundary> : shell
}

function ProfileRoute() {
  return <ProfileControllerProvider><ProfileModePage /></ProfileControllerProvider>
}

function ProfileModePage() {
  const { minimal } = useUiMode()
  return minimal ? <MinimalProfilePage /> : <ProfilePage />
}

export function App() {
  const { minimal } = useUiMode()
  return (
    <Suspense fallback={<LoadingScreen label="Baseline Cycling wird geladen …" />}>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registrieren" element={<RegisterPage />} />
          <Route path="/einrichten" element={<BootstrapPage />} />
          <Route path="/passwort-zuruecksetzen" element={<ResetPasswordPage />} />
        </Route>
        <Route element={<RequireAuth><AuthenticatedShell /></RequireAuth>}>
          <Route index element={minimal ? <MinimalDashboardPage /> : <DashboardPage />} />
          <Route path="/aktivitaeten" element={minimal ? <MinimalActivitiesPage /> : <ActivitiesPage />} />
          <Route path="/aktivitaeten/:id/analyse" element={minimal ? <MinimalActivityAnalysisPage /> : <ActivityAnalysisPage />} />
          <Route path="/aktivitaeten/:id" element={minimal ? <MinimalActivityDetailPage /> : <ActivityDetailPage />} />
          <Route path="/statistiken" element={minimal ? <MinimalStatisticsPage /> : <StatisticsPage />} />
          <Route path="/entwicklung" element={minimal ? <MinimalDevelopmentPage /> : <DevelopmentPage />} />
          <Route path="/meilensteine" element={minimal ? <MinimalGamificationPage /> : <GamificationPage />} />
          <Route path="/rekorde" element={minimal ? <MinimalRecordsPage /> : <RecordsPage />} />
          <Route path="/vergleich" element={minimal ? <MinimalComparePage /> : <ComparePage />} />
          <Route path="/profil" element={<ProfileRoute />} />
          <Route path="/administration/mcp" element={minimal ? <MinimalMcpAdminPage /> : <McpAdminPage />} />
          <Route path="*" element={minimal ? <MinimalNotFoundPage /> : <Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
