import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ActivityPhotoGallery } from './ActivityPhotoGallery'

function renderGallery() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ActivityPhotoGallery activityId="ride-1" trackPoints={[]} />
    </QueryClientProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('ActivityPhotoGallery – Mehrfach-Upload', () => {
  it('kommuniziert unterstützte Videoformate und akzeptiert MP4, MOV und WebM', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    renderGallery()

    fireEvent.click(await screen.findByRole('button', { name: 'Foto oder Video' }))
    expect(screen.getByText(/Videos: MP4, MOV, WebM bis 500 MB und 15 Minuten/)).toBeInTheDocument()
    const input = document.querySelector('input[type="file"]:not([multiple])') as HTMLInputElement
    expect(input.accept).toContain('video/mp4')
    expect(input.accept).toContain('video/quicktime')
    expect(input.accept).toContain('video/webm')
    fireEvent.change(input, {
      target: { files: [new File(['video'], 'runde.mp4', { type: 'video/mp4' })] },
    })
    expect(await screen.findByText('runde.mp4')).toBeInTheDocument()
  })

  it('nimmt mehrere Dateien per Auswahl und Drag-and-Drop an, ohne manuelle Metadatenfelder', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    renderGallery()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Mehrere Fotos' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Mehrere Fotos' }))

    const input = document.querySelector('input[type="file"][multiple]')
    expect(input).not.toBeNull()
    const files = [
      new File(['erstes'], 'erstes.jpg', { type: 'image/jpeg' }),
      new File(['zweites'], 'zweites.png', { type: 'image/png' }),
    ]
    fireEvent.change(input!, { target: { files } })

    expect(await screen.findByText('erstes.jpg')).toBeInTheDocument()
    expect(screen.getByText('zweites.png')).toBeInTheDocument()
    expect(screen.queryByText('Caption')).not.toBeInTheDocument()
    expect(screen.queryByText('Aufnahmezeit (optional)')).not.toBeInTheDocument()
    expect(screen.queryByText('Breitengrad (optional)')).not.toBeInTheDocument()

    const dropZone = screen.getByText('Bilder hierher ziehen').closest('[role="button"]')
    expect(dropZone).not.toBeNull()
    fireEvent.drop(dropZone!, { dataTransfer: { files: [new File(['drittes'], 'drittes.webp', { type: 'image/webp' })] } })
    expect(await screen.findByText('drittes.webp')).toBeInTheDocument()
  })
})
