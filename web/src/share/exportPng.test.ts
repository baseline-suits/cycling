import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toBlob } from 'html-to-image'
import { downloadPng, exportOverlayPng } from './exportPng'
import { photoBlobToDataUrl } from './photoDataUrl'

vi.mock('html-to-image', () => ({ toBlob: vi.fn() }))

describe('PNG-Export', () => {
  beforeEach(() => {
    vi.mocked(toBlob).mockReset()
  })

  it('rendert das gewählte Format in seiner exakten Größe und ignoriert den WebGL-Canvas', async () => {
    const blob = new Blob(['png'], { type: 'image/png' })
    vi.mocked(toBlob).mockResolvedValue(blob)
    const node = document.createElement('div')

    await expect(exportOverlayPng(node, 'story')).resolves.toBe(blob)

    const options = vi.mocked(toBlob).mock.calls[0][1]!
    expect(options).toMatchObject({ width: 540, height: 960, pixelRatio: 2, cacheBust: false })
    const mapCanvas = document.createElement('div')
    mapCanvas.dataset.overlayExportIgnore = 'true'
    expect(options.filter?.(mapCanvas)).toBe(false)
    expect(options.filter?.(document.createElement('div'))).toBe(true)
  })

  it.each(['square', 'portrait', 'story', 'landscape'] as const)(
    'bettet den Fotohintergrund für das Format %s als stabile Data-URL ein',
    async (formatId) => {
      const dataUrl = await photoBlobToDataUrl(new Blob(['photo'], { type: 'image/jpeg' }))
      expect(dataUrl).toMatch(/^data:image\/jpeg;base64,/)

      vi.mocked(toBlob).mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
      const canvas = document.createElement('div')
      const photo = document.createElement('img')
      photo.src = dataUrl
      canvas.appendChild(photo)

      await expect(exportOverlayPng(canvas, formatId)).resolves.toBeInstanceOf(Blob)
      expect(photo.src).toBe(dataUrl)
    },
  )

  it('wandelt nicht standardisierte Exportfehler in eine verständliche Meldung um', async () => {
    vi.mocked(toBlob).mockRejectedValue({ type: 'error' })
    await expect(exportOverlayPng(document.createElement('div'), 'square')).rejects.toThrow(
      'PNG konnte nicht erstellt werden. Bitte versuche es erneut.',
    )
  })

  it('hängt den Download-Link für Browserkompatibilität kurz in das Dokument ein', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    downloadPng(new Blob(['png']), 'baseline-cycling.png')
    expect(click).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download="baseline-cycling.png"]')).toBeNull()
    click.mockRestore()
  })
})
