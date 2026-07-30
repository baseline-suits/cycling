import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@mui/material/styles'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { gamificationApi, type GamificationOverview } from '../api'
import { createAppTheme } from '../theme'
import { GamificationPage } from './GamificationPage'

const goal = {
  id: 'goal-1',
  title: 'Monatsrunde',
  description: null,
  metric: 'distance_m',
  current_value: 62_000,
  target_value: 100_000,
  unit: 'km',
  period: 'month',
  progress_percent: 62,
  remaining_value: 38_000,
  status: 'active',
  starts_at: '2026-07-01',
  deadline: '2026-07-31',
  completed_at: null,
  reward_xp: 80,
  created_at: '2026-07-01T08:00:00Z',
  updated_at: '2026-07-10T08:00:00Z',
} satisfies GamificationOverview['goals'][number]

const suggestion = {
  id: 'challenge-1',
  title: 'Zwei entspannte Morgenrunden',
  description: 'Zwei kurze Fahrten bei passenden Bedingungen.',
  metric: 'activity_count',
  current_value: 0,
  target_value: 2,
  unit: 'Fahrten',
  progress_percent: 0,
  remaining_value: 2,
  duration_days: 7,
  reward_xp: 35,
  status: 'suggested',
  source: 'ai',
  ai_generated: true,
  personalization_reason: 'Passt zu deinem bisherigen Rhythmus.',
  weather_sensitive: true,
  safety_note: null,
  starts_at: null,
  expires_at: '2026-07-18',
  accepted_at: null,
  completed_at: null,
  created_at: '2026-07-11T08:00:00Z',
  updated_at: '2026-07-11T08:00:00Z',
} satisfies GamificationOverview['challenge_suggestions'][number]

const overview: GamificationOverview = {
  generated_at: '2026-07-11T10:00:00Z',
  privacy: 'private',
  level: { level: 4, name: 'Pfadfinder:in', total_xp: 870, current_xp: 170, next_level_xp: 300, progress_percent: 56.7, breakdown: { goals: 250 } },
  goals: [goal],
  active_challenges: [{ ...suggestion, id: 'challenge-active', title: 'Drei Touren im Grünen', status: 'accepted', ai_generated: false, source: 'local', weather_sensitive: false, accepted_at: '2026-07-10T08:00:00Z' }],
  challenge_suggestions: [suggestion],
  ai_challenges_available: true,
  badges: [
    { id: 'badge-1', key: 'first-ride', name: 'Erste Spur', description: 'Deine erste Fahrt ist gespeichert.', category: 'Start', tier: 'bronze', icon: null, reward_xp: 20, unlocked: true, unlocked_at: '2026-01-03T08:00:00Z', source_activity_id: 'ride-1', current_value: 1, target_value: 1, unit: 'Fahrt', progress_percent: 100 },
    { id: 'badge-2', key: 'climber', name: 'Höhenluft', description: 'Sammle 5.000 Höhenmeter.', category: 'Berge', tier: 'silver', icon: null, reward_xp: 60, unlocked: false, unlocked_at: null, source_activity_id: null, current_value: 3_200, target_value: 5_000, unit: 'hm', progress_percent: 64 },
  ],
  streak: { current_weeks: 3, best_weeks: 5, weekly_target: 2, current_week_progress: 1, pause_protection_available: true, pause_protection_active: false, protected_until: null, next_check_at: '2026-07-13T00:00:00Z', active_week_starts: ['2026-06-22', '2026-06-29', '2026-07-06'], method: 'calendar_week' },
  record_chases: [{ id: 'record-1', title: 'Längste Tour', description: 'Noch 8 km bis zur nächsten Marke.', metric: 'distance_m', current_value: 92_000, target_value: 100_000, unit: 'km', progress_percent: 92, activity_id: 'ride-1', achieved: false }],
  discoveries: [
    { scope: 'village', label: 'Dörfer', count: 8, total_available: null, progress_percent: null, places: ['Hinterzarten', 'Kirchzarten'] },
    { scope: 'municipality', label: 'Städte & Kommunen', count: 4, total_available: null, progress_percent: null, places: ['Freiburg'] },
    { scope: 'state', label: 'Bundesländer', count: 2, total_available: 16, progress_percent: 12.5, places: ['Baden-Württemberg', 'Hessen'] },
    { scope: 'country', label: 'Länder', count: 1, total_available: null, progress_percent: null, places: ['Deutschland'] },
  ],
  geocoding: { status: 'ready', provider: 'locationiq', attribution_label: 'Search by LocationIQ.com', attribution_url: 'https://locationiq.com/attribution' },
  annual_awards: [{ id: 'award-1', key: 'distance', year: 2026, title: 'Weitblick 2026', description: 'Dein distanzstärkstes Radjahr.', value: 1_240, unit: 'km', tier: 'gold', earned: true, earned_at: '2026-07-01T08:00:00Z', icon: null, reward_xp: 100, is_final: false }],
}

function renderPage(data: GamificationOverview = overview) {
  vi.spyOn(gamificationApi, 'overview').mockResolvedValue(data)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <ThemeProvider theme={createAppTheme('light')}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <GamificationPage />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

describe('GamificationPage', () => {
  it('zeigt den vollständigen privaten Fortschritt und sichere Wetterhinweise', async () => {
    renderPage()

    expect(await screen.findByText('Pfadfinder:in')).toBeInTheDocument()
    expect(screen.getByText('Monatsrunde')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'KI-Challenge-Vorschläge' })).toBeInTheDocument()
    expect(screen.getByText('Sicher unterwegs:')).toBeInTheDocument()
    expect(screen.getByText('Erste Spur')).toBeInTheDocument()
    expect(screen.getByText('Höhenluft')).toBeInTheDocument()
    expect(screen.getByText('Pausenschutz verfügbar')).toBeInTheDocument()
    expect(screen.getByText('Längste Tour')).toBeInTheDocument()
    expect(screen.getByText('Städte & Kommunen')).toBeInTheDocument()
    expect(screen.getByText('Weitblick 2026')).toBeInTheDocument()
    expect(screen.getByText(/Baseline Cycling erstellt keine sozialen Ranglisten/)).toBeInTheDocument()
  })

  it('blendet KI-Vorschläge vollständig aus, wenn sie nicht verfügbar sind', async () => {
    renderPage({ ...overview, ai_challenges_available: false })

    expect(await screen.findByText('Monatsrunde')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'KI-Challenge-Vorschläge' })).not.toBeInTheDocument()
    expect(screen.queryByText('Zwei entspannte Morgenrunden')).not.toBeInTheDocument()
  })

  it('legt Ziele an, bearbeitet und löscht sie über die private Oberfläche', async () => {
    const user = userEvent.setup()
    const create = vi.spyOn(gamificationApi, 'createGoal').mockResolvedValue(goal)
    const update = vi.spyOn(gamificationApi, 'updateGoal').mockResolvedValue(goal)
    const remove = vi.spyOn(gamificationApi, 'deleteGoal').mockResolvedValue(undefined)
    renderPage()
    await screen.findByText('Monatsrunde')

    await user.click(screen.getByRole('button', { name: 'Eigenes Ziel' }))
    let dialog = screen.getByRole('dialog', { name: 'Eigenes Ziel anlegen' })
    await user.type(within(dialog).getByLabelText(/Name des Ziels/), 'Feierabendrunde')
    await user.type(within(dialog).getByLabelText(/Zielwert \(km\)/), '25')
    await user.click(within(dialog).getByRole('button', { name: 'Ziel anlegen' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith({ title: 'Feierabendrunde', metric: 'distance_m', target_value: 25_000, period: 'month', deadline: null }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Eigenes Ziel anlegen' })).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Monatsrunde bearbeiten' }))
    dialog = screen.getByRole('dialog', { name: 'Ziel bearbeiten' })
    const title = within(dialog).getByLabelText(/Name des Ziels/)
    await user.clear(title)
    await user.type(title, 'Monatsziel entspannt')
    await user.click(within(dialog).getByRole('button', { name: 'Änderungen speichern' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('goal-1', expect.objectContaining({ title: 'Monatsziel entspannt', target_value: 100_000 })))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ziel bearbeiten' })).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Monatsrunde löschen|Monatsziel entspannt löschen/ }))
    const deleteDialog = screen.getByRole('dialog', { name: 'Ziel löschen?' })
    await user.click(within(deleteDialog).getByRole('button', { name: 'Ziel löschen' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('goal-1'))
  })

  it('nimmt Challenge-Vorschläge an oder blendet sie ohne Druck aus', async () => {
    const user = userEvent.setup()
    const accept = vi.spyOn(gamificationApi, 'acceptChallenge').mockResolvedValue({ ...suggestion, status: 'accepted' })
    const decline = vi.spyOn(gamificationApi, 'declineChallenge').mockResolvedValue({ ...suggestion, status: 'declined' })
    renderPage()
    await screen.findByText('Zwei entspannte Morgenrunden')

    await user.click(screen.getByRole('button', { name: 'Annehmen' }))
    await waitFor(() => expect(accept).toHaveBeenCalledWith('challenge-1'))
    await user.click(screen.getByRole('button', { name: 'Nicht jetzt' }))
    await waitFor(() => expect(decline).toHaveBeenCalledWith('challenge-1'))
  })

  it('startet den LocationIQ-Backfill bewusst und zeigt die Attribution', async () => {
    const user = userEvent.setup()
    const backfill = vi.spyOn(gamificationApi, 'backfillDiscoveries').mockResolvedValue({
      processed: 1,
      available: 1,
      failed: 0,
      remaining: 0,
      total: 1,
      rate_limited: false,
      retry_after_seconds: null,
    })
    renderPage()
    await screen.findByText('Search by LocationIQ.com')

    await user.click(screen.getByRole('button', { name: 'Orte aus bestehenden Fahrten ermitteln' }))

    await waitFor(() => expect(backfill).toHaveBeenCalledWith(false))
    expect(await screen.findByText('1 von 1 Fahrten verarbeitet')).toBeInTheDocument()
  })

  it('ersetzt leere Ortskacheln bei deaktiviertem Provider durch einen Hinweis', async () => {
    renderPage({
      ...overview,
      discoveries: overview.discoveries.map((item) => ({ ...item, count: 0, places: [] })),
      geocoding: { status: 'disabled', provider: null, attribution_label: null, attribution_url: null },
    })

    expect(await screen.findByText('Die Ortserkennung ist auf diesem Server nicht aktiviert.')).toBeInTheDocument()
    expect(screen.queryByText('Noch kein Dorf erkannt.')).not.toBeInTheDocument()
  })
})
