# Fútbol Quant — control de versiones

## V01 — punto de retorno
- Rama: `stable-v01`
- Commit: `dfe1fb13880a30a3a3fa6f3f575980ea74c9e7ab`
- Uso: punto de retorno del acceso directo a Supabase antes de los cambios de Edge Functions.

## V02 — intento con Edge Functions
- Estado: descartado para la base histórica.
- Motivo: `/api/data/summary` seguía devolviendo error y el bootstrap registraba fallo.

## V03 — versión actual
- Rama: `main`
- Conserva las mejoras visuales y funcionales recientes.
- Restaura `src/store/index.js` desde la versión que usaba acceso directo a Supabase.
- La interfaz muestra `V03` en la barra lateral.

## Regla de despliegue
Una versión no se considera válida para pronósticos si `/api/data/summary` falla o la pantalla Base de datos no muestra registros reales. Si V03 no supera esa prueba, se vuelve a `stable-v01` y se reconstruye desde ese punto.
