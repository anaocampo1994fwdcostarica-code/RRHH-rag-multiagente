# Reporte diario vs. V1 del seed — 2026-11-22

Generado: 2026-11-22 16:57 (hora de Costa Rica) · Proyecto de pruebas `bxtetlzjlgoezxcjhdrw`.

- Reporte comparado: fila de `daily_hr_reports` del 2026-11-22, generada 2026-11-22 16:57 por `npm run report:daily`
  (funciones SQL de las migraciones `20261122090000` y `20261122100000`).
- V1: consulta "V1" de `supabase/seeds/demo_data.sql.example`, ejecutada en el mismo momento (transacción de solo lectura).
- Colaboradores en la base (deleted_at nulo): 56 (los 56 del seed; V1 filtra DEMO-* y RLS-TEST-EMP-*, las funciones no filtran).

## Comparación

| Métrica | Campo del reporte | Reporte | V1 | ¿Coincide? |
|---|---|---|---|---|
| Ausentes hoy con permiso aprobado | `absences.approved_leave_people` | 4 | 4 | Sí |
| Incapacidades activas hoy | `sick_leaves.active` | 4 | 4 | Sí |
| Solicitudes pendientes | `requests.pending_total` | 25 | 25 | Sí |
| Pendientes con más de 3 días | `requests.pending_over_3_days` | 20 | 20 | Sí |
| Ingresos del mes | `turnover.hires_month` | 3 | 3 | Sí |
| Salidas del mes | `turnover.exits_month` | 2 | 2 | Sí |
| Personas con más de 20 días acumulados | `vacation_over_20.count` | 5 | 5 | Sí |

**Resultado: las 7 métricas comparables coinciden.**

Métricas del reporte sin equivalente en V1: ausentes por tipo {"permiso":0,"vacaciones":4,"incapacidad":4} (total 8 personas),
50 días de incapacidad en el mes, rotación del mes 3.7 % y acumulada del año 3.7 %,
chatbot del 2026-11-21: 13 consultas, 61.5 % resueltas sin escalar, 3352 ms de latencia promedio.
Las consultas del chat anteriores a 2026-11-22 son **sintéticas** (`supabase/seeds/chat_logs_demo.sql.example`).

## Resumen ejecutivo guardado (redactado por IA, validado · prompt 1.1.0)

> Hoy se registraron 8 personas con ausencia: 4 por vacaciones, 4 por incapacidad y 0 por permiso. En solicitudes, hay 25 pendientes y 20 superan el umbral de 3 días, mientras que 5 personas superan el umbral de 20 días de vacaciones. Las incapacidades activas son 4, con 50 días acumulados en el mes, y la rotación muestra 3 contrataciones, 2 salidas en el mes, 2 salidas en el año y una tasa mensual y acumulada de 3,7%. El asistente registró 13 consultas el 21 de noviembre, resolvió 8 sin escalamiento (61,5%) y tuvo una latencia promedio de 3352 ms.

## JSON del reporte (sin datos personales)

```json
{
  "meta": {
    "basis": {
      "topics": "historica",
      "chatbot": "historica",
      "absences": "historica",
      "requests": "historica",
      "turnover": "historica",
      "sick_leaves": "historica",
      "vacation_over_20": "foto_actual"
    },
    "prompt_version": "1.1.0",
    "narrative_source": "llm"
  },
  "topics": {
    "top5": [
      {
        "count": 1,
        "topic": "AVI-RH-10"
      },
      {
        "count": 1,
        "topic": "CAL-RH-05"
      },
      {
        "count": 1,
        "topic": "CAT-RH-06"
      },
      {
        "count": 1,
        "topic": "COD-RH-09"
      },
      {
        "count": 1,
        "topic": "POL-RH-02"
      }
    ],
    "unanswered": "[2 preguntas omitidas]",
    "unanswered_count": 2
  },
  "chatbot": {
    "date": "2026-11-21",
    "total": 13,
    "by_intent": {
      "mixed": 1,
      "policy": 8,
      "restricted": 1,
      "out_of_scope": 1,
      "personal_data": 2
    },
    "avg_latency_ms": 3352,
    "resolved_without_escalation": 8,
    "resolved_without_escalation_pct": 61.5
  },
  "absences": {
    "by_type": {
      "permiso": 0,
      "vacaciones": 4,
      "incapacidad": 4
    },
    "total_people": 8,
    "by_department": [
      {
        "total": 2,
        "permiso": 0,
        "department": "Dirección General",
        "vacaciones": 1,
        "incapacidad": 1
      },
      {
        "total": 2,
        "permiso": 0,
        "department": "Finanzas",
        "vacaciones": 0,
        "incapacidad": 2
      },
      {
        "total": 1,
        "permiso": 0,
        "department": "Comercial y Logística",
        "vacaciones": 0,
        "incapacidad": 1
      },
      {
        "total": 1,
        "permiso": 0,
        "department": "Producción",
        "vacaciones": 1,
        "incapacidad": 0
      },
      {
        "total": 1,
        "permiso": 0,
        "department": "Talento Humano",
        "vacaciones": 1,
        "incapacidad": 0
      },
      {
        "total": 1,
        "permiso": 0,
        "department": "Tecnología",
        "vacaciones": 1,
        "incapacidad": 0
      }
    ],
    "approved_leave_people": 4
  },
  "requests": {
    "pending_list": "[25 filas omitidas]",
    "pending_total": 25,
    "pending_over_3_days": 20
  },
  "timezone": "America/Costa_Rica",
  "turnover": {
    "formula": "salidas del periodo / ((plantilla al inicio del periodo + plantilla al día del reporte) / 2) x 100; periodo = mes y año calendario hasta la fecha del reporte",
    "exits_year": 2,
    "exits_month": 2,
    "hires_month": 3,
    "rate_pct_ytd": 3.7,
    "headcount_end": 54,
    "rate_pct_month": 3.7,
    "headcount_year_start": 53,
    "headcount_month_start": 53
  },
  "trend_30d": [
    {
      "day": "2026-10-24",
      "absences": 2,
      "chat_queries": 9
    },
    {
      "day": "2026-10-25",
      "absences": 2,
      "chat_queries": 12
    },
    {
      "day": "2026-10-26",
      "absences": 2,
      "chat_queries": 15
    },
    {
      "day": "2026-10-27",
      "absences": 2,
      "chat_queries": 8
    },
    {
      "day": "2026-10-28",
      "absences": 2,
      "chat_queries": 11
    },
    {
      "day": "2026-10-29",
      "absences": 2,
      "chat_queries": 14
    },
    {
      "day": "2026-10-30",
      "absences": 3,
      "chat_queries": 7
    },
    {
      "day": "2026-10-31",
      "absences": 2,
      "chat_queries": 10
    },
    {
      "day": "2026-11-01",
      "absences": 2,
      "chat_queries": 13
    },
    {
      "day": "2026-11-02",
      "absences": 2,
      "chat_queries": 6
    },
    {
      "day": "2026-11-03",
      "absences": 1,
      "chat_queries": 9
    },
    {
      "day": "2026-11-04",
      "absences": 1,
      "chat_queries": 12
    },
    {
      "day": "2026-11-05",
      "absences": 1,
      "chat_queries": 15
    },
    {
      "day": "2026-11-06",
      "absences": 2,
      "chat_queries": 8
    },
    {
      "day": "2026-11-07",
      "absences": 2,
      "chat_queries": 11
    },
    {
      "day": "2026-11-08",
      "absences": 2,
      "chat_queries": 14
    },
    {
      "day": "2026-11-09",
      "absences": 2,
      "chat_queries": 7
    },
    {
      "day": "2026-11-10",
      "absences": 2,
      "chat_queries": 10
    },
    {
      "day": "2026-11-11",
      "absences": 3,
      "chat_queries": 13
    },
    {
      "day": "2026-11-12",
      "absences": 3,
      "chat_queries": 6
    },
    {
      "day": "2026-11-13",
      "absences": 3,
      "chat_queries": 9
    },
    {
      "day": "2026-11-14",
      "absences": 2,
      "chat_queries": 12
    },
    {
      "day": "2026-11-15",
      "absences": 2,
      "chat_queries": 15
    },
    {
      "day": "2026-11-16",
      "absences": 2,
      "chat_queries": 8
    },
    {
      "day": "2026-11-17",
      "absences": 2,
      "chat_queries": 11
    },
    {
      "day": "2026-11-18",
      "absences": 2,
      "chat_queries": 14
    },
    {
      "day": "2026-11-19",
      "absences": 3,
      "chat_queries": 7
    },
    {
      "day": "2026-11-20",
      "absences": 7,
      "chat_queries": 10
    },
    {
      "day": "2026-11-21",
      "absences": 8,
      "chat_queries": 13
    },
    {
      "day": "2026-11-22",
      "absences": 8,
      "chat_queries": null
    }
  ],
  "thresholds": {
    "top_topics": 5,
    "trend_days": 30,
    "pending_days": 3,
    "vacation_days": 20
  },
  "report_date": "2026-11-22",
  "sick_leaves": {
    "active": 4,
    "accumulated_days_month": 50
  },
  "schema_version": 1,
  "vacation_over_20": {
    "count": 5,
    "people": "[5 personas omitidas]"
  }
}
```
