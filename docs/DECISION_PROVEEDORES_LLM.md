# Decisión de arquitectura: proveedores de LLM y embeddings

- Fecha: 2026-11-19
- Estado: aceptada (OpenAI). La validación real queda pendiente de una clave válida (ver "Estado de la validación").
- Alcance: backend del portal de RRHH con RAG multiagente (Mini Proyecto #2)

## Contexto e historia

1. El diseño inicial usaba Gemini (LLM y embeddings).
2. El curso entregó una clave que se creyó de DeepSeek; se implementó DeepSeek (LLM) + embeddings E5 locales.
   La clave respondía 401 en `api.deepseek.com`.
3. Se comprobó que la clave empieza con `sk-proj-`: es una **clave de proyecto de OpenAI**. Se decidió usar OpenAI
   para chat y embeddings, y conservar DeepSeek, Gemini y E5 local como alternativas configurables.

## Decisión

| Función | Proveedor | Detalle |
|---|---|---|
| LLM: clasificador del orquestador, selección de herramienta del agente de datos, redacción del agente de políticas | OpenAI `gpt-6-luna` (configurable con `OPENAI_MODEL`) | Chat Completions con fetch nativo, `reasoning_effort: none` (menor latencia), Structured Outputs con JSON Schema estricto en `generateJson` |
| Embeddings | OpenAI `text-embedding-3-small` con `dimensions: 768` | Conserva la columna `vector(768)` sin cambios de esquema; vectores normalizados |

- Selección por entorno: `LLM_PROVIDER=openai|deepseek|gemini` y `EMBEDDINGS_PROVIDER=openai|local|gemini`
  (`backend/src/llm/providers.js`). Por defecto, `openai` en ambos.
- Umbral de similitud `RAG_SIMILARITY_THRESHOLD`: si está vacío, toma el valor inicial del proveedor de embeddings
  (**openai 0.45**, local/E5 0.82, gemini 0.7). Se calibra en la sesión 4 con los documentos y el banco de preguntas.
- Plazos y errores: 6 s por llamada con reintentos ante 429/5xx dentro de ese plazo; los errores solo incluyen el
  código HTTP y el código de OpenAI (por ejemplo `invalid_api_key`), nunca la clave.

Documentación oficial consultada el 2026-11-19 (developers.openai.com/api/docs):

- Modelos: la lista ya no muestra modelos "mini"; el modelo recomendado para tareas enfocadas y de alto volumen es
  `gpt-6-luna` (USD 0.1 entrada / 0.5 salida por millón de tokens), con Chat Completions y Structured Outputs.
- Structured Outputs: `response_format: { type: "json_schema", … }` con `strict`; las negativas llegan en `refusal`.
  El backend convierte los esquemas al modo estricto (`toStrictSchema`: `additionalProperties: false`, todas las
  propiedades requeridas y las opcionales como `null`) y trata una negativa como error para usar el respaldo.
- Embeddings: `text-embedding-3-small` sigue vigente; el parámetro `dimensions` permite acortar el vector (1536 por
  defecto) y la guía recomienda fijarlo al crear el embedding. Los vectores salen normalizados.

## Por qué OpenAI para chat y embeddings

- **Es la clave entregada por el curso** (`sk-proj-`), así que no hay costo adicional para el equipo.
- **Structured Outputs estricto:** el clasificador y el selector de herramientas reciben JSON que cumple el esquema,
  no solo JSON válido; la validación del backend y el respaldo determinista se mantienen como segunda barrera.
- **Un solo proveedor para chat y embeddings:** menos piezas, sin descargar un modelo de cientos de MB ni consumir
  CPU del servidor; `dimensions: 768` evita migrar la columna `vector(768)`.
- **Mejor separación semántica que E5:** E5 puntúa alto incluso sin relación (medido abajo), lo que vuelve frágil el
  umbral de "no encontré la política".

## Cumplimiento del enunciado

| Requisito | Cómo se cumple |
|---|---|
| Ninguna clave en el código | `OPENAI_API_KEY` solo en `backend/.env` (ignorado por git); `.env.example` sin valores; pruebas unitarias verifican que la clave no aparece en los errores. |
| Citas que salen de los fragmentos, nunca del modelo | Sin cambios: el agente de políticas arma las citas desde las filas de `match_policy_chunks`. |
| Cifras que salen de SQL; el LLM solo elige o redacta | Sin cambios: funciones SQL en la base y plantillas; el LLM solo elige la herramienta. |
| Similitud baja → "no encontré la política" y oferta de escalar | El umbral se aplica en el RPC; sin fragmentos, el agente lo dice y ofrece escalar. |
| < 8 s en el 90 % de las consultas | `reasoning_effort: none`, plazos de 6 s por llamada, clasificador con corte a 3,5 s y respaldo seguro. Se mide con `npm run eval:bank` (p90). |
| Seguridad ante consultas sobre otra persona | Sin cambios: la capa determinista niega antes de llamar al LLM. |

## Alternativas que se conservan

| Alternativa | Cómo activarla | Cuándo usarla |
|---|---|---|
| DeepSeek (o una plataforma compatible con OpenAI) | `LLM_PROVIDER=deepseek`, `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL` | Si el curso entrega una clave de DeepSeek o de una intermediaria. |
| Embeddings E5 locales (`Xenova/multilingual-e5-base`) | `EMBEDDINGS_PROVIDER=local` | Sin costo por token y sin enviar documentos a terceros; requiere descarga y CPU. |
| Gemini | `LLM_PROVIDER=gemini` y/o `EMBEDDINGS_PROVIDER=gemini`, `GEMINI_API_KEY` | Diseño original. |

**Importante:** si se cambia el proveedor de embeddings después de indexar documentos, hay que regenerar todos los
embeddings (los vectores de modelos distintos no son comparables) y recalibrar el umbral.

## Mediciones disponibles

| Prueba de humo (`npm run smoke:providers`) | E5 local | OpenAI |
|---|---|---|
| Dimensiones | 768 | pendiente |
| sim("vacaciones anuales", "días de descanso pagados") | 0.9111 | pendiente |
| sim("vacaciones anuales", "horas extra") | 0.8882 | pendiente |
| Separación (relacionado − sin relación) | 0.0229 | pendiente |
| Latencia por embedding (modelo ya cargado) | 20–48 ms | pendiente |

## Limitaciones y riesgos

1. **Privacidad:** las preguntas y los fragmentos recuperados se envían a OpenAI; los datos personales que calcula el
   agente de datos no se envían al LLM (se redactan con plantillas).
2. **Costo y cuota:** uso por token con la clave del curso; `eval:bank` reporta tokens y costo aproximado.
3. **Disponibilidad:** el chat depende de la API de OpenAI; ante errores, los clasificadores usan su respaldo
   determinista y el agente de políticas responde que la evidencia no está disponible.
4. **Umbral:** 0.45 es un valor inicial para `text-embedding-3-small`; debe calibrarse con los documentos reales.
5. **Modelo:** la documentación no aclara si `gpt-6-luna` acepta `temperature`, por eso no se envía; la estabilidad del
   clasificador se apoya en el esquema estricto y en `reasoning_effort: none`.

## Estado de la validación (2026-11-19)

- Código: 173 pruebas unitarias en verde (Structured Outputs estricto, negativas, reintentos, la clave nunca aparece
  en errores, `dimensions: 768` y normalización).
- E5 local: validado con la prueba de humo real.
- OpenAI: la clave guardada en `backend/.env` responde **HTTP 401 `invalid_api_key`** en `GET /v1/models`.
  Pendiente: clave válida, `npm run smoke:providers` (conexión, clasificación y comparación con E5) y
  `npm run eval:bank` (aciertos, p90, preguntas 21 y 22, tokens y costo).
