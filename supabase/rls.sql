-- Execute no SQL Editor do Supabase depois de ajustar os nomes das tabelas/colunas.
-- A aplicacao publica escreve via backend com service role; o navegador nao deve
-- ter acesso direto a leitura/escrita nas tabelas sensiveis.

alter table public.cadastros enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists "cadastros_admin_select" on public.cadastros;
drop policy if exists "cadastros_no_public_insert" on public.cadastros;
drop policy if exists "audit_log_admin_select" on public.audit_log;

create policy "cadastros_admin_select"
on public.cadastros
for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "audit_log_admin_select"
on public.audit_log
for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

revoke all on table public.cadastros from anon;
revoke all on table public.audit_log from anon;

grant select on table public.cadastros to authenticated;
grant select on table public.audit_log to authenticated;

-- Recomendado para unicidade no banco, caso ainda nao exista:
create unique index if not exists cadastros_email_unique
on public.cadastros (lower(email));

create unique index if not exists cadastros_telefone_normalizado_unique
on public.cadastros (telefone_normalizado);
