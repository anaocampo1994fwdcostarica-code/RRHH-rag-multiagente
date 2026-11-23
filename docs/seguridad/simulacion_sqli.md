# Simulación de inyección SQL

El laboratorio queda pendiente de confirmación antes de aplicar su migración. Debe ejecutarse únicamente con `SECURITY_LAB=1`, `NODE_ENV != production` y escucha local.

## Cargas no destructivas

1. `persona@example.test`
2. `' OR '1'='1`
3. `' UNION SELECT email, secret_note FROM security_lab.lab_employees --`

## Resultado esperado

| Endpoint | Correo válido | Carga OR | Carga UNION |
|---|---|---|---|
| Vulnerable de laboratorio | Coincidencia | Todas las filas | Puede revelar `secret_note` |
| Seguro de laboratorio | Coincidencia | 0 filas o 400 | 0 filas o 400 |
| Endpoints reales | Respuesta normal | 400/0 filas | 400/0 filas |

No ejecutar cargas con `DROP`, `DELETE`, `UPDATE` o `INSERT`.

## Capturas

_Espacio reservado para anexar las evidencias de la ejecución aprobada._

## Ejecución realizada

Migración aplicada en el proyecto de pruebas `bxtetlzjlgoezxcjhdrw` el 2026-11-23. El script `npm run security:sqli` confirmó:

- El endpoint vulnerable devolvió una fila válida, todas las filas con `' OR '1'='1` y las columnas `secret_note` con la carga `UNION SELECT`.
- El endpoint seguro devolvió la fila válida y respondió `400 Invalid email` para las cargas de inyección.
- Los endpoints reales (`/chat`, `/leave-requests`, `/reports/daily`) rechazaron las cargas sin un JWT con `401 Unauthorized`; no se ejecutó ninguna escritura.

La salida completa queda en `docs/seguridad/evidencias/sqli-results.json`.
