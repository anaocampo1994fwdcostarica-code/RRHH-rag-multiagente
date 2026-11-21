# Calibración del umbral de similitud

- Modelo: Xenova/multilingual-e5-base · umbral actual: 0.828
- Peor positivo: 0.848 · mejor negativo: 0.807 · margen: 0.041
- Umbral propuesto: 0.828 (separa todas las preguntas)

| # | Tipo | Pregunta | Mejor puntaje | Documento | Sección | Doc. esperado en top-3 |
|---|---|---|---|---|---|---|
| 13 | política | Si renuncio, ¿cuántos días de preaviso debo dar? | 0.900 | MAN-RH-07 | 4. Renuncia y preaviso | sí |
| 8 | política | ¿Cuándo pagan el aguinaldo y cómo se calcula? | 0.896 | POL-RH-05 | 4. Aguinaldo (décimo tercer mes) | sí |
| 11 | política | ¿Cómo se pagan las horas extra? | 0.891 | REG-RH-04 | 5. Horas extra | sí |
| 5 | política | ¿Cuántos días de permiso tengo por fallecimiento de un familiar? | 0.890 | POL-RH-02 | 3. Permiso por fallecimiento de un familiar (duelo) | sí |
| 3 | política | ¿Puedo acumular vacaciones para el próximo año? | 0.887 | POL-RH-01 | 6. Acumulación de vacaciones para el año siguiente | sí |
| 4 | política | ¿Con cuánta anticipación debo solicitar vacaciones? | 0.882 | POL-RH-01 | 4. Cómo solicitar vacaciones | sí |
| 12 | política | ¿Cuánto dura el periodo de prueba? | 0.881 | MAN-RH-07 | 3. Periodo de prueba | sí |
| 6 | política | ¿Cuánto dura la licencia de maternidad y la de paternidad? | 0.876 | POL-RH-02 | 4. Licencia de maternidad | sí |
| 1 | política | ¿Cuántos días de vacaciones me corresponden al año? | 0.868 | POL-RH-01 | 3. Días de vacaciones por año | sí |
| 14 | política | ¿Qué incluye mi liquidación si me despiden sin justa causa? | 0.867 | MAN-RH-07 | 5. Despido sin justa causa: qué incluye la liquidación | sí |
| 16 | política | ¿Cómo denuncio un caso de acoso laboral de forma confidencial? | 0.867 | COD-RH-09 | 5. Cómo denunciar de forma confidencial | sí |
| 15 | política | ¿Qué cubre el seguro médico de la empresa? | 0.866 | CAT-RH-06 | 2. Seguro médico colectivo | sí |
| 20 | política | ¿Qué feriados quedan este año? | 0.856 | POL-RH-01 | 9. Feriados nacionales 2026 | sí |
| 7 | política | Me incapacitaron 5 días, ¿quién paga esos días y cuánto recibo? | 0.855 | PRO-RH-03 | 3. Incapacidad por enfermedad (CCSS) | sí |
| 10 | política | ¿Cuántos días puedo trabajar desde casa por semana? | 0.848 | REG-RH-04 | 2. Jornadas y horarios | sí |
| 23 | negativa | ¿La empresa da bono por mascotas? | 0.807 | CAT-RH-06 | 3. Asociación Solidarista (ASOVOLCÁN) |  |
| 24 | negativa | ¿Me recomiendas una película? | 0.768 | POL-RH-05 | 6. Comprobante de pago |  |
