# Paquete de evidencia — 2026-11-22

Generado por backend/scripts/collect-evidence.mjs. Solo contiene lecturas y omite IDs de Drive, correos, claves y tokens.

## Drive

Estado: ok

| Nombre | Tipo | Legible |
|---|---|---|
| CAL-05_Calendario_de_feriados_y_pagos_2026 | Google Sheets | sí |
| POL-01_Politica_de_vacaciones | Google Doc | sí |
| POL-02_Politica_de_permisos_y_licencias | Google Doc | sí |
| POL-03_Procedimiento_de_incapacidades.pdf | PDF | sí |
| POL-04_Reglamento_de_jornada_y_teletrabajo | Google Doc | sí |
| POL-05_Politica_salarial_y_calendario_de_pagos | Google Doc | sí |
| POL-06_Catalogo_de_beneficios | Google Doc | sí |
| POL-07_Manual_de_onboarding_y_procedimiento_de_salida.pdf | PDF | sí |
| POL-08_Politica_de_evaluacion_del_desempeno | Google Doc | sí |
| POL-09_Codigo_de_conducta_y_protocolo_de_denuncias.pdf | PDF | sí |
| POL-10_Aviso_de_privacidad_para_colaboradores | Google Doc | sí |

Total observado: 11; legibles: 11.

## Dominio del enunciado → documento

| Dominio | Código | Título | Formato/fuente | Versión | Vigencia | Published | Enlace |
|---|---|---|---|---|---|---|---|
| Vacaciones y feriados | POL-RH-01 | Política de Vacaciones | Drive / catálogo | 1.0 | 2026-01-01 | sí | enlace presente |
| Permisos | POL-RH-02 | Política de Permisos y Licencias | Drive / catálogo | 1.0 | 2026-01-01 | sí | enlace presente |
| Incapacidades | PRO-RH-03 | Procedimiento de Incapacidades | Drive / catálogo | 1.0 | 2026-01-01 | sí | enlace presente |
| Jornada y teletrabajo | REG-RH-04 | Reglamento de Jornada, Asistencia y Teletrabajo | Drive / catálogo | 1.0 | 2026-01-01 | sí | enlace presente |
| Remuneración | POL-RH-05 | Política Salarial y Calendario de Pagos | Drive / catálogo | 1.0 | 2026-01-01 | sí | enlace presente |
| Beneficios | CAT-RH-06 | Catálogo de Beneficios | Drive / catálogo | 1.0 | 2026-01-01 | sí | enlace presente |
| Ingreso y salida | MAN-RH-07 | Manual de Onboarding y Procedimiento de Salida | Drive / catálogo | 1.0 | 2026-01-01 | sí | enlace presente |
| Desempeño | POL-RH-08 | Política de Evaluación del Desempeño | Drive / catálogo | 1.0 | 2026-01-01 | sí | enlace presente |
| Conducta | COD-RH-09 | Código de Conducta y Protocolo de Denuncias | Drive / catálogo | 1.0 | 2026-01-01 | sí | enlace presente |
| Privacidad | AVI-RH-10 | Aviso de Privacidad para Colaboradores | Drive / catálogo | 1.0 | 2026-01-01 | sí | enlace presente |

## Movimientos y colaboradores

| Mínimo | Máximo | Total movimientos | Meses distintos | Colaboradores seed + A/B |
|---|---|---:|---:|---:|
| 2026-08-21 | 2026-11-20 | 8 | 4 | 56 |

## chat_query_logs

| prompt_version | Clasificación | Total |
|---|---|---:|
| demo-seed | sintéticas | 315 |
| orq@1.0.0 | reales/otra fuente | 73 |
| orq@1.0.0+data@1.0.0 | reales/otra fuente | 24 |
| orq@1.1.0 | reales/otra fuente | 228 |
| orq@1.1.0+data@1.0.0 | reales/otra fuente | 77 |

## Tareas programadas

Get-ScheduledTask -TaskName RRHH-RAG*:

~~~text
[{"TaskName":"RRHH-RAG report-daily","State":3,"LastRunTime":null,"NextRunTime":null},{"TaskName":"RRHH-RAG sync-drive","State":3,"LastRunTime":null,"NextRunTime":null}]
~~~

## Último document_sync_runs

Estado: completed; inicio: Sun Nov 22 2026 16:38:12 GMT-0600 (hora estándar central); fin: Sun Nov 22 2026 16:38:14 GMT-0600 (hora estándar central); resultado: —

## Última hoja de evaluación oficial

Archivo: hoja_evaluacion_45_2026-11-22.md
| Aciertos | 46/46 (100.0 %) |
| Con cita (respuestas respaldadas por documentos) | 28/28 (100.0 %) |
| Latencia < 8 s | 46/46 (100.0 %) |
| Latencia p50 / p90 | 3522 ms / 5037 ms |
"Con cita" se calcula sobre las respuestas respaldadas por documentos, es decir, las del agente de políticas con estado `supported` o `partial`. Se excluyen:

## Limitaciones de esta corrida

- Lectura SQL completada.
- Las credenciales y los identificadores sensibles se omiten deliberadamente.
