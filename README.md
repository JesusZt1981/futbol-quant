# Fútbol Quant v1

Motor cuantitativo para **fútbol**, orientado a cuatro ligas núcleo:

- 🇲🇽 Liga MX
- 🇪🇸 LaLiga
- 🇮🇹 Serie A
- 🏴 Premier League

También acepta equipos de ligas auxiliares cuando aparecen en Progol, torneos internacionales o cruces contra los equipos núcleo.

## Qué incluye esta versión

### 1) Motor probabilístico
- Distribución de goles Poisson (base auditable).
- 1X2, Over/Under 2.5 y BTTS.
- Cuotas justas (fair odds).
- Ajustes contextuales conservadores sobre xG: descanso, lesiones, viaje, fuerza del XI, etc.
- Módulo Elo separado para incorporar fuerza relativa.

> Próxima fase técnica: Dixon-Coles calibrado por liga, xG rolling ajustado por fuerza del rival, ensemble Elo + DC + ML y calibración isotónica/Platt fuera de muestra.

### 2) Mercado y riesgo
- Probabilidad implícita.
- Eliminación del vigorish 1X2.
- Edge y valor esperado.
- Kelly fraccionado (¼ Kelly por defecto).
- Tope duro de stake de 2% del bankroll por defecto.
- Penalización por calidad de datos y confianza de alineación.
- Decisión explícita **NO APOSTAR** cuando no existe ventaja suficiente.

### 3) Progol Media Semana
- 9 partidos.
- Probabilidad modelo L/E/V.
- Porcentajes públicos L/E/V.
- Ratio de valor `probabilidad_modelo / popularidad_publica`.
- Recomendación sencilla/doble/triple por cobertura.
- Optimizador de presupuesto por líneas de $15 (configurable).
- Estrategias: conservadora, balanceada y contrarian.
- Diversificación de líneas para evitar gastar el presupuesto en combinaciones casi idénticas.

**Importante:** el ejemplo Progol incluido usa probabilidades sintéticas solo para probar la interfaz y el algoritmo. Está rotulado como DEMO y no debe usarse para apostar.

### 4) Laboratorio / backtesting
- Brier Score.
- Log Loss.
- ROI.
- Hit rate.
- Calibración por buckets.
- Función CLV en el motor.
- Esquema de base de datos preparado para congelar predicciones antes del partido.

### 5) Datos
Adaptadores de backend para:
- API-Football / API-Sports: fixtures, estadísticas, jugadores, alineaciones, lesiones, odds y predicciones.
- The Odds API: mercados multi-bookmaker.
- Supabase: persistencia en producción.

La app funciona sin claves en modo demo; al configurar claves puede comenzar a traer datos reales.

---

## Ejecutar localmente

Requiere Node.js 20+.

```bash
cp .env.example .env
npm install
npm test
npm start
```

Abrir:

```text
http://localhost:3000
```

## Configurar datos reales

En `.env`:

```env
API_FOOTBALL_KEY=tu_clave
ODDS_API_KEY=tu_clave
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role
```

Ejecutar `sql/001_schema.sql` en Supabase SQL Editor.

**Nunca** poner `SUPABASE_SERVICE_ROLE_KEY` en `public/app.js` ni en HTML. Solo backend.

## Deploy en Render

1. Subir esta carpeta a un repositorio GitHub.
2. Crear Web Service en Render o usar `render.yaml`.
3. Build: `npm install`.
4. Start: `npm start`.
5. Agregar variables de entorno en Render.
6. Health check: `/api/health`.

## Endpoints principales

```text
GET  /api/health
GET  /api/providers/status
GET  /api/demo/progol
POST /api/model/poisson
POST /api/market/no-vig
POST /api/risk/stake
POST /api/risk/match
POST /api/progol/optimize
POST /api/metrics/backtest
GET  /api/football/fixtures
GET  /api/football/fixture/:id/bundle
GET  /api/odds/sports
GET  /api/odds/:sportKey
POST /api/snapshots
GET  /api/snapshots
```

## Fuentes / documentación consultada

- API-Football: https://www.api-football.com/
- API-Football guide 2026: https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide
- The Odds API markets: https://the-odds-api.com/sports-odds-data/betting-markets.html
- Lotería Nacional Progol Media Semana: https://www.loterianacional.gob.mx/ProgolMediaSemana/Quiniela
- Momios/porcentajes Progol: https://www.loterianacional.gob.mx/ProgolMediaSemana/Momios

## Principio de validación

La versión no se debe considerar apta para dinero real hasta que cumpla, como mínimo:

- 1,000+ predicciones **fuera de muestra**.
- Calibración estable por liga y mercado.
- Brier/Log Loss mejores que baselines definidos.
- CLV consistentemente positivo.
- ROI positivo neto de vig en una muestra suficiente.
- Drawdown compatible con el bankroll.
- Backtest walk-forward, sin data leakage.

No existe un modelo “perfecto” ni una apuesta segura. El objetivo del proyecto es medir si existe una ventaja estadística repetible y limitar exposición cuando no existe.

## Vista local y estilos

La V1.1 usa rutas relativas para `styles.css` y `app.js`, por lo que el diseño sí se muestra si abres `public/index.html` directamente. Sin embargo, el motor, APIs y cálculos del backend requieren ejecutar `npm install` y `npm start`, y abrir `http://localhost:3000`.
