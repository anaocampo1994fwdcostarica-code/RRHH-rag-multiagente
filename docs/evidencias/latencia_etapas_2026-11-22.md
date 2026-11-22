# Latencia por etapa — 2026-11-22

Medido con `node scripts/profile-latency.mjs --runs=3` (orquestador real, `rls.employee.a`, Supabase de pruebas, mediana de 3 corridas). La columna "registro" no bloquea la respuesta.

## Antes (razonamiento de DeepSeek activado, 6 idas a la base por transacción)

| Consulta | permisos | clasificación (LLM) | embedding (E5) | búsqueda vectorial | herramienta de datos (LLM) | consulta de datos (SQL) | redacción (LLM) | registro | Total |
|---|---|---|---|---|---|---|---|---|---|
| política | 1.94 s | 1.35 s | 0.58 s | 2.22 s | — | — | 2.77 s | 0.00 s | **10.40 s** |
| datos | 2.15 s | 1.51 s | — | — | 1.00 s | 1.95 s | — | 0.00 s | **6.49 s** |
| mixta | 2.12 s | 1.31 s | 0.13 s | 2.23 s | 0.91 s | 2.05 s | 3.06 s | 0.00 s | **8.87 s** |

## Después

| Consulta | permisos | clasificación (LLM) | embedding (E5) | búsqueda vectorial | herramienta de datos (LLM) | consulta de datos (SQL) | redacción (LLM) | registro | Total |
|---|---|---|---|---|---|---|---|---|---|
| política | 0.79 s | — (reglas) | 0.30 s | 0.96 s | — | — | 1.26 s | 0.00 s | **3.47 s** |
| datos | 0.72 s | — (reglas) | — | — | 0.93 s | 0.66 s | — | 0.00 s | **2.71 s** |
| mixta | 0.85 s | 1.07 s | 0.03 s | 0.92 s | 0.90 s | 0.84 s | 1.77 s | 0.00 s | **3.72 s** |

Nota: la tabla "después" se midió antes de ajustar las reglas de alta confianza. Con el ajuste, la pregunta de política del perfil ("¿Cuántos días de vacaciones me corresponden al año?") vuelve a pasar por el clasificador LLM, que suma unos 1,1 s.

## Cambios

1. **DeepSeek sin razonamiento.** Según la documentación oficial (api-docs.deepseek.com, *Thinking Mode* y referencia de *chat completions*), el razonamiento está activado por defecto y se desactiva con `thinking: {"type": "disabled"}`. Se envía siempre así, salvo con `DEEPSEEK_THINKING=enabled`.
2. **`max_tokens` por llamada:** clasificador 300, selección de herramienta 200, agente de políticas 700. El reporte diario usa 3000 porque no tiene a nadie esperando.
3. **Una sola ida a la base para preparar la transacción RLS.** `set_config` de los claims, del `sub` y de `role` van en una sentencia (`set_config('role','authenticated',true)` equivale a `SET LOCAL ROLE`). Cada transacción pasó de 6 a 4 viajes. Con unos 0,3 s por viaje, ahorra cerca de 0,6 s por consulta.
4. **Clasificación en paralelo con la verificación de permisos.** Si como colaborador la pregunta ya se niega sin LLM, la clasificación espera el rol real, así que el LLM nunca recibe preguntas sobre terceros de un colaborador.
5. **Reglas de alta confianza.** Sin historial, una pregunta corta de dato propio sin condición, o una de política sin referencias a la persona, no llama al clasificador LLM. Ante cualquier duda decide el LLM.
6. **Guardado sin bloquear la respuesta.** El registro en `chat_query_logs` y los mensajes de la conversación no se esperan. Solo una conversación nueva espera su id, para devolverlo.

## Resultado en la evaluación completa

`npm run eval:bank -- --bank all --log` → `hoja_evaluacion_45_2026-11-22.md`: **46/46 consultas en menos de 8 s (100 %), p90 de 5,2 s**. La meta del enunciado era el 90 %. La evaluación anterior tenía 23 % y p90 de 14,6 s.
