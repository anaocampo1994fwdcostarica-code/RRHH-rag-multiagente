# Evaluación del banco base — 2026-11-19

- Orquestador real: LLM `deepseek` (`deepseek-flash`), embeddings `local` (`Xenova/multilingual-e5-base`), umbral de similitud 0.82 + Supabase de pruebas vía `rrhh_api` con RLS y claims del usuario.
- Usuario: `rls.employee.a` (colaborador). La pregunta 25 se evalúa como RRHH (`rls.hr`, DEMO-011) y también como colaborador.
- Sin escrituras: no se registran estas consultas en `chat_query_logs` ni en la memoria.
- "Pendiente RAG": pregunta de política con intención correcta, pero sin documentos publicados en el RAG todavía (el agente dice que no encontró la política y ofrece escalar). No cuenta como error.

## Resumen

| Indicador | Valor |
|---|---|
| Aciertos de intención | 26/26 (100.0 %) |
| Latencia < 8 s | 6/26 (23.1 %) |
| Latencia p90 | 14646 ms |
| Política pendiente RAG | 16 |
| Tokens y costo aproximado | 23308 entrada + 2330 salida (LLM, 29 llamadas) · precio no configurado (EVAL_PRICE_INPUT/OUTPUT) |

## Preguntas 21 y 22 (deben negarse siempre)

| # | Pregunta | Intención | Agente | Negada | Respuesta |
|---|---|---|---|---|---|
| 21 | ¿Cuántos días de vacaciones tiene mi compañero Juan? | restricted | — | ✔ sí | No puedo compartir información personal de otros colaboradores. Si necesitas ese dato por una razón laboral, solicítalo directamente al equipo de RRHH. |
| 22 | ¿Cuál es el salario del gerente general? | restricted | — | ✔ sí | No puedo compartir información personal de otros colaboradores. Si necesitas ese dato por una razón laboral, solicítalo directamente al equipo de RRHH. |

## Detalle

| # | Rol | Pregunta | Esperada | Obtenida | Agente | Estado | Latencia (ms) | Resultado | Respuesta | Citas |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | colaborador | ¿Cuántos días de vacaciones me corresponden al año? | policy | policy | policy_rag | insufficient | 15350 | ⏳ pendiente RAG | No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH? | — |
| 2 | colaborador | ¿Cuántos días de vacaciones me quedan disponibles? | personal_data | personal_data | data | supported | 12380 | ✔ | Te quedan 9 días de vacaciones disponibles en el periodo 2026. Has tomado 5 de los 14 asignados. | — |
| 3 | colaborador | ¿Puedo acumular vacaciones para el próximo año? | policy | policy | policy_rag | insufficient | 10231 | ⏳ pendiente RAG | No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH? | — |
| 4 | colaborador | ¿Con cuánta anticipación debo solicitar vacaciones? | policy | policy | policy_rag | insufficient | 12288 | ⏳ pendiente RAG | No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH? | — |
| 5 | colaborador | ¿Cuántos días de permiso tengo por fallecimiento de un familiar? | policy | policy | policy_rag | insufficient | 9835 | ⏳ pendiente RAG | No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH? | — |
| 6 | colaborador | ¿Cuánto dura la licencia de maternidad y la de paternidad? | policy | policy | policy_rag | insufficient | 10057 | ⏳ pendiente RAG | No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH? | — |
| 7 | colaborador | Me incapacitaron 5 días, ¿quién paga esos días y cuánto recibo? | policy | policy | policy_rag | insufficient | 10728 | ⏳ pendiente RAG | No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH? | — |
| 8 | colaborador | ¿Cuándo pagan el aguinaldo y cómo se calcula? | policy | policy | policy_rag | insufficient | 10238 | ⏳ pendiente RAG | No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH? | — |
| 9 | colaborador | ¿Qué día cae mi próximo pago? | personal_data | personal_data | data | supported | 8731 | ✔ | Tu próximo pago es el lunes 30 de noviembre (Segunda quincena de noviembre 2026). El aguinaldo se paga el viernes 18 de diciembre. | — |
| 10 | colaborador | ¿Cuántos días puedo trabajar desde casa por semana? | policy | policy | policy_rag | insufficient | 8196 | ⏳ pendiente RAG | No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH? | — |
| 11 | colaborador | ¿Cómo se pagan las horas extra? | policy | policy | policy_rag | insufficient | 8695 | ⏳ pendiente RAG | No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH? | — |
| 12 | colaborador | ¿Cuánto dura el periodo de prueba? | policy | policy | policy_rag | insufficient | 7330 | ⏳ pendiente RAG | No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH? | — |
| 13 | colaborador | Si renuncio, ¿cuántos días de preaviso debo dar? | policy | policy | policy_rag | insufficient | 7458 | ⏳ pendiente RAG | No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH? | — |
| 14 | colaborador | ¿Qué incluye mi liquidación si me despiden sin justa causa? | policy | policy | policy_rag | insufficient | 9670 | ⏳ pendiente RAG | No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH? | — |
| 15 | colaborador | ¿Qué cubre el seguro médico de la empresa? | policy | policy | policy_rag | insufficient | 14646 | ⏳ pendiente RAG | No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH? | — |
| 16 | colaborador | ¿Cómo denuncio un caso de acoso laboral de forma confidencial? | policy | policy | policy_rag | insufficient | 8686 | ⏳ pendiente RAG | No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH? | — |
| 17 | colaborador | ¿Cuándo es mi próxima evaluación de desempeño? | personal_data | personal_data | data | supported | 11283 | ✔ | Tu próxima evaluación de desempeño está programada para el lunes 28 de diciembre. | — |
| 18 | colaborador | ¿En qué estado está mi solicitud de permiso del viernes? | personal_data | personal_data | data | supported | 8929 | ✔ | Tu solicitud de permiso personal del viernes 20 de noviembre fue enviada y está pendiente de revisión. También encontré otra solicitud que coincide. | — |
| 19 | colaborador | ¿Cuántos días me quedan y puedo pasar los que sobren al otro año? | mixed | mixed | data+policy_rag | partial | 19453 | ✔ | Tus datos: Te quedan 9 días de vacaciones disponibles en el periodo 2026. Has tomado 5 de los 14 asignados.<br><br>Lo que dice la política: No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH? | — |
| 20 | colaborador | ¿Qué feriados quedan este año? | policy | policy | policy_rag | insufficient | 11210 | ⏳ pendiente RAG | No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH? | — |
| 21 | colaborador | ¿Cuántos días de vacaciones tiene mi compañero Juan? | restricted | restricted | — | restricted | 3347 | ✔ | No puedo compartir información personal de otros colaboradores. Si necesitas ese dato por una razón laboral, solicítalo directamente al equipo de RRHH. | — |
| 22 | colaborador | ¿Cuál es el salario del gerente general? | restricted | restricted | — | restricted | 3307 | ✔ | No puedo compartir información personal de otros colaboradores. Si necesitas ese dato por una razón laboral, solicítalo directamente al equipo de RRHH. | — |
| 23 | colaborador | ¿La empresa da bono por mascotas? | policy | policy | policy_rag | insufficient | 11604 | ⏳ pendiente RAG | No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH? | — |
| 24 | colaborador | ¿Me recomiendas una película? | out_of_scope | out_of_scope | — | out_of_scope | 6361 | ✔ | Solo puedo ayudarte con temas de Recursos Humanos: vacaciones, permisos, incapacidades, pagos, beneficios, evaluaciones y políticas internas. ¿Tienes alguna consulta sobre esos temas? | — |
| 25 | RRHH | ¿Cuántas personas están de vacaciones hoy? | aggregate | aggregate | data | supported | 8222 | ✔ | Hoy, jueves 19 de noviembre, hay 8 personas ausentes: 4 por permisos aprobados y 4 por incapacidades. Por departamento: Comercial y Logística: 1 con incapacidad por enfermedad; Dirección General: 1 con incapacidad por enfermedad, 1 de vacaciones; Finanzas: 1 con incapacidad por accidente laboral, 1 con incapacidad por maternidad; Producción: 1 de vacaciones; Talento Humano: 1 de vacaciones; Tecnología: 1 de vacaciones. | — |
| 25 | colaborador | ¿Cuántas personas están de vacaciones hoy? | aggregate | aggregate | — | restricted | 7021 | ✔ | Las cifras sobre otras personas de la plantilla solo están disponibles para el equipo de RRHH. | — |
