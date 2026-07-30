import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { activitiesApi, chatApi } from '../api'
import { MinimalChatPage } from './ChatPage'

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'user-1', display_name: 'Dimitri', avatar_data_url: null } }),
}))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MinimalChatPage /></QueryClientProvider>)
}

describe('MinimalChatPage', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    vi.spyOn(activitiesApi, 'list').mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 })
  })

  it('wiederholt eine fehlgeschlagene Anfrage ohne die Nutzernachricht zu duplizieren', async () => {
    const user = userEvent.setup()
    const send = vi.spyOn(chatApi, 'send')
      .mockRejectedValueOnce(new Error('Coach vorübergehend nicht erreichbar'))
      .mockResolvedValueOnce({ answer: 'Plane eine lockere Fahrt.', provider: 'local', sources: [], tools_used: [], data_basis: null })
    renderPage()

    await user.type(screen.getByRole('textbox', { name: 'Nachricht an Baseline Cycling Chat' }), 'Was trainiere ich morgen?')
    await user.click(screen.getByRole('button', { name: 'Nachricht senden' }))
    expect(await screen.findByText('Coach vorübergehend nicht erreichbar')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(await screen.findByText('Plane eine lockere Fahrt.')).toBeInTheDocument()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0])
    await waitFor(() => expect(screen.getAllByText('Was trainiere ich morgen?')).toHaveLength(1))
  })
})
