-- Dedicated login for the Express application. Its password is provisioned
-- separately through an approved administrative channel and is never stored here.
create role rrhh_api
  login
  noinherit
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication
  nobypassrls;

-- rrhh_api must explicitly switch to the RLS application role inside each
-- transaction. It receives no inherited authenticated privileges at login.
grant authenticated to rrhh_api
  with inherit false, set true, admin false;

-- The login may connect, but it receives no direct application-object rights.
-- After SET LOCAL ROLE authenticated, existing grants and RLS policies apply.
revoke all privileges on database postgres from rrhh_api;
grant connect on database postgres to rrhh_api;
revoke all privileges on schema public from rrhh_api;
revoke all privileges on all tables in schema public from rrhh_api;
revoke all privileges on all sequences in schema public from rrhh_api;
revoke all privileges on all functions in schema public from rrhh_api;
