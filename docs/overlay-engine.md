# Baseline Cycling Share-Overlay-Engine

Die Share-Engine erzeugt eigenständige PNG-Grafiken für Aktivitäten, persönliche Rekorde und periodische Rückblicke. Web und Android verwenden denselben fachlichen Vertrag, rendern aber jeweils nativ. Dadurch entspricht die Vorschau dem späteren Export und beide Clients bleiben ohne serverseitigen Bilddienst nutzbar.

## Vertrag

Vier Formate sind verbindlich: 1:1 mit 1080 × 1080, 4:5 mit 1080 × 1350, 9:16 mit 1080 × 1920 und 16:9 mit 1920 × 1080 Pixeln. Die Vorlagen-IDs sind `classic`, `minimal`, `photo`, `stats`, `map` und `achievement`. Android verwendet die entsprechenden Enum-Werte.

Ein `ShareContent` enthält entweder eine Aktivität samt Track und optionalem Rekord, oder einen Zeitraum samt aggregierten Statistiken. `OverlayConfig` beschreibt ausschließlich Nutzereinstellungen: Vorlage, Format, Theme, Hintergrund, Foto, Bildfokus, Kennzahlen und sichtbare optionale Inhalte. Datenformatierung, Layout und PNG-Ausgabe sind davon getrennt.

## Rendering

Im Web registriert jede Vorlage eine eigene React-Layoutfunktion. `OverlayCanvas` setzt Hintergrund und Ressourcen zusammen; nur der PNG-Adapter kennt `html-to-image`. Die Vorschau skaliert denselben Canvas, der exportiert wird.

Android registriert pro Vorlage eine Canvas-Layoutfunktion. `OverlayRenderer` zeichnet in der exakten Zielauflösung; die Compose-Oberfläche verwendet eine verkleinerte Ausgabe als Live-Vorschau. Der Export läuft außerhalb des UI-Threads und wird anschließend über das System-Share-Sheet geteilt.

Karten werden mit MapLibre und OpenFreeMap erzeugt. Die Route wird in Baseline Cycling-Farben mit kontrastierender Unterlinie dargestellt und seitenverhältnisgerecht eingepasst. Wenn Kartenkacheln nicht innerhalb von acht Sekunden verfügbar sind, bleibt eine eigene Route-only-Darstellung exportierbar. Exporte mit Basiskarte enthalten die erforderliche Quellenangabe. Fotos werden ausschließlich authentifiziert aus der Aktivitätsgalerie geladen; temporäre URLs und Bitmaps werden nicht dauerhaft gespeichert.

## Neue Vorlage ergänzen

1. Eine neue ID in den gemeinsamen Vorlagenvertrag aufnehmen.
2. Metadaten und Standardwerte in der jeweiligen Registry ergänzen.
3. Eine neue Layoutfunktion aus vorhandenen Primitiven wie Titel, Kennzahlraster, Route und Branding implementieren.
4. Die Vertrags- und Layouttests um die neue Vorlage erweitern.

Die PNG-Adapter, Datenmodelle und bestehenden Vorlagen dürfen dafür nicht verändert werden. Neue Kennzahlen werden analog im Datenadapter formatiert und anschließend nur über ihre ID ausgewählt.

## Fehler- und Leerzustände

- Ohne GPS wird die Kartenwahl deaktiviert und die Route als Indoor-Zustand dargestellt.
- Ohne Galeriefoto ist der Fotohintergrund deaktiviert; die Photo-Vorlage fällt auf eine Baseline Cycling-Farbe zurück.
- Nicht vorhandene Herzfrequenz-, Leistungs-, Trittfrequenz- oder Wetterwerte werden nicht in das PNG übernommen.
- Bis zu sechs Kennzahlen werden automatisch umgebrochen. Lange Titel werden verkleinert, mehrzeilig gesetzt und erst als letzte Absicherung mit Auslassungszeichen begrenzt.
