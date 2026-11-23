# Pruebas RLS

Estas pruebas se ejecutan únicamente contra `rrhh-rag-multiagente-test` (`bxtetlzjlgoezxcjhdrw`). El ejecutor acepta dos modos explícitos: `direct` y `session_pooler`. Rechaza hosts, usuarios y referencias de proyecto que no correspondan al proyecto de pruebas autorizado.

## Preparación

1. Copia `.env.example` como `.env` dentro de esta carpeta.
2. Selecciona el modo de conexión en `.env`:

   ```text
   RLS_TEST_CONNECTION_MODE=direct
   ```

   Si el equipo no dispone de IPv6, utiliza el **Session pooler** compartido:

   ```text
   RLS_TEST_CONNECTION_MODE=session_pooler
   ```

   Copia la URL desde **Supabase Dashboard → Connect → Session pooler**. No inventes el hostname. Debe usar un host terminado en `.pooler.supabase.com`, el puerto `5432` y el usuario `postgres.bxtetlzjlgoezxcjhdrw`. El ejecutor rechaza el Transaction pooler (puerto `6543`) porque estas pruebas requieren conservar la transacción, `SET LOCAL ROLE`, `SAVEPOINT` y `ROLLBACK` en una única sesión.

3. Configura `RLS_TEST_DATABASE_URL` sin mostrar la contraseña. Para una conexión directa puede usarse el asistente:

   ```powershell
   .\configure-rls-env.ps1
   ```

   El script solicita la contraseña de PostgreSQL de forma oculta, codifica sus caracteres especiales y escribe solo `RLS_TEST_DATABASE_URL` en `.env`. No abre conexiones.

   Para Session Pooler, copia primero el hostname exacto desde **Supabase Dashboard → Connect → Session pooler** y usa:

   ```powershell
   .\configure-session-pooler-rls-env.ps1 -PoolerHost '<hostname-copiado-del-panel>'
   ```

   El asistente exige un hostname válido terminado en `.pooler.supabase.com`, solicita la contraseña de forma oculta y actualiza únicamente `RLS_TEST_CONNECTION_MODE` y `RLS_TEST_DATABASE_URL` en el `.env` ignorado. No realiza conexiones.

4. Descarga el certificado raíz del proyecto de pruebas desde **Supabase Dashboard → Database Settings → SSL Configuration → Download Certificate**. Guarda el archivo fuera del repositorio y agrega su ruta absoluta a `.env`:

   ```text
   RLS_TEST_SSL_CA_FILE=C:/ruta-local-segura/prod-supabase.crt
   ```

   El ejecutor exige este certificado, valida su formato PEM y verifica tanto la CA como el nombre del host real: directo o Session Pooler.

5. Instala el controlador localmente:

   ```powershell
   Set-Location supabase\tests\rls
   npm install
   ```

6. Valida la configuración localmente, sin abrir una conexión remota:

   ```powershell
   npm run test:rls -- --validate-config
   ```

7. Ejecuta, solo tras autorizar pruebas remotas:

   ```powershell
   npm run test:rls
   ```

El proceso usa una conexión administrativa solo para resolver identificadores reales y crear fixtures transitorios. Las comprobaciones RLS se ejecutan con `SET LOCAL ROLE authenticated` o `anon` y con `request.jwt.claim.sub` del usuario ficticio correspondiente. Nunca usa `service_role` para simular usuarios.

Todo fixture, asignación temporal y modificación de prueba ocurre en una única transacción que termina con `ROLLBACK`. El reporte se escribe en `reports/`, carpeta ignorada por Git.

## Cierre de ejecución: 18 de noviembre de 2026

Entorno validado: proyecto Supabase de pruebas `bxtetlzjlgoezxcjhdrw`, conexión mediante Session Pooler por IPv4 y puerto `5432`, con certificado CA local y verificación TLS de la CA y del hostname activas. La ejecución registrada en `rls-report-2026-11-18T14-53-55-476Z.json` finalizó con **17 pruebas aprobadas y 0 fallidas**.

| Prueba | Comportamiento verificado |
| --- | --- |
| Employee A reads own employee row | Un empleado puede leer únicamente su propia fila de empleado. |
| Employee A cannot read employee B | Un empleado no obtiene filas privadas de otro empleado. |
| Employee A creates own draft request | Un empleado puede crear una solicitud propia en estado `draft`. |
| Employee A cannot modify employee B request | Un empleado no modifica solicitudes pertenecientes a otro empleado. |
| Employee A cannot assign self admin role | La autoasignación del rol administrador es rechazada por permisos (`42501`). |
| Employee A has no access.manage permission | El permiso administrativo `access.manage` devuelve `false` para un empleado. |
| Employee A cannot read employee B conversation | Un empleado no puede consultar conversaciones ajenas. |
| Employee A cannot read audit log | Un empleado no puede consultar la bitácora administrativa. |
| Current employee ID remains scoped to employee A | `current_employee_id()` devuelve el empleado asociado al usuario simulado. |
| Owns conversation rejects foreign conversation | `owns_conversation()` devuelve `false` ante una conversación ajena. |
| Employee A cannot invoke trigger function directly | Un cliente no puede invocar directamente la función de trigger (`42501`). |
| Employee B reads only own employee row | El segundo empleado puede leer su fila y no la del primero. |
| HR can read employees and manage request | El rol de RRHH puede leer ambos empleados de prueba y actualizar una solicitud autorizada. |
| Administrator can manage role assignments | El administrador puede asignar y retirar un rol temporal. |
| Auditor reads audit but cannot modify employee | El auditor lee auditoría, pero no modifica empleados. |
| Anonymous user cannot read document chunks | `anon` no puede consultar fragmentos documentales (`42501`). |
| Anonymous user cannot read audit log | `anon` no puede consultar auditoría (`42501`). |

## Cierre de ejecución: 19 de noviembre de 2026

Tras aplicar `20261119091000` (RRHH solo revisa solicitudes ya enviadas: `submitted → in_review → approved/rejected`), el fixture de RRHH se crea en `submitted` y la transición cambia solo `status`. El reporte `rls-report-2026-11-19T19-21-31-321Z.json` finalizó con **18 pruebas aprobadas y 0 fallidas** y `rollbackCompleted: true`.

| Prueba | Comportamiento verificado |
| --- | --- |
| HR cannot move a draft request to in_review | RRHH no puede saltarse el envío del colaborador: `42501` con el mensaje `Administrative leave request transition is not permitted.` |
| HR can read employees and review a submitted request | RRHH lee ambos empleados de prueba y pasa una solicitud `submitted` a `in_review` cambiando solo `status` (sustituye a "HR can read employees and manage request"). |

Las demás pruebas son las de la tabla del 18 de noviembre.

### Evidencia de transacciones

El reporte registra `rollbackCompleted: true`, lo que confirma que el ejecutor recibió una respuesta satisfactoria al `ROLLBACK` final. Además, el código ejecuta ese `ROLLBACK` dentro de `finally`, por lo que lo intenta aun cuando una prueba falla. Cada operación que espera un error se aísla ahora con `SAVEPOINT`, `ROLLBACK TO SAVEPOINT` y `RELEASE SAVEPOINT` para evitar que un `42501` deje abortada la transacción principal.

La evidencia no sustituye una auditoría independiente posterior de las tablas remotas. La garantía operativa depende de que las pruebas permanezcan dentro de la transacción única y de que el reporte registre el rollback completado.

### Cobertura y límites actuales

- Cubre las políticas RLS y funciones auxiliares ejercitadas por los cinco usuarios ficticios configurados; no es una prueba exhaustiva de las 33 políticas existentes.
- No valida autenticación HTTP/JWT de extremo a extremo, UI, API Express, Supabase Auth ni flujos de recuperación de contraseña.
- No cubre simultaneidad, rendimiento, límites del pooler, rotación de certificados ni todos los estados posibles de solicitudes.
- Los fixtures son transitorios y los reportes se mantienen fuera de Git para no registrar evidencia de ejecución ni metadatos operativos locales.
