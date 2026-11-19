# Decisión de arquitectura: DeepSeek como LLM y embeddings E5 locales

- Fecha: 2026-11-19
- Estado: aceptada (la validación con DeepSeek real queda pendiente de una clave válida)
- Alcance: backend del portal de RRHH con RAG multiagente (Mini Proyecto #2)

## Contexto

El profesor entregó al equipo una clave de DeepSeek para el proyecto y se decidió no usar Gemini. DeepSeek
ofrece un LLM con API compatible con OpenAI, pero no ofrece un API de embeddings. El RAG ya tenía la columna
`document_chunk_embeddings.embedding vector(768)` y el RPC `match_policy_chunks` con un umbral de similitud
coseno, ambos aplicados en Supabase de pruebas.

## Decisión

| Función | Proveedor | Detalle |
|---|---|---|
| LLM: clasificador del orquestador, selección de herramienta del agente de datos, redacción del agente de políticas | DeepSeek (`deepseek-flash`) | `https://api.deepseek.com/chat/completions`, temperatura 0, JSON Output (`response_format: json_object`) |
| Embeddings | Modelo abierto local `Xenova/multilingual-e5-base` con `@huggingface/transformers` | 768 dimensiones, prefijos E5 `query: ` / `passage: `, mean pooling y normalización L2 |

- Selección por entorno: `LLM_PROVIDER=deepseek|gemini` y `EMBEDDINGS_PROVIDER=local|gemini` (`src/llm/providers.js`).
  Gemini se conserva como opción, pero no se usa.
- No hay cambio de esquema: E5-base produce 768 dimensiones, igual que `vector(768)`. Al momento del cambio no había
  embeddings guardados, así que no hubo que regenerar nada.
- Umbral de similitud configurable con `RAG_SIMILARITY_THRESHOLD`, valor inicial **0.82** (ver Limitaciones).

Documentación consultada (2026-11-19): https://api-docs.deepseek.com/ y https://api-docs.deepseek.com/guides/json_mode.
Modelo vigente `deepseek-flash` (los nombres `deepseek-v4-flash` aparecen como heredados).

## Por qué

- **DeepSeek:** es el proveedor asignado por el curso; su API es compatible con OpenAI, por lo que se integra con
  `fetch` sin dependencias nuevas, y soporta salida JSON para el clasificador y el selector de herramientas.
- **E5 local:** es gratuito, multilingüe (funciona bien en español), no envía los documentos de RRHH a un tercero para
  vectorizarlos y conserva las 768 dimensiones del esquema. Mide bien la cercanía semántica:

  | Prueba de humo real (`npm run smoke:providers`) | Resultado |
  |---|---|
  | Dimensiones | 768 |
  | Norma del vector | 1.0000 |
  | sim("vacaciones anuales", "días de descanso pagados") | 0.9111 |
  | sim("vacaciones anuales", "horas extra") | 0.8882 |
  | Embedding de una pregunta tras la precarga | 142 ms |
  | Primera carga (descarga del modelo, una sola vez) | ≈ 140 s; luego queda en caché |

## Cumplimiento del enunciado

| Requisito | Cómo se cumple |
|---|---|
| Ninguna clave en el código | `DEEPSEEK_API_KEY` solo en `backend/.env` (ignorado por git); `.env.example` sin valores; los errores del proveedor nunca incluyen la clave (prueba unitaria). |
| Citas que salen de los fragmentos, nunca del modelo | Sin cambios: el agente de políticas arma las citas desde las filas de `match_policy_chunks`. |
| Cifras que salen de SQL; el LLM solo elige o redacta | Sin cambios: el agente de datos usa funciones SQL en la base y plantillas; DeepSeek solo elige la herramienta. |
| Si la similitud es baja, decir que no se encontró y ofrecer escalar | El umbral se aplica en el RPC; sin fragmentos, el agente responde "no encontré la política" y ofrece escalar. |
| Respuesta en menos de 8 s en el 90 % | Embedding local ≈ 0,15 s tras la precarga (se precarga al iniciar el servidor). Plazos: DeepSeek 6 s por llamada con reintentos dentro de ese plazo; el clasificador corta a 3,5 s y usa su respaldo seguro. Se medirá con `npm run eval:bank`. |
| Seguridad ante consultas sobre otra persona | Sin cambios: la capa determinista niega antes de llamar al LLM; el JSON del LLM se valida y, si falla, se usa el respaldo (nunca "policy" para algo sospechoso). |

## Limitaciones y riesgos

1. **Umbral de similitud:** E5 puntúa alto incluso entre textos poco relacionados (0.888 entre "vacaciones anuales" y
   "horas extra"). El umbral inicial 0.82 es una estimación; debe calibrarse en la sesión 4 con los 10 documentos y el
   banco de preguntas (ver la tasa de "no encontré la política" frente a respuestas con cita).
2. **JSON sin esquema estricto:** DeepSeek garantiza JSON válido, no que cumpla un esquema. El esquema se describe en el
   prompt y la salida se valida en el backend (`parseClassification`, `parseToolSelection`) con respaldo determinista.
   La API puede devolver contenido vacío: el proveedor reintenta una vez.
3. **Privacidad:** las preguntas de los colaboradores y los fragmentos recuperados se envían a DeepSeek (proveedor
   externo). Los datos personales que calcula el agente de datos no se envían al LLM: se redactan con plantillas.
4. **Recursos del servidor:** el modelo E5 ocupa varios cientos de MB en disco y memoria, y la primera descarga tarda
   minutos. La inferencia corre en CPU; con mucha concurrencia podría sumar latencia.
5. **Disponibilidad:** el chat depende de la API de DeepSeek; ante errores o tiempos agotados el clasificador y el
   selector usan su respaldo determinista y el agente de políticas responde que la evidencia no está disponible.
6. **Calidad del modelo:** la precisión del clasificador con DeepSeek debe medirse con `npm run eval:bank` (25
   preguntas) y luego con el banco de 45.

## Estado de la validación (2026-11-19)

- Embeddings E5 locales: validados con la prueba de humo real.
- DeepSeek: el código está probado con pruebas unitarias (reintentos 429/5xx, contenido vacío, plazos, la clave no
  aparece en errores), pero la clave actual responde **HTTP 401 "Authentication Fails"** en `api.deepseek.com`.
  Pendiente: clave válida, prueba de humo del LLM y `npm run eval:bank`.
