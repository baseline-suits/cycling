# Baseline Cycling Backend

FastAPI-API für Anmeldung, TCX-Import, serverseitige Auswertung, Wetter und Aktivitätszusammenfassungen.

## Lokal starten

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e '.[test]'
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

Für eine einfache lokale SQLite-Instanz kann `AVENTO_DATABASE_URL=sqlite:///./avento.db` und
`AVENTO_AUTO_CREATE_SCHEMA=true` gesetzt werden. In Produktion müssen mindestens eine PostgreSQL-URL,
ein zufälliger `AVENTO_SECRET_KEY` sowie ein `AVENTO_BOOTSTRAP_INVITE_CODE` konfiguriert werden.

Aktivitätsvideos werden als MP4, MOV oder WebM akzeptiert und mit FFmpeg/FFprobe
validiert sowie für die Wiedergabe aufbereitet. Größe, Laufzeit und maximale
Auflösung lassen sich über `AVENTO_MAX_VIDEO_UPLOAD_BYTES`,
`AVENTO_MAX_VIDEO_DURATION_SECONDS` und `AVENTO_MAX_VIDEO_PIXELS` konfigurieren.

## Authentifizierung

Der erste Benutzer wird einmalig über `POST /api/v1/auth/bootstrap` mit `bootstrap_code` angelegt und ist
Administrator. Weitere Benutzer erhalten über `POST /api/v1/auth/invitations` eine Einladung. Access-Tokens
werden als Bearer-Token gesendet; Refresh-Tokens werden bei jeder Erneuerung rotiert.

Administratoren können über `POST /api/v1/auth/password-resets` einen einmaligen Passwort-Reset-Token
ausstellen. Der Token wird nur in dieser Antwort angezeigt und in der Datenbank ausschließlich gehasht
gespeichert. Ein erfolgreicher Reset über `POST /api/v1/auth/password-reset` sowie ein authentifizierter
Passwortwechsel über `POST /api/v1/profile/password` widerrufen alle Refresh-Sitzungen des Benutzers.

Ohne OpenAI-Schlüssel erstellt der Server deterministische lokale Coaching-Zusammenfassungen. Mit
`AVENTO_OPENAI_API_KEY` verwendet er dafür die Responses API und standardmäßig `gpt-5.4-mini`.

Wetter wird über Open-Meteo an mehreren Punkten entlang der Strecke und zur jeweiligen Fahrzeit ermittelt.
Baseline Cycling berechnet daraus Gegen-, Rücken- und Seitenwind relativ zur tatsächlichen Fahrtrichtung. Die Anzahl der
Stichproben lässt sich mit `AVENTO_WEATHER_ROUTE_SAMPLES` zwischen 3 und 12 konfigurieren. Ein nicht erreichbarer
Anbieter verhindert den TCX-Import nicht.

Aktivitäten unterstützen dokumentierte Trinkmengen und mehrere validierte
Fotos mit optionaler Aufnahmezeit, Position und Bildunterschrift. Die
Statistik-API stellt persönliche Distanzrekorde, langfristige Kalendertrends,
robuste Muster und Saison- beziehungsweise Jahresrückblicke bereit. KI-Texte
enthalten zusätzlich eine strukturierte Datengrundlage.

Der Read-only-MCP-Server ist unter `/api/v1/mcp/rpc` erreichbar. Für HTTP-
Clients stellt er OAuth 2.1 mit Authorization Code, PKCE, Dynamic Client
Registration und rotierenden Refresh-Tokens bereit. Die Discovery-Endpunkte
sind `/.well-known/oauth-protected-resource` und
`/.well-known/oauth-authorization-server`. `AVENTO_PUBLIC_URL` muss auf die
öffentliche HTTPS-Adresse zeigen; `AVENTO_MCP_RESOURCE_URI` überschreibt bei
Bedarf die kanonische MCP-Resource-URI.

Der bisherige Admin-verwaltete Client-Credentials-Flow bleibt für die Migration
unter `/api/v1/mcp/token` erhalten. Optional startet `python mcp_server.py`
denselben Router nur auf der lokalen Loopback-Adresse.

Kalenderzeiträume werden in `AVENTO_TIMEZONE` ausgewertet (Standard: `Europe/Berlin`), sodass Fahrten rund um
Mitternacht im richtigen lokalen Tag, in der richtigen Woche und im richtigen Monat landen.

Profilbilder dürfen höchstens 10 MB groß sein. Jedes von Pillow unterstützte Bildformat wird validiert,
automatisch ausgerichtet, quadratisch zugeschnitten und als 512 × 512 Pixel großes WebP gespeichert.

Die interaktive API-Dokumentation ist unter `/docs` verfügbar.
