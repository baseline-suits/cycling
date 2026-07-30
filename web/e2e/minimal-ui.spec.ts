import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { rides, tcxForRide } from './fixture-data'

interface FixtureActivity { id: string; title: string }

async function fixtures() {
  return JSON.parse(await readFile(resolve('e2e/.auth/fixtures.json'), 'utf8')) as { activities: FixtureActivity[] }
}

async function accessToken(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('avento.auth.tokens')
    return raw ? (JSON.parse(raw) as { access_token: string }).access_token : ''
  })
}

async function setUiMode(page: Page, mode: 'classic' | 'minimal') {
  const login = await page.request.post('/api/v1/auth/login', { data: { email: 'visual@example.de', password: 'playwright-visual-password' } })
  expect(login.ok()).toBeTruthy()
  const tokens = await login.json()
  await page.goto('/')
  await page.evaluate((value) => localStorage.setItem('avento.auth.tokens', JSON.stringify(value)), tokens)
  const response = await page.evaluate(async (nextMode) => {
    const raw = localStorage.getItem('avento.auth.tokens')
    const stored = raw ? JSON.parse(raw) as { access_token: string } : null
    return fetch('/api/v1/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stored?.access_token ?? ''}` },
      body: JSON.stringify({ ui_mode: nextMode }),
    }).then((result) => result.status)
  }, mode)
  expect(response).toBe(200)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-ui-mode', mode)
}

async function importDisposableActivity(page: Page, request: APIRequestContext) {
  const token = await accessToken(page)
  const ride = { ...rides[0], title: 'Playwright Löschkandidat', daysAgo: 2 }
  const response = await request.post('/api/v1/activities', {
    headers: { Authorization: `Bearer ${token}` },
    multipart: { file: { name: 'delete-me.tcx', mimeType: 'application/xml', buffer: Buffer.from(tcxForRide(ride)) }, title: ride.title, type: ride.type },
  })
  expect(response.ok()).toBeTruthy()
  return response.json() as Promise<FixtureActivity>
}

test('Beta-Toggle bestätigt, persistiert und stellt Classic samt Farbpräferenz wieder her', async ({ page, browser }) => {
  await page.addInitScript(() => localStorage.setItem('avento-color-mode', 'light'))
  await setUiMode(page, 'classic')
  await page.goto('/profil')
  const toggle = page.getByRole('switch', { name: 'Minimal UI (Beta)' })
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  const confirm = page.getByRole('dialog', { name: 'Minimal UI aktivieren?' })
  await expect(confirm).toBeVisible()
  await expect(confirm.getByRole('button', { name: 'Beta aktivieren' })).toBeFocused()
  await confirm.getByRole('button', { name: 'Abbrechen' }).click()
  await expect(toggle).toBeFocused()
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  await confirm.getByRole('button', { name: 'Beta aktivieren' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-ui-mode', 'minimal')
  await expect(page.getByRole('button', { name: 'Informationen zur Minimal UI Beta' })).toBeVisible()

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-ui-mode', 'minimal')
  const context = await browser.newContext({ storageState: await page.context().storageState(), colorScheme: 'dark' })
  const freshPage = await context.newPage()
  await freshPage.goto('/')
  await expect(freshPage.getByRole('heading', { name: /Hallo, Dimitri/ })).toBeVisible()
  await context.close()

  await page.goto('/profil')
  await page.getByRole('switch', { name: 'Minimal UI (Beta)' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-ui-mode', 'classic')
  await expect(page.getByRole('button', { name: 'Dunklen Modus aktivieren' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Informationen zur Minimal UI Beta' })).toHaveCount(0)
})

test('alle Minimal-Routen funktionieren direkt, einschließlich GPS- und Fallback-Aktivität', async ({ page }) => {
  const data = await fixtures()
  const rich = data.activities.find((item) => item.title === rides[0].title)!
  const noGps = data.activities.find((item) => item.title === 'Indoor-Intervalle ohne GPS')!
  const compare = data.activities.slice(0, 2).map((item) => `activity=${item.id}`).join('&')
  const routes: Array<[string, RegExp | string]> = [
    ['/', /Hallo, Dimitri/],
    ['/aktivitaeten', 'Aktivitäten'],
    [`/aktivitaeten/${rich.id}`, rich.title],
    [`/aktivitaeten/${rich.id}/analyse`, rich.title],
    [`/aktivitaeten/${noGps.id}`, noGps.title],
    ['/entwicklung', 'Fortschritt braucht Kontext.'],
    ['/statistiken', 'Statistiken, die Zusammenhänge zeigen.'],
    [`/vergleich?${compare}`, 'Unterschiede auf einen Blick.'],
    ['/rekorde', 'Deine stärksten Momente.'],
    ['/meilensteine', 'Was du dir erfahren hast.'],
    ['/coach', 'Baseline Cycling Chat'],
    ['/profil', 'Profil & Einstellungen'],
    ['/administration/mcp', 'MCP-Zugänge'],
    ['/diese-route-gibt-es-nicht', 'Hier endet diese Strecke.'],
  ]
  await setUiMode(page, 'minimal')
  for (const [path, heading] of routes) {
    await page.goto(path)
    await expect(page.locator('html')).toHaveAttribute('data-ui-mode', 'minimal')
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await expect(page.locator('main')).toBeVisible()
  }
})

test('Classic bleibt auf sämtlichen Produktrouten erhalten', async ({ page }) => {
  const data = await fixtures()
  const rich = data.activities[0]
  const routes = ['/', '/aktivitaeten', `/aktivitaeten/${rich.id}`, `/aktivitaeten/${rich.id}/analyse`, '/entwicklung', '/statistiken', '/vergleich', '/rekorde', '/meilensteine', '/coach', '/profil', '/administration/mcp']
  await setUiMode(page, 'classic')
  for (const path of routes) {
    await page.goto(path)
    await expect(page.locator('html')).toHaveAttribute('data-ui-mode', 'classic')
    await expect(page.locator('h1').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Informationen zur Minimal UI Beta' })).toHaveCount(0)
  }
})

test('Filter, Bearbeiten, Löschen, Chat, MCP und Profilaktionen bleiben funktionsfähig', async ({ page, request }) => {
  const data = await fixtures()
  const rich = data.activities[0]
  await setUiMode(page, 'minimal')

  await page.goto('/aktivitaeten')
  await page.getByLabel('Sportart').click()
  await page.getByRole('option', { name: 'Training' }).click()
  await expect(page).toHaveURL(/type=training/)
  await page.getByLabel('Aktivitäten suchen').fill('Morgenrunde')
  await expect(page).toHaveURL(/q=Morgenrunde/)
  await expect(page.getByRole('heading', { name: rich.title })).toBeVisible()

  await page.goto(`/aktivitaeten/${rich.id}`)
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Aktivität bearbeiten' })
  await expect(edit.getByLabel('Titel')).toBeFocused()
  await edit.getByLabel('Private Notizen').fill('Automatisiert geprüft.')
  await edit.getByRole('button', { name: 'Speichern' }).click()
  await expect(edit).toBeHidden()
  await expect(page.getByText('Automatisiert geprüft.')).toBeVisible()

  const disposable = await importDisposableActivity(page, request)
  await page.goto(`/aktivitaeten/${disposable.id}`)
  await page.getByRole('button', { name: 'Löschen' }).click()
  const remove = page.getByRole('dialog', { name: 'Aktivität löschen?' })
  await expect(remove.getByRole('button', { name: 'Abbrechen' })).toBeFocused()
  await remove.getByRole('button', { name: 'Endgültig löschen' }).click()
  await expect(page).toHaveURL(/\/aktivitaeten$/)

  await page.goto('/coach')
  await page.getByLabel('Nachricht an Baseline Cycling Chat').fill('Wie viele Aktivitäten habe ich?')
  await page.getByLabel('Nachricht senden').click()
  await expect(page.getByText('Wie viele Aktivitäten habe ich?')).toBeVisible()
  await expect(page.getByText(/durchsuche deine Trainingsdaten/i)).toBeHidden({ timeout: 30_000 })
  await expect(page.locator('[aria-label="Gespräch mit Baseline Cycling"]')).toContainText('Baseline Cycling')

  await page.goto('/administration/mcp')
  await page.getByRole('button', { name: 'Client anlegen' }).click()
  const create = page.getByRole('dialog', { name: 'MCP-Client anlegen' })
  await create.getByLabel('Name').fill('Playwright Client')
  await create.getByRole('checkbox').first().check()
  await create.getByRole('button', { name: 'Speichern' }).click()
  const secret = page.getByRole('dialog', { name: 'MCP-Client angelegt' })
  await expect(secret.getByLabel('Client-Secret')).not.toHaveValue('')
  await secret.getByRole('button', { name: 'Ich habe es sicher gespeichert' }).click()
  await expect(page.getByText('Playwright Client')).toBeVisible()

  await page.goto('/profil')
  await page.getByLabel('Anzeigename').first().fill('Dimitri')
  await page.getByRole('button', { name: 'Änderungen speichern' }).click()
  await expect(page.getByText('Profil gespeichert.')).toBeVisible()
})

test('Nicht-Admin und leere Datensätze zeigen verständliche Zustände', async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'e2e/.auth/empty-user.json', colorScheme: 'dark' })
  const page = await context.newPage()
  await page.goto('/')
  const response = await page.evaluate(async () => {
    const raw = localStorage.getItem('avento.auth.tokens')
    const token = raw ? (JSON.parse(raw) as { access_token: string }).access_token : ''
    return fetch('/api/v1/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ui_mode: 'minimal' }) }).then((result) => result.status)
  })
  expect(response).toBe(200)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-ui-mode', 'minimal')
  await page.goto('/aktivitaeten')
  await expect(page.getByText(/Noch keine Aktivitäten|Keine Aktivitäten/)).toBeVisible()
  await page.goto('/administration/mcp')
  await expect(page.getByText('Dieser Bereich ist Administratoren vorbehalten.')).toBeVisible()
  await context.close()
})

test('mobile Navigation, Dialoge und alle Seiten bleiben bei 320 px ohne horizontalen Overflow', async ({ page }) => {
  const data = await fixtures()
  const rich = data.activities[0]
  const routes = ['/', '/aktivitaeten', `/aktivitaeten/${rich.id}`, `/aktivitaeten/${rich.id}/analyse`, '/entwicklung', '/statistiken', '/vergleich', '/rekorde', '/meilensteine', '/coach', '/profil', '/administration/mcp', '/unbekannt']
  await setUiMode(page, 'minimal')
  await page.setViewportSize({ width: 320, height: 760 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Menü öffnen' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('navigation')).toBeHidden()
  await page.getByRole('button', { name: 'Informationen zur Minimal UI Beta' }).click()
  const dialog = page.getByRole('dialog', { name: 'Minimal UI · Beta' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  for (const path of routes) {
    await page.goto(path)
    await expect(page.locator('main')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `Horizontaler Overflow auf ${path}`).toBeLessThanOrEqual(1)
  }
})

test('versionierte visuelle Referenzen für Classic und sämtliche Minimal-Seiten', async ({ page }) => {
  test.setTimeout(180_000)
  const data = await fixtures()
  const rich = data.activities.find((item) => item.title === rides[0].title)!
  const noGps = data.activities.find((item) => item.title === 'Indoor-Intervalle ohne GPS')!
  const compare = data.activities.slice(0, 2).map((item) => `activity=${item.id}`).join('&')
  const viewports = [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'tablet', width: 834, height: 1112 },
    { name: 'mobile', width: 390, height: 844 },
  ] as const

  await setUiMode(page, 'classic')
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Hallo Dimitri/ })).toBeVisible()
    await expect(page).toHaveScreenshot(`classic-dashboard-${viewport.name}.png`, { fullPage: true })
  }

  const pages: Array<{ name: string; path: string; heading: string | RegExp }> = [
    { name: 'dashboard', path: '/', heading: /Hallo, Dimitri/ },
    { name: 'activities', path: '/aktivitaeten', heading: 'Aktivitäten' },
    { name: 'activity-detail', path: `/aktivitaeten/${rich.id}`, heading: rich.title },
    { name: 'activity-analysis', path: `/aktivitaeten/${rich.id}/analyse`, heading: rich.title },
    { name: 'activity-without-gps', path: `/aktivitaeten/${noGps.id}`, heading: noGps.title },
    { name: 'development', path: '/entwicklung', heading: 'Fortschritt braucht Kontext.' },
    { name: 'statistics', path: '/statistiken', heading: 'Statistiken, die Zusammenhänge zeigen.' },
    { name: 'compare', path: `/vergleich?${compare}`, heading: 'Unterschiede auf einen Blick.' },
    { name: 'records', path: '/rekorde', heading: 'Deine stärksten Momente.' },
    { name: 'milestones', path: '/meilensteine', heading: 'Was du dir erfahren hast.' },
    { name: 'chat', path: '/coach', heading: 'Baseline Cycling Chat' },
    { name: 'profile', path: '/profil', heading: 'Profil & Einstellungen' },
    { name: 'mcp', path: '/administration/mcp', heading: 'MCP-Zugänge' },
    { name: 'not-found', path: '/nicht-gefunden', heading: 'Hier endet diese Strecke.' },
  ]
  await setUiMode(page, 'minimal')
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    for (const target of pages) {
      await page.goto(target.path)
      await expect(page.getByRole('heading', { level: 1, name: target.heading })).toBeVisible()
      await expect(page).toHaveScreenshot(`minimal-${target.name}-${viewport.name}.png`, {
        fullPage: true,
        mask: [page.locator('.maplibregl-map')],
      })
    }
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Informationen zur Minimal UI Beta' }).click()
  await expect(page).toHaveScreenshot('minimal-beta-dialog-mobile.png')
})
