# Minimal UI (Beta)

## Zielbild und Umfang

Die Minimal UI ist eine optionale, Dark-only Präsentationsschicht für die gesamte angemeldete Baseline Cycling-Web-App. Sie verwendet dieselben URLs, APIs, React-Query-Caches, Berechnungen und Mutationen wie Classic, ordnet die Inhalte aber als ruhiges Trainingsjournal mit klarer Typografie, wenigen Flächen und sparsamem Baseline-Lime neu.

Vollständig migriert sind:

- App-Shell, Navigation, Dashboard, globale Lade-/Fehlerzustände und unbekannte Routen
- Aktivitätenliste, Aktivitätsdetail und separate Aktivitätsanalyse
- Entwicklung, Statistiken, Vergleich und Rekorde
- Meilensteine, Ziele und Challenges
- Baseline Cycling Chat
- Profil, Avatar, Trainingsgrundlagen, Minimal-Experiment, TOTP, Passkeys, Passwort und Administratorfunktionen im Profil
- MCP-Client-, Secret-, Token- und Audit-Verwaltung
- Import-, Bearbeitungs-, Export-, Bestätigungs- und Sicherheitsdialoge

Innerhalb des Minimal-Modus existiert keine `ClassicContentBoundary` mehr. Nicht angemeldete Authentifizierungsseiten besitzen keinen benutzerbezogenen UI-Modus und verwenden weiterhin ihr gemeinsames Auth-Layout. Die native Android-App ist nicht Bestandteil dieser Web-UI-Variante.

## Aktivierung und Persistenz

Der Schalter befindet sich unter **Profil → Darstellung → Oberfläche**. Die Aktivierung erfordert den bestehenden Bestätigungsdialog; Deaktivieren stellt Classic ohne zusätzlichen Dialog wieder her. Da nur Theme und Routelement wechseln, bleiben URL, Navigationskontext, Query-Client und React-Query-Daten erhalten.

Der Modus wird als `users.ui_mode` mit den erlaubten Werten `classic` und `minimal` gespeichert. `classic` bleibt Datenbank-, Schema- und Frontendstandard. Lesen und Schreiben erfolgen über `GET/PATCH /api/v1/profile`. Die Migration `0010_add_ui_mode` verweist auf `0009_google_health`.

`UiModeProvider` hält den letzten bestätigten Modus zusätzlich als Bootstrap-Hinweis `avento-ui-mode-hint`, sofern ein Auth-Token vorhanden ist. Dieser Hinweis verhindert beim Reload ein sichtbares Classic-Aufblitzen; das Serverprofil bleibt maßgeblich. Bei einem fehlgeschlagenen `PATCH` bleiben Modus und Hinweis unverändert. Ohne Anmeldung wird der Hinweis entfernt.

Die lokale Classic-Farbpräferenz `avento-color-mode` bleibt unabhängig. Minimal ist immer dunkel. Beim Rückwechsel wird die zuvor gespeicherte helle oder dunkle Classic-Präferenz wiederhergestellt.

## Theme- und Layoutgrenzen

- `data-ui-mode="classic|minimal"` am Dokument kapselt globale Minimal-Regeln.
- `UiModeProvider` wählt `createAppTheme(classicColorMode)` oder `createMinimalTheme()`.
- `AppShell` wählt ausschließlich die Shell; `App` wählt an jeder angemeldeten Route das passende Classic- oder Minimal-Element.
- `MinimalErrorBoundary` schützt nur den Minimal-Inhaltsbaum und zeigt einen zur Minimal UI passenden globalen Fehlerzustand.
- Classic-Komponenten und Classic-Markup bleiben bestehen. Gemeinsame Komponenten erhalten nur optionale Varianten mit Classic als Standard, etwa `TrackMap` und `ActivityPhotoGallery`.
- Die Inhaltsbreite der Minimal-Shell ist auf ungefähr 1280 px begrenzt; Desktop nutzt eine 216-px-Navigation, Tablet und Mobile App-Bar plus Drawer.

## Design-Tokens

Die zentralen Tokens werden in `createMinimalTheme()` erzeugt:

| Bereich | Definition |
| --- | --- |
| Hintergrund | `#090E0D` |
| Oberflächen | `#0D1413`, `#111817`, `#17201F` |
| Primär-/Sekundärtext | `#F3F7F6` / `#96A5A2` |
| Baseline-Cycling-Akzent | `#B9E878` |
| Semantische Diagrammfarben | Türkis, ruhiges Blau, Lime, Amber und Coral |
| Rundungen | 8, 12 und 16 px |
| Abstände | 4, 8, 12, 16, 24, 32, 48 und 64 px |
| Typografie | Manrope Variable, responsive Überschriften und Kennzahlen |
| Bewegung | 120, 180 und 240 ms |
| Fokus | kontrastreicher 2-px-Ring mit Abstand |

Unter `prefers-reduced-motion: reduce` werden nicht notwendige Übergänge praktisch deaktiviert. Recharts-Animationen sind auf den Analyseansichten explizit ausgeschaltet.

## Komponenten und View-Models

Gemeinsame Minimal-Grundbausteine liegen unter `web/src/components/minimal/`:

- `MinimalPageHeader`, `MinimalSectionHeader` und `MinimalFilterBar`
- `MinimalMetric` und `MinimalChartFrame`
- `MinimalEmptyState`, `MinimalErrorState`, `MinimalPageSkeleton`
- `MinimalErrorBoundary` und `useReducedMotion`

Fachspezifische, gemeinsam verwendete Bausteine bleiben bewusst getrennt:

- `AdvancedActivityAnalysis` koppelt Karte, aktiven Messpunkt, Höhen-, Tempo-, Puls-, Leistungs- und Kadenzkurven sowie Streckenauswahl.
- `ActivityRoutePreview` erzeugt eine leichte SVG-Vorschau für höchstens zwölf sichtbare Listeneinträge.
- `AnalyticsUi` vereinheitlicht Überschriften, Vergleichskennzahlen, Diagrammrahmen, Tooltips und Richtungskennzeichnung für Entwicklung, Statistik, Vergleich und Rekorde.
- Chat, Profil und MCP verwenden jeweils ihren fachlichen Controller statt einer universellen Kartenabstraktion.

Gemeinsame Datenlogik liegt in View-Models:

- `useActivitiesViewModel` verwaltet Suche, Zeitraum, Sportart, Pagination und URL-Parameter.
- `useActivityDetailViewModel` bündelt Aktivität, Track, Rekorde, Meilensteine und bestehende Mutationen mit dem gemeinsamen Track-Key `['activity', id, 'track']`.
- `useStatisticsViewModel`, `useDevelopmentViewModel` und `useComparisonViewModel` teilen Datenzugriff, Filter und Vergleiche ohne Classic-Berechnungen zu duplizieren.
- `useChatController`, `ProfileControllerProvider` und `useMcpAdminController` bewahren bestehende Funktionalität und lokale Entwürfe beim UI-Moduswechsel.

## Diagramm- und Kartenregeln

- Achsen, Raster, Legenden und Tooltips nutzen die gemeinsame dunkle, semantische Farbwelt.
- Zwei Einheiten erhalten getrennte und sichtbar beschriftete Skalen.
- Richtungspfeile, Vorzeichen, Legendentext und Linienmuster ergänzen Farbe als Bedeutungsträger.
- Mobile Ansichten reduzieren Beschriftungen und ersetzen überbreite Vergleichstabellen durch Karten.
- Fehlende Sensorreihen werden ausgelassen; es werden keine Werte ergänzt oder geschätzt.
- `TrackMap` verwendet die bestehende Track-/Geografielogik, kooperative Gesten, tastaturbedienbare MapLibre-Steuerungen und eine zugängliche Regionsbezeichnung.
- Start, Ziel, aktiver Punkt und Auswahl bleiben unterscheidbar. Im Minimal-Modus werden Kilometermarker bei langen Strecken auf 2- beziehungsweise 5-km-Schritte reduziert.
- Ohne GPS erscheint ein ruhiger Fallback. Karten blockieren mobil nicht den Seitenfluss.
- Visuelle Referenzen maskieren ausschließlich den extern geladenen MapLibre-Karten-Canvas; die unmaskierte Karte wird separat im Browser geprüft.

## Barrierefreiheit

- Jede Seite besitzt genau eine semantische `h1`; Abschnitte folgen einer nachvollziehbaren Überschriftenhierarchie.
- Icon-Buttons, Karten, Diagrammgruppen, Navigation und Live-Status besitzen zugängliche Namen.
- Fokus ist global sichtbar. Aktivierungs-, Bearbeitungs- und Löschdialoge setzen den Erstfokus bewusst und MUI gibt ihn nach dem Schließen an den Auslöser zurück.
- Dialoge besitzen Titel und Beschreibungen, reagieren auf Escape und sperren Fokus nur während ihrer modalen Laufzeit.
- Formularfehler stehen im Feld- beziehungsweise Formularzusammenhang; API-Erfolg und -Fehler werden nicht nur farblich vermittelt.
- Chat unterstützt Enter zum Senden, Umschalt+Enter für Zeilenumbrüche, sinnvolles Scroll-Follow und einen dauerhaft erreichbaren Composer mit Safe-Area-Abstand.
- Status, Trends und Vergleiche verwenden Text, Symbole oder Muster zusätzlich zu Farbe.

## Testdaten und automatisierte Abnahme

Die Playwright-Konfiguration startet eine isolierte SQLite-Datenbank und die echte FastAPI-Anwendung. `web/e2e/global-setup.ts` legt über die echten APIs an:

- ein Administratorkonto und ein leeres Nicht-Admin-Konto
- zwölf deterministische TCX-Aktivitäten ab dem festen Datum 14. Juli 2026
- GPS- und Indoor-Aktivitäten, vorhandene und fehlende Sensorwerte, lange deutsche Titel, mehrere Sportarten und Vorperioden
- realistische Trackpunktabstände unter der Parsergrenze von 120 Sekunden
- einen echten MCP-Client

Frontenddaten werden für visuelle Referenzen nicht gemockt. Wetter und Reverse Geocoding sind im Test explizit deaktiviert, damit die dokumentierten Fallbacks deterministisch bleiben.

Wichtige Befehle:

```bash
cd backend && .venv/bin/python -m pytest -q
cd web && npm test
cd web && npm run build
cd web && npm run test:e2e
cd web && npm run test:visual:update
```

Die E2E-Suite prüft unter anderem Moduspersistenz, Reload, neuen Browserkontext, Classic-Farbpräferenz, direkte URLs, alle Produktseiten, GPS-/Ohne-GPS-Details, URL-Filter, Bearbeiten, Löschen, Chat, MCP-Erstellung, Profil-Speichern, Nicht-Admin-Zugriff, Dialogfokus, Drawer/Escape und horizontalen Overflow bei 320 px.

## Viewports und Screenshots

Automatisiert und visuell geprüft werden:

- Desktop: 1440 × 1000
- Tablet: 834 × 1112
- Mobile: 390 × 844
- Overflow-Grenzfall: 320 × 760 beziehungsweise 320 px Breite

Versionierte Referenzen liegen unter `web/e2e/minimal-ui.spec.ts-snapshots/`. Der Satz enthält 46 PNGs: Classic-Dashboard in drei Viewports, 14 Minimal-Seiten in Desktop/Tablet/Mobile sowie den mobilen Beta-Dialog. Enthalten sind Dashboard, Liste, Detail mit GPS, Analyse, Detail ohne GPS, Entwicklung, Statistiken, Vergleich, Rekorde, Meilensteine, Chat, Profil, MCP und unbekannte Route.

## Bekannte Einschränkungen und Folgearbeit

- Minimal bleibt absichtlich Dark-only.
- Kartenkacheln benötigen den bestehenden externen OpenFreeMap-Stil. Bei dessen Ausfall bleiben Trackdaten und Fallback erhalten.
- Die Rekord-API liefert keinen historischen vorherigen Bestwert; die UI erfindet deshalb keinen.
- Listenvorschauen können pro Seite bis zu zwölf bereits gecachte Track-Abfragen auslösen.
- Verfügbarkeit und Qualität von Chat-Antworten hängen weiterhin vom konfigurierten bestehenden Provider ab; der lokale Fallback bleibt erhalten.
- Android und externe APIs außerhalb des vorhandenen Statistik-Sportartfilters wurden nicht verändert.

## Rückbau und möglicher Standardpfad

Für einen Rückbau werden die Minimal-Routen, Minimal-Shell, das Minimal-Theme und die Modusauswahl entfernt. `ui_mode` kann zunächst kompatibel im Profil verbleiben und später mit einer eigenen Migration entfallen. Classic benötigt dafür keinen visuellen Umbau.

Für Minimal als künftigen Standard wird zuerst der Serverstandard bewusst auf `minimal` geändert und die Behandlung bestehender Konten festgelegt. Danach kann die Beta-Kennzeichnung entfallen. Classic sollte erst in einer eigenen, angekündigten Produktentscheidung entfernt werden; bis dahin bleiben Classic-Komponenten, gespeicherte Farbpräferenz und der Rückwechsel vollständig erhalten.
