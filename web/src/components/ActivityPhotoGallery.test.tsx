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
  it('lädt für Fotokarten die kleine Medienvorschau statt der vollständigen Bilddatei', async () => {
    const requested: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      requested.push(url)
      if (url.endsWith('/media/config')) {
        return new Response(JSON.stringify({
          image_formats: ['JPEG', 'PNG', 'WebP'],
          video_formats: ['MP4', 'MOV', 'WebM'],
          max_image_bytes: 15 * 1024 * 1024,
          max_video_bytes: 500 * 1024 * 1024,
          max_video_duration_seconds: 900,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.endsWith('/activities/ride-1/media')) {
        return new Response(JSON.stringify({
          items: [{
            id: 'photo-1',
            activity_id: 'ride-1',
            media_type: 'image',
            caption: null,
            captured_at: null,
            latitude: null,
            longitude: null,
            original_filename: 'pause.jpg',
            content_type: 'image/webp',
            size_bytes: 800_000,
            original_size_bytes: 4_000_000,
            width: 4000,
            height: 3000,
            duration_s: null,
            container_format: null,
            video_codec: null,
            audio_codec: null,
            orientation_degrees: null,
            file_url: '/api/v1/activities/ride-1/photos/photo-1/file',
            original_file_url: '/api/v1/activities/ride-1/photos/photo-1/original',
            poster_url: '/api/v1/activities/ride-1/media/photo-1/poster',
            processing_status: 'ready',
            processing_error: null,
            created_at: '2026-07-26T10:00:00Z',
            updated_at: '2026-07-26T10:00:00Z',
          }],
          total: 1,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.endsWith('/media/photo-1/poster')) {
        return new Response(new Blob(['preview'], { type: 'image/webp' }), { status: 200 })
      }
      return new Response(null, { status: 404 })
    })

    renderGallery()
    expect(await screen.findByRole('img', { name: 'pause.jpg' })).toBeInTheDocument()
    expect(requested.some((url) => url.endsWith('/media/photo-1/poster'))).toBe(true)
    expect(requested.some((url) => url.endsWith('/photos/photo-1/file'))).toBe(false)
  })

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
