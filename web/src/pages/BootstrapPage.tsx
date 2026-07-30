import { useState } from 'react'
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded'
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { errorMessage } from '../utils/format'

export function BootstrapPage() {
  const { bootstrap } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [bootstrapCode, setBootstrapCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (password.length < 10) return setError('Das Passwort muss mindestens 10 Zeichen lang sein.')
    setPending(true)
    setError(null)
    try {
      await bootstrap({ display_name: name.trim(), email: email.trim(), password, bootstrap_code: bootstrapCode.trim() })
      navigate('/', { replace: true })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPending(false)
    }
  }

  return (
    <Stack component="form" onSubmit={submit} spacing={2.25}>
      <Box>
        <Typography variant="h2">Baseline Cycling einrichten</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>Erstelle das erste Administratorkonto einer neuen Installation.</Typography>
      </Box>
      <Alert severity="info">Dieser Vorgang funktioniert nur, solange noch kein Konto existiert.</Alert>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField label="Anzeigename" required autoFocus fullWidth value={name} onChange={(event) => setName(event.target.value)} />
      <TextField label="E-Mail-Adresse" type="email" required fullWidth value={email} onChange={(event) => setEmail(event.target.value)} />
      <TextField label="Einrichtungscode" required fullWidth value={bootstrapCode} onChange={(event) => setBootstrapCode(event.target.value)} helperText="Code aus der Server-Konfiguration" />
      <TextField label="Passwort" type="password" helperText="Mindestens 10 Zeichen" required fullWidth value={password} onChange={(event) => setPassword(event.target.value)} />
      <Button type="submit" variant="contained" size="large" startIcon={<AdminPanelSettingsRoundedIcon />} disabled={pending}>
        {pending ? 'Installation wird eingerichtet …' : 'Installation einrichten'}
      </Button>
      <Typography textAlign="center" color="text.secondary"><Link component={RouterLink} to="/login">Zurück zur Anmeldung</Link></Typography>
    </Stack>
  )
}
