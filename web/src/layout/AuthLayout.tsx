import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CloudDoneRoundedIcon from '@mui/icons-material/CloudDoneRounded'
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded'
import { Box, Chip, Stack, Typography } from '@mui/material'
import { Outlet } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { ThemeModeToggle } from '../components/ThemeModeToggle'

export function AuthLayout() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(360px, .9fr) minmax(460px, 1.1fr)' } }}>
      <Box sx={{ p: { xs: 2.5, sm: 5, lg: 7 }, display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Brand />
          <ThemeModeToggle />
        </Stack>
        <Box sx={{ width: '100%', maxWidth: 460, m: 'auto', py: 5 }}>
          <Outlet />
        </Box>
        <Typography variant="caption" color="text.secondary">Privat. Sicher. Dein Training.</Typography>
      </Box>
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          position: 'relative',
          overflow: 'hidden',
          p: { md: 6, lg: 9 },
          color: 'white',
          alignItems: 'center',
          background: 'radial-gradient(circle at 82% 18%, rgba(185,232,120,.2), transparent 30%), radial-gradient(circle at 16% 82%, rgba(143,134,255,.16), transparent 34%), linear-gradient(145deg, #080A0D 0%, #11151D 58%, #171923 100%)',
          '&::after': {
            content: '""',
            position: 'absolute',
            width: 480,
            height: 480,
            border: '70px solid rgba(255,255,255,.045)',
            borderRadius: '50%',
            right: -230,
            bottom: -180,
          },
        }}
      >
        <Stack spacing={4} sx={{ position: 'relative', zIndex: 1, maxWidth: 640 }}>
          <Chip label="DEIN RIDE. DEINE DATEN." sx={{ alignSelf: 'flex-start', bgcolor: 'rgba(255,255,255,.12)', color: 'white', letterSpacing: '.08em' }} />
          <Typography variant="h1" sx={{ color: 'white', maxWidth: 560 }}>
            Jede Fahrt erzählt eine Geschichte.
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 450, color: 'rgba(255,255,255,.75)', maxWidth: 560, lineHeight: 1.6 }}>
            Baseline Cycling verbindet Strecke, Leistung, Wetter und KI zu einem klaren Blick auf dein Radtraining.
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={1.5}>
            <Feature icon={<CloudDoneRoundedIcon />} label="Überall synchron" />
            <Feature icon={<InsightsRoundedIcon />} label="Klare Trends" />
            <Feature icon={<AutoAwesomeRoundedIcon />} label="KI-Coach" />
          </Stack>
        </Stack>
      </Box>
    </Box>
  )
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 1.1, px: 1.5, border: '1px solid rgba(255,255,255,.14)', borderRadius: 3, bgcolor: 'rgba(255,255,255,.06)' }}>
      {icon}<Typography fontWeight={650}>{label}</Typography>
    </Stack>
  )
}
