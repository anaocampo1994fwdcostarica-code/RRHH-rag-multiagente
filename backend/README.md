# Backend RRHH RAG Multiagente

## Autenticación de rutas futuras

Las rutas de negocio protegidas usarán el encabezado `Authorization: Bearer <access-token>` emitido por Supabase Auth. El middleware verifica criptográficamente el token mediante `supabase.auth.getClaims()` y solo acepta claims con `role` igual a `authenticated` y un `sub` UUID válido.

El backend no acepta roles, permisos ni identificadores enviados fuera del JWT verificado. El cliente Supabase se crea bajo demanda con la URL del proyecto y su publishable key; no usa `service_role`, no persiste sesiones y no renueva tokens.

`GET /api/health` es público. `GET /api/auth/me` es una ruta temporal protegida que devuelve solo el identificador y rol verificados.

## Acceso PostgreSQL con RLS

Las rutas de negocio futuras deben usar `withUserTransaction(request.auth, callback)`. El wrapper solo acepta la identidad interna creada por `requireAuth`, adquiere un cliente del pool y ejecuta una transacción corta con este orden:

1. `BEGIN`
2. `set_config('request.jwt.claims', ..., true)` y `request.jwt.claim.sub`
3. `SET LOCAL ROLE authenticated`
4. Consultas parametrizadas del callback
5. `COMMIT`, o `ROLLBACK` ante error

Las claims y el rol son locales a la transacción, por lo que no se filtran entre conexiones reutilizadas. El callback recibe una interfaz limitada: no puede cambiar de rol, iniciar o cerrar transacciones, ni cambiar parámetros de sesión.

El pool se crea de forma diferida con `DATABASE_URL` y `DATABASE_SSL_CA_FILE`. El certificado CA se carga desde fuera del repositorio, se exige `rejectUnauthorized: true` y se eliminan parámetros SSL de la URL para impedir que reemplacen la CA configurada. El usuario de conexión no puede ser `service_role`.

Antes de una prueba real se debe confirmar en el proyecto de pruebas que el rol de conexión no tiene `BYPASSRLS`, puede hacer `SET LOCAL ROLE authenticated`, y que las políticas observan `auth.uid()` con las claims inyectadas. Esta infraestructura no valida esos atributos sin una conexión real.

## Integración RLS contra el proyecto de pruebas

El ejecutor independiente `scripts/run-rls-integration.mjs` no inicia Express ni expone rutas. Usa dos access tokens reales de los empleados ficticios, los vuelve a validar con `requireAuth` y ejecuta las consultas con `withUserTransaction(..., { completion: 'rollback' })`.

La configuración local debe copiarse desde `.env.integration.example` a `.env.integration`. Exige el proyecto `bxtetlzjlgoezxcjhdrw`, un Session Pooler por IPv4 en puerto `5432`, el usuario de base `rrhh_api.bxtetlzjlgoezxcjhdrw`, CA TLS y dos tokens de acceso efímeros. Rechaza usuarios administrativos (`postgres`, `service_role`, `supabase_admin`) y `authenticated` como usuario de conexión. No se deben reutilizar la URL administrativa ni credenciales `service_role`.

Antes de conectar, valida solo la configuración:

```powershell
Set-Location backend
npm run test:rls-integration -- --validate-config
```

Tras autorización explícita para una prueba remota en el proyecto de pruebas:

```powershell
npm run test:rls-integration
```

La integración valida el rol efectivo y de conexión, `rolbypassrls`, `auth.uid()`, visibilidad de la fila propia, invisibilidad de un empleado distinto y aislamiento entre dos transacciones. Todas las transacciones finalizan con `ROLLBACK`; aun así, solo se realizan consultas de lectura.

```powershell
Set-Location backend
npm test
npm start
```

## Próximo rol de conexión restringido

La migración `20261118090000_create_rrhh_api_application_role.sql` prepara
`rrhh_api` para sustituir la conexión administrativa. Tras aplicarla y asignar
una contraseña por un canal administrativo seguro, fuera del repositorio, el
backend usará `rrhh_api.<project-ref>` mediante Session Pooler. El rol no hereda
privilegios en el login y solo adquiere los de `authenticated` mediante
`SET LOCAL ROLE authenticated` dentro del wrapper transaccional.

El ejecutor de integración valida `rrhh_api.<project-ref>` y el wrapper cambia
al rol efectivo `authenticated` exclusivamente con `SET LOCAL ROLE` dentro de
la transacción. Antes de cambiar cualquier `.env`, se debe provisionar la
contraseña de `rrhh_api` por un canal administrativo seguro y fuera de Git.
