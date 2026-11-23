-- Laboratorio aislado de SQLi. Solo datos ficticios; no toca tablas public.* reales.
create schema if not exists security_lab;

create table if not exists security_lab.lab_employees (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null unique,
  fictional_salary numeric(12,2) not null,
  secret_note text not null
);

insert into security_lab.lab_employees (name, email, fictional_salary, secret_note) values
  ('Ana Solís', 'ana.solis@example.test', 1800, 'Nota ficticia A'),
  ('Bruno Rojas', 'bruno.rojas@example.test', 2100, 'Nota ficticia B'),
  ('Carla Mora', 'carla.mora@example.test', 1950, 'Nota ficticia C'),
  ('Diego Vega', 'diego.vega@example.test', 2300, 'Nota ficticia D'),
  ('Elena Castro', 'elena.castro@example.test', 1750, 'Nota ficticia E'),
  ('Fabian Leon', 'fabian.leon@example.test', 2500, 'Nota ficticia F'),
  ('Gabriela Ruiz', 'gabriela.ruiz@example.test', 2200, 'Nota ficticia G'),
  ('Hugo Campos', 'hugo.campos@example.test', 2050, 'Nota ficticia H')
on conflict (email) do nothing;

do $$ begin
  create role security_lab_reader nologin;
exception when duplicate_object then null;
end $$;

revoke all on schema security_lab from public;
revoke all on table security_lab.lab_employees from public;
grant usage on schema security_lab to security_lab_reader;
grant select (id, name, email, fictional_salary) on security_lab.lab_employees to security_lab_reader;
grant usage on schema security_lab to rrhh_api;
grant select on security_lab.lab_employees to rrhh_api;
