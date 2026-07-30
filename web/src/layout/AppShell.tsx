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
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Brand } from '../components/Brand'
import { ThemeModeToggle } from '../components/ThemeModeToggle'
import { UploadDialog } from '../components/UploadDialog'
import { useUiMode } from '../UiModeProvider'
import { MinimalAppShell } from './MinimalAppShell'

const drawerWidth = 248
const nav = [
  { label: 'Übersicht', path: '/', icon: <DashboardRoundedIcon /> },
  { label: 'Aktivitäten', path: '/aktivitaeten', icon: <DirectionsBikeRoundedIcon /> },
  { label: 'Meilensteine', path: '/meilensteine', icon: <StarsRoundedIcon /> },
  { label: 'Entwicklung', path: '/entwicklung', icon: <TimelineRoundedIcon /> },
  { label: 'Rekorde', path: '/rekorde', icon: <EmojiEventsRoundedIcon /> },
  { label: 'Statistiken', path: '/statistiken', icon: <BarChartRoundedIcon /> },
  { label: 'Vergleich', path: '/vergleich', icon: <CompareArrowsRoundedIcon /> },
  { label: 'Baseline Cycling Chat', path: '/coach', icon: <SmartToyRoundedIcon /> },
]

export interface ShellOutletContext {
  openImport: () => void
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { profile } = useAuth()
  const location = useLocation()
  const navigation = profile?.is_admin
    ? [...nav, { label: 'MCP-Verwaltung', path: '/administration/mcp', icon: <AdminPanelSettingsRoundedIcon /> }]
    : nav
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2 }}>
      <Box sx={{ px: 1, py: 1.25, mb: 3 }}><Brand /></Box>
      <List sx={{ display: 'grid', gap: 0.5 }}>
        {navigation.map((item) => {
          const selected = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
          return (
            <ListItemButton
              key={item.path}
              component={NavLink}
              to={item.path}
              selected={selected}
              onClick={onNavigate}
              sx={{ borderRadius: 3, minHeight: 48, '&.Mui-selected': { bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' }, '& .MuiListItemIcon-root': { color: 'inherit' } } }}
            >
              <ListItemIcon sx={{ minWidth: 42 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 700 }} />
            </ListItemButton>
          )
        })}
      </List>
      <Box sx={{ flex: 1 }} />
      <ListItemButton
        component={NavLink}
        to="/profil"
        onClick={onNavigate}
        sx={{
          alignSelf: 'flex-start',
          width: 'fit-content',
          maxWidth: '100%',
          height: 56,
          minHeight: 56,
          maxHeight: 56,
          flex: 'none',
          borderRadius: 3,
          p: 1,
        }}
      >
        <Avatar src={profile?.avatar_data_url ?? undefined} alt={profile?.display_name ?? 'Profilbild'} sx={{ width: 38, height: 38, bgcolor: 'secondary.light', color: 'secondary.dark', fontWeight: 800 }}>
          {profile?.display_name?.charAt(0).toUpperCase() || <PersonRoundedIcon />}
        </Avatar>
        <ListItemText
          sx={{ ml: 1.25 }}
          primary={profile?.display_name}
          secondary={profile?.email}
          primaryTypographyProps={{ fontWeight: 750, noWrap: true, fontSize: '.9rem' }}
          secondaryTypographyProps={{ noWrap: true, fontSize: '.72rem' }}
        />
      </ListItemButton>
    </Box>
  )
}

function ClassicAppShell() {
  const theme = useTheme()
  const desktop = useMediaQuery(theme.breakpoints.up('lg'))
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  return (
    <Box sx={{ minHeight: '100vh' }}>
      {desktop ? (
        <Drawer variant="permanent" sx={{ width: drawerWidth, '& .MuiDrawer-paper': { width: drawerWidth, borderRightColor: 'divider' } }}>
          <Navigation />
        </Drawer>
      ) : (
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} sx={{ '& .MuiDrawer-paper': { width: drawerWidth } }}>
          <Navigation onNavigate={() => setDrawerOpen(false)} />
        </Drawer>
      )}
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{ width: { lg: `calc(100% - ${drawerWidth}px)` }, ml: { lg: `${drawerWidth}px` }, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'rgba(var(--mui-palette-background-paperChannel) / .88)', backdropFilter: 'blur(16px)' }}
      >
        <Toolbar sx={{ gap: 1.5 }}>
          {!desktop && <IconButton aria-label="Menü öffnen" onClick={() => setDrawerOpen(true)}><MenuRoundedIcon /></IconButton>}
          {!desktop && <Brand compact />}
          <Box sx={{ flex: 1 }} />
          <ThemeModeToggle />
          <Button aria-label="Aktivität importieren" variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setUploadOpen(true)} sx={{ minWidth: { xs: 44, sm: 'auto' }, px: { xs: 1.25, sm: 2 } }}>
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Aktivität importieren</Box>
          </Button>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ ml: { lg: `${drawerWidth}px` }, pt: '64px', minHeight: '100vh' }}>
        <Box sx={{ width: '100%', maxWidth: 1480, mx: 'auto', px: { xs: 2, sm: 3, xl: 5 }, py: { xs: 3, md: 4 } }}>
          <Outlet context={{ openImport: () => setUploadOpen(true) } satisfies ShellOutletContext} />
        </Box>
      </Box>
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </Box>
  )
}

export function AppShell() {
  const { minimal } = useUiMode()
  return minimal ? <MinimalAppShell /> : <ClassicAppShell />
}
