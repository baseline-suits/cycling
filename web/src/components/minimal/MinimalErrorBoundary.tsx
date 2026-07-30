import { Component, type ErrorInfo, type ReactNode } from 'react'
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded'
import { Box, Button, Stack, Typography } from '@mui/material'

interface State { error: Error | null }

export class MinimalErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Minimal UI konnte nicht gerendert werden.', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Box component="main" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3, bgcolor: '#090E0D', color: '#F3F7F6' }}>
        <Stack alignItems="center" textAlign="center" spacing={2} sx={{ maxWidth: 560 }}>
          <ErrorOutlineRoundedIcon color="error" sx={{ fontSize: 52 }} />
          <Typography component="h1" variant="h2">Baseline Cycling konnte diese Ansicht nicht öffnen.</Typography>
          <Typography color="text.secondary">Deine Daten wurden nicht verändert. Lade die Seite neu oder kehre zur Übersicht zurück.</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
            <Button variant="contained" onClick={() => window.location.reload()}>Neu laden</Button>
            <Button color="inherit" onClick={() => window.location.assign('/')}>Zur Übersicht</Button>
          </Stack>
        </Stack>
      </Box>
    )
  }
}
