# Prueba CORS y CSRF

## Casos requeridos

| Caso | Solicitud | Resultado esperado |
|---|---|---|
| Origen permitido | `Origin: http://localhost:5173` | `Access-Control-Allow-Origin` coincide con el origen |
| Origen ajeno | `Origin: http://evil.localhost:6666` | HTTP 403 y sin autorización CORS |
| Preflight no permitido | `OPTIONS` con método fuera de la lista | Rechazado |
| Mutación sin token | POST/PUT/PATCH/DELETE con Origin permitido y sin `X-CSRF-Token` | HTTP 403 |
| Origin ajeno | Mutación con Origin no permitido | HTTP 403 |

La lista se configura con `CORS_ORIGINS`, separada por comas. No se usa `*`.

## Resultado real

Ejecutado con `npm run security:cors` el 2026-11-23:

```json
{
  "allowedOrigin": { "status": 200, "allowOrigin": "http://localhost:5173" },
  "rejectedOrigin": { "status": 403, "allowOrigin": null },
  "disallowedPreflight": { "status": 405, "allowOrigin": null, "allowMethods": null }
}
```
