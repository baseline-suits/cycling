import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTheme } from '@mui/material'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { profileApi, type Profile } from './api'
import { ThemeModeProvider } from './ThemeModeProvider'
import { UiModeProvider, useUiMode } from './UiModeProvider'
import { MinimalAppShell } from './layout/MinimalAppShell'
import { ExperimentsCard } from './pages/ProfilePage'

const authState = vi.hoisted(() => ({
  profile: null as Profile | null,
  setProfile: vi.fn(),
}))

vi.mock('./auth/AuthContext', () => ({
  useAuth: () => ({ profile: authState.profile, setProfile: authState.setProfile }),
}))

const profile: Profile = {
  id: 'user-1',
  email: 'rad@example.de',
  display_name: 'Dimitri',
  is_admin: false,
  hr_max: 190,
  hr_rest: 60,
  hr_zones: [],
  training_goals: [],
  ui_mode: 'classic',
  avatar_data_url: null,
}

function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <ThemeModeProvider><QueryClientProvider client={client}><MemoryRouter><UiModeProvider>{children}</UiModeProvider></MemoryRouter></QueryClientProvider></ThemeModeProvider>
}

function ModeProbe() {
  const { uiMode, setUiMode } = useUiMode()
  const theme = useTheme()
  return <><span>Modus {uiMode}</span><span>Fläche {theme.palette.background.default}</span><button onClick={() => void setUiMode('minimal')}>Minimal setzen</button></>
}

describe('UiModeProvider und Minimal-UI-Umschaltung', () => {
  beforeEach(() => {
    localStorage.clear()
    authState.profile = { ...profile }
    authState.setProfile.mockReset()
  })

  it('verwendet den letzten bestätigten Modus nur als Bootstrap-Hinweis und gleicht ihn mit dem Profil ab', async () => {
    localStorage.setItem('avento.auth.tokens', JSON.stringify({ access_token: 'access', refresh_token: 'refresh', token_type: 'bearer', expires_in: 900 }))
    localStorage.setItem('avento-ui-mode-hint', 'minimal')
    authState.profile = null
    const { rerender } = render(<Providers><ModeProbe /></Providers>)
    expect(screen.getByText('Modus minimal')).toBeInTheDocument()

    authState.profile = { ...profile, ui_mode: 'classic' }
    rerender(<Providers><ModeProbe /></Providers>)
    expect(screen.getByText('Modus classic')).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem('avento-ui-mode-hint')).toBe('classic'))
  })

  it('behält bei einem API-Fehler den bisherigen Modus und Bootstrap-Hinweis', async () => {
    const user = userEvent.setup()
    vi.spyOn(profileApi, 'update').mockRejectedValue(new Error('Speichern fehlgeschlagen'))
    render(<Providers><ModeProbe /></Providers>)
    await user.click(screen.getByRole('button', { name: 'Minimal setzen' }))
    await waitFor(() => expect(screen.getByText('Modus classic')).toBeInTheDocument())
    expect(authState.setProfile).not.toHaveBeenCalled()
    expect(localStorage.getItem('avento-ui-mode-hint')).toBe('classic')
  })

  it('startet standardmäßig klassisch und speichert einen Moduswechsel über das Profil', async () => {
    const user = userEvent.setup()
    const update = vi.spyOn(profileApi, 'update').mockResolvedValue({ ...profile, ui_mode: 'minimal' })
    const { rerender } = render(<Providers><ModeProbe /></Providers>)

    expect(screen.getByText('Modus classic')).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-ui-mode', 'classic')
    await user.click(screen.getByRole('button', { name: 'Minimal setzen' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith({ ui_mode: 'minimal' }))
    expect(authState.setProfile).toHaveBeenCalledWith(expect.objectContaining({ ui_mode: 'minimal' }))

    authState.profile = { ...profile, ui_mode: 'minimal' }
    rerender(<Providers><ModeProbe /></Providers>)
    expect(screen.getByText('Modus minimal')).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-ui-mode', 'minimal')
    expect(screen.getByText('Fläche #080A0D')).toBeInTheDocument()
  })

  it('aktiviert die Beta erst nach Bestätigung und lässt Abbrechen folgenlos', async () => {
    const user = userEvent.setup()
    const update = vi.spyOn(profileApi, 'update').mockResolvedValue({ ...profile, ui_mode: 'minimal' })
    render(<Providers><ExperimentsCard /></Providers>)

    const toggle = screen.getByRole('switch', { name: 'Minimal UI (Beta)' })
    expect(toggle).not.toBeChecked()
    await user.click(toggle)
    let dialog = screen.getByRole('dialog', { name: 'Minimal UI aktivieren?' })
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
    expect(update).not.toHaveBeenCalled()

    await user.click(toggle)
    dialog = screen.getByRole('dialog', { name: 'Minimal UI aktivieren?' })
    await user.keyboard('{Tab}{Shift>}{Tab}{/Shift}')
    await user.click(within(dialog).getByRole('button', { name: 'Beta aktivieren' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith({ ui_mode: 'minimal' }))
  })

  it('zeigt Badge und Informationen ausschließlich im Minimal-Shell', async () => {
    const user = userEvent.setup()
    authState.profile = { ...profile, ui_mode: 'minimal' }
    render(
      <Providers>
        <Routes><Route element={<MinimalAppShell />}><Route index element={<span>Minimal Dashboard</span>} /></Route></Routes>
      </Providers>,
    )

    expect(screen.getByText('Minimal Dashboard')).toBeInTheDocument()
    const badge = screen.getByRole('button', { name: 'Informationen zur Minimal UI Beta' })
    await user.click(badge)
    expect(screen.getByRole('dialog', { name: 'Minimal UI · Beta' })).toBeInTheDocument()
    expect(screen.getByText(/klassischen Oberfläche zurückkehren/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Minimal UI · Beta' })).not.toBeInTheDocument())
  })
})
