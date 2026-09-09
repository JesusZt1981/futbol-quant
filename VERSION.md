# Fútbol Quant — control de versiones

## V01 — punto de retorno
- Rama: `stable-v01`
- Commit: `dfe1fb13880a30a3a3fa6f3f575980ea74c9e7ab`
- Uso: punto de retorno del acceso directo a Supabase antes de los cambios de Edge Functions.

## V02 — versión actual de prueba
- Rama: `main`
- Objetivo: mantener todas las mejoras recientes, eliminar llamadas CORS directas desde el navegador y estabilizar la lectura de Supabase.
- La interfaz muestra `V02` en la barra lateral para confirmar qué build está cargado.

## Regla de despliegue
No se considera una versión válida para pronósticos si `/api/data/summary` no responde y la pantalla Base de datos no muestra registros reales. Si V02 no cumple esta prueba, volver al punto V01 y reconstruir desde ahí.
