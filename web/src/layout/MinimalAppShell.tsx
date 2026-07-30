import { useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded'
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded'
import CompareArrowsRoundedIcon from '@mui/icons-material/CompareArrowsRounded'
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded'
import DirectionsBikeRoundedIcon from '@mui/icons-material/DirectionsBikeRounded'
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded'
import MenuRoundedIcon from '@mui/icons-material/MenuRounded'
import PersonRoundedIcon from '@mui/icons-material/PersonRounded'
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded'
import StarsRoundedIcon from '@mui/icons-material/StarsRounded'
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded'
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Brand } from '../components/Brand'
import { UploadDialog } from '../components/UploadDialog'
import type { ShellOutletContext } from './AppShell'

const drawerWidth = 216
const navigationItems = [
  { label: 'Übersicht', path: '/', icon: <DashboardRoundedIcon /> },
  { label: 'Aktivitäten', path: '/aktivitaeten', icon: <DirectionsBikeRoundedIcon /> },
  { label: 'Meilensteine', path: '/meilensteine', icon: <StarsRoundedIcon /> },
  { label: 'Entwicklung', path: '/entwicklung', icon: <TimelineRoundedIcon /> },
  { label: 'Rekorde', path: '/rekorde', icon: <EmojiEventsRoundedIcon /> },
  { label: 'Statistiken', path: '/statistiken', icon: <BarChartRoundedIcon /> },
  { label: 'Vergleich', path: '/vergleich', icon: <CompareArrowsRoundedIcon /> },
  { label: 'Baseline Cycling Chat', path: '/coach', icon: <SmartToyRoundedIcon /> },
]

function BetaBadge({ onClick }: { onClick: () => void }) {
  return (
    <Button
      size="small"
      variant="text"
      onClick={onClick}
      aria-label="Informationen zur Minimal UI Beta"
      sx={{ minHeight: 34, px: 1.25, color: 'text.secondary', bgcolor: 'rgba(239,244,234,.045)', border: '1px solid', borderColor: 'divider', '&:hover': { bgcolor: 'rgba(185,232,120,.08)', color: 'text.primary' } }}
    >
      Minimal UI · Beta
    </Button>
  )
}

function Navigation({ onNavigate, onBetaInfo }: { onNavigate?: () => void; onBetaInfo: () => void }) {
  const { profile } = useAuth()
  const location = useLocation()
  const items = profile?.is_admin
    ? [...navigationItems, { label: 'MCP-Verwaltung', path: '/administration/mcp', icon: <AdminPanelSettingsRoundedIcon /> }]
    : navigationItems

  return (
    <Box component="nav" aria-label="Hauptnavigation" sx={{ height: '100%', display: 'flex', flexDirection: 'column', px: 1.5, py: 2 }}>
      <Box sx={{ px: 1, py: .75, mb: 3.5 }}><Brand /></Box>
      <List sx={{ display: 'grid', gap: .25, p: 0 }}>
        {items.map((item) => {
          const selected = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
          return (
            <ListItemButton
              key={item.path}
              component={NavLink}
              to={item.path}
              selected={selected}
              onClick={onNavigate}
              sx={{ minHeight: 42, px: 1.25, borderRadius: 2, color: selected ? 'text.primary' : 'text.secondary', '&.Mui-selected': { bgcolor: 'rgba(185,232,120,.105)', color: 'primary.light', '&:hover': { bgcolor: 'rgba(185,232,120,.14)' } } }}
            >
              <ListItemIcon sx={{ minWidth: 34, color: 'inherit', '& svg': { fontSize: 20 } }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '.84rem', fontWeight: selected ? 720 : 580 }} />
            </ListItemButton>
          )
        })}
      </List>
      <Box sx={{ flex: 1 }} />
      <Stack spacing={1.25} alignItems="flex-start" sx={{ px: .5 }}>
        <BetaBadge onClick={onBetaInfo} />
        <ListItemButton component={NavLink} to="/profil" onClick={onNavigate} sx={{ width: '100%', minHeight: 52, p: .75, borderRadius: 2 }}>
          <Avatar src={profile?.avatar_data_url ?? undefined} alt={profile?.display_name ?? 'Profilbild'} sx={{ width: 36, height: 36, bgcolor: 'rgba(185,232,120,.14)', color: 'primary.light', fontWeight: 750 }}>
            {profile?.display_name?.charAt(0).toUpperCase() || <PersonRoundedIcon />}
          </Avatar>
          <ListItemText sx={{ ml: 1 }} primary={profile?.display_name} secondary="Profil & Einstellungen" primaryTypographyProps={{ fontWeight: 680, noWrap: true, fontSize: '.82rem' }} secondaryTypographyProps={{ noWrap: true, fontSize: '.68rem' }} />
        </ListItemButton>
      </Stack>
    </Box>
  )
}

function BetaInfoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="minimal-beta-title" aria-describedby="minimal-beta-description">
      <DialogTitle id="minimal-beta-title">Minimal UI · Beta</DialogTitle>
      <DialogContent id="minimal-beta-description">
        <Stack component="ul" spacing={1.25} sx={{ mt: .5, pl: 2.5, color: 'text.secondary' }}>
          <Typography component="li">Diese Oberfläche ist experimentell.</Typography>
          <Typography component="li">Alle Trainings- und Einstellungsbereiche verwenden die reduzierte Darstellung.</Typography>
          <Typography component="li">Darstellung und Struktur können sich verändern.</Typography>
          <Typography component="li">Du kannst im Profil jederzeit zur klassischen Oberfläche zurückkehren.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}><Button variant="contained" onClick={onClose} autoFocus>Verstanden</Button></DialogActions>
    </Dialog>
  )
}

export function MinimalAppShell() {
  const theme = useTheme()
  const desktop = useMediaQuery(theme.breakpoints.up('lg'))
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [betaInfoOpen, setBetaInfoOpen] = useState(false)
  const navigation = <Navigation onNavigate={desktop ? undefined : () => setDrawerOpen(false)} onBetaInfo={() => setBetaInfoOpen(true)} />

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {desktop ? (
        <Drawer variant="permanent" sx={{ width: drawerWidth, '& .MuiDrawer-paper': { width: drawerWidth, bgcolor: '#0D1015', borderRight: '1px solid', borderColor: 'divider' } }}>{navigation}</Drawer>
      ) : (
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} sx={{ '& .MuiDrawer-paper': { width: 'min(86vw, 280px)', bgcolor: '#0D1015' } }}>{navigation}</Drawer>
      )}
      <AppBar position="fixed" color="transparent" elevation={0} sx={{ width: { lg: `calc(100% - ${drawerWidth}px)` }, ml: { lg: `${drawerWidth}px` }, bgcolor: 'rgba(9,14,13,.82)', backdropFilter: 'blur(18px)', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ minHeight: { xs: 60, sm: 64 }, px: { xs: 1.5, sm: 3 }, gap: 1 }}>
          {!desktop && <IconButton aria-label="Menü öffnen" onClick={() => setDrawerOpen(true)}><MenuRoundedIcon /></IconButton>}
          {!desktop && <Brand compact />}
          <Box sx={{ flex: 1 }} />
          {!desktop && <BetaBadge onClick={() => setBetaInfoOpen(true)} />}
          <Button aria-label="Aktivität importieren" variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setUploadOpen(true)} sx={{ minWidth: { xs: 44, sm: 'auto' }, px: { xs: 1.25, sm: 2 }, ml: .5 }}>
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Aktivität importieren</Box>
          </Button>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ ml: { lg: `${drawerWidth}px` }, pt: { xs: '60px', sm: '64px' }, minHeight: '100vh' }}>
        <Box sx={{ width: '100%', maxWidth: 'var(--avento-minimal-content-width)', mx: 'auto', px: { xs: 2, sm: 3, md: 4, xl: 5 }, py: { xs: 4, md: 6, xl: 7 } }}>
          <Outlet context={{ openImport: () => setUploadOpen(true) } satisfies ShellOutletContext} />
        </Box>
      </Box>
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <BetaInfoDialog open={betaInfoOpen} onClose={() => setBetaInfoOpen(false)} />
    </Box>
  )
}
