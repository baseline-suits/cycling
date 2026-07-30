import { useState } from 'react'
import PersonAddRoundedIcon from '@mui/icons-material/PersonAddRounded'
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { errorMessage } from '../utils/format'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [invite, setInvite] = useState(params.get('einladung') ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (password.length < 10) return setError('Das Passwort muss mindestens 10 Zeichen lang sein.')
    if (password !== confirm) return setError('Die Passwörter stimmen nicht überein.')
    setPending(true)
    setError(null)
    try {
      await register({ display_name: name.trim(), email: email.trim(), password, invite_token: invite.trim() })
      navigate('/', { replace: true })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPending(false)
    }
  }

  return (
    <Stack component="form" onSubmit={submit} spacing={2}>
      <Box>
        <Typography variant="h2">Dein Baseline Cycling-Konto</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>Registriere dich mit dem Einladungscode deines Administrators.</Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField label="Anzeigename" required autoFocus fullWidth value={name} onChange={(event) => setName(event.target.value)} />
      <TextField label="E-Mail-Adresse" type="email" autoComplete="email" required fullWidth value={email} onChange={(event) => setEmail(event.target.value)} />
      <TextField label="Einladungscode" required fullWidth value={invite} onChange={(event) => setInvite(event.target.value)} />
      <TextField label="Passwort" type="password" autoComplete="new-password" helperText="Mindestens 10 Zeichen" required fullWidth value={password} onChange={(event) => setPassword(event.target.value)} />
      <TextField label="Passwort wiederholen" type="password" autoComplete="new-password" required fullWidth value={confirm} onChange={(event) => setConfirm(event.target.value)} />
      <Button type="submit" variant="contained" size="large" startIcon={<PersonAddRoundedIcon />} disabled={pending}>
        {pending ? 'Konto wird erstellt …' : 'Konto erstellen'}
      </Button>
      <Typography textAlign="center" color="text.secondary">
        Schon registriert? <Link component={RouterLink} to="/login" fontWeight={750}>Anmelden</Link>
      </Typography>
    </Stack>
  )
}
