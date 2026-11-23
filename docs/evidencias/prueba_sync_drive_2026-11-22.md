# Evidencia de prueba real de sincronización con Drive

Fecha declarada: 2026-11-22. Las capturas recibidas están en [`capturas/drive/`](capturas/drive/).

## Casos probados

| Caso | Resultado observado | Evidencia |
|---|---|---|
| Editar POL-05 | `updated`; se agregó la frase del comprobante de pago | [01_pol05_editado.png](capturas/drive/01_pol05_editado.png) |
| Renombrar POL-08 a `(v2)` | `renamed` | [02_pol08_renombrado.png](capturas/drive/02_pol08_renombrado.png) |
| Sacar AVI-RH-10 de la carpeta | `archived` | [03_pol10_fuera.png](capturas/drive/03_pol10_fuera.png) |
| Devolver AVI-RH-10 | `reopened` esperado, sin captura adjunta | Pendientes: [08_pol10_reabierto.png](capturas/drive/08_pol10_reabierto.png), [09_chat_pol10_vuelve.png](capturas/drive/09_chat_pol10_vuelve.png) |

## Capturas recibidas

- [05_chat_pol05.png](capturas/drive/05_chat_pol05.png): chat con citas de POL-RH-05.
- [06_chat_sin_pol10.png](capturas/drive/06_chat_sin_pol10.png) y [06b_politicas_sin_pol10.png](capturas/drive/06b_politicas_sin_pol10.png): ausencia de AVI-RH-10.
- [07_documentos_rrhh.png](capturas/drive/07_documentos_rrhh.png): página Documentos.

No se recibieron capturas identificables para `00_sync_inicial.png` ni `04_sync_cambios.png`, tampoco para `08_pol10_reabierto.png` ni `09_chat_pol10_vuelve.png`. No se inventaron.

## Corridas y hallazgo

La consulta SELECT a `public.document_sync_runs` no pudo ejecutarse con la conexión disponible: el rol de la aplicación recibió `permission denied for table document_sync_runs`. No se modificaron datos de Supabase.

La corrida reproducida de `npm run sync:drive` mostró:

```text
Sincronización incremental (0 cambios en Drive)
Sin cambios en la carpeta.
startPageToken actualizado.
```

Drive no reportó el regreso del archivo en `changes.list`. La corrección quedó en `ca11b40`, con reconciliación recursiva de presencia y `npm run sync:drive -- --full`.

## Estado de los tres documentos

La consulta SELECT a `policy_documents` también fue bloqueada por permisos del rol disponible. La captura [07_documentos_rrhh.png](capturas/drive/07_documentos_rrhh.png) confirma visualmente POL-RH-05 publicado, POL-RH-08 renombrado a `(v2)` y ausencia de AVI-RH-10 en ese momento. El estado final de AVI-RH-10 queda pendiente de una consulta con identidad RRHH autorizada.

## PDF

Se reemplazó `docs/Informe_tecnico_Portal_RRHH.pdf`. La verificación con `pdfjs-dist` reporta **11 páginas**, no 12; `pdfinfo` no está instalado. Queda pendiente recibir/exportar la versión de 12 páginas.
