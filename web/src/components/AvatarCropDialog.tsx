import { useEffect, useRef, useState } from 'react'
import CropRoundedIcon from '@mui/icons-material/CropRounded'
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Slider, Stack, Typography } from '@mui/material'

interface AvatarCropDialogProps {
  open: boolean
  file: File | null
  busy?: boolean
  onClose: () => void
  onConfirm: (file: File) => void
}

function drawCrop(canvas: HTMLCanvasElement, image: HTMLImageElement, zoom: number, positionX: number, positionY: number) {
  const context = canvas.getContext('2d')
  if (!context) return
  const baseSize = Math.min(image.naturalWidth, image.naturalHeight)
  const cropSize = baseSize / zoom
  const maxX = Math.max(0, image.naturalWidth - cropSize)
  const maxY = Math.max(0, image.naturalHeight - cropSize)
  const sourceX = maxX * ((positionX + 100) / 200)
  const sourceY = maxY * ((positionY + 100) / 200)
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, canvas.width, canvas.height)
}

export function AvatarCropDialog({ open, file, busy, onClose, onConfirm }: AvatarCropDialogProps) {
  const previewRef = useRef<HTMLCanvasElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [positionX, setPositionX] = useState(0)
  const [positionY, setPositionY] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !file) return
    setImage(null)
    setError(null)
    setZoom(1)
    setPositionX(0)
    setPositionY(0)
    const url = URL.createObjectURL(file)
    const nextImage = new Image()
    nextImage.onload = () => setImage(nextImage)
    nextImage.onerror = () => setError('Dieses Bildformat kann im Browser nicht zugeschnitten werden. Bitte verwende beispielsweise JPEG, PNG, WebP oder GIF.')
    nextImage.src = url
    return () => URL.revokeObjectURL(url)
  }, [file, open])

  useEffect(() => {
    if (previewRef.current && image) drawCrop(previewRef.current, image, zoom, positionX, positionY)
  }, [image, positionX, positionY, zoom])

  async function confirm() {
    if (!image) return
    setError(null)
    try {
      const output = document.createElement('canvas')
      output.width = 1024
      output.height = 1024
      drawCrop(output, image, zoom, positionX, positionY)
      const blob = await new Promise<Blob>((resolve, reject) => {
        output.toBlob((value) => value ? resolve(value) : reject(new Error('Bild konnte nicht erstellt werden.')), 'image/jpeg', .92)
      })
      onConfirm(new File([blob], 'avatar.jpg', { type: 'image/jpeg', lastModified: Date.now() }))
    } catch {
      setError('Der Bildausschnitt konnte nicht erstellt werden. Bitte wähle ein anderes Bild.')
    }
  }

  function reset() {
    setZoom(1)
    setPositionX(0)
    setPositionY(0)
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Profilbild zuschneiden</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Passe den quadratischen Ausschnitt an. Baseline Cycling speichert daraus ein optimiertes 1:1-Profilbild.</Typography>
        <Box sx={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', borderRadius: '50%', bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider', boxShadow: 'inset 0 0 0 10px rgba(255,255,255,.35)' }}>
          <Box component="canvas" ref={previewRef} width={640} height={640} aria-label="Vorschau des Profilbilds" sx={{ width: '100%', height: '100%', display: 'block' }} />
          {!image && !error && <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><Typography color="text.secondary">Bild wird vorbereitet …</Typography></Box>}
        </Box>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        <Stack spacing={1.5} sx={{ mt: 2.5 }}>
          <Box><Typography variant="caption" color="text.secondary">Zoom</Typography><Slider value={zoom} min={1} max={3} step={.01} disabled={!image} onChange={(_, value) => setZoom(value as number)} aria-label="Zoom" /></Box>
          <Box><Typography variant="caption" color="text.secondary">Horizontaler Ausschnitt</Typography><Slider value={positionX} min={-100} max={100} disabled={!image} onChange={(_, value) => setPositionX(value as number)} aria-label="Horizontaler Ausschnitt" /></Box>
          <Box><Typography variant="caption" color="text.secondary">Vertikaler Ausschnitt</Typography><Slider value={positionY} min={-100} max={100} disabled={!image} onChange={(_, value) => setPositionY(value as number)} aria-label="Vertikaler Ausschnitt" /></Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button startIcon={<RestartAltRoundedIcon />} onClick={reset} disabled={!image || busy}>Zurücksetzen</Button>
        <Box sx={{ flex: 1 }} />
        <Button color="inherit" onClick={onClose} disabled={busy}>Abbrechen</Button>
        <Button variant="contained" startIcon={<CropRoundedIcon />} onClick={() => void confirm()} disabled={!image || busy}>{busy ? 'Wird hochgeladen …' : 'Übernehmen'}</Button>
      </DialogActions>
    </Dialog>
  )
}
