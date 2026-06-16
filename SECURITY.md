# Refatoracao de seguranca

## Estrutura recomendada

```text
.
|-- api/
|   |-- _supabase.js
|   |-- cadastros.js
|   |-- login.js
|   |-- logout.js
|   `-- session.js
|-- supabase/
|   `-- rls.sql
|-- .env.example
|-- index.html
|-- login.html
`-- admin.html
```

## Onde as chaves ficam

- `SUPABASE_SERVICE_ROLE_KEY`: somente no backend, em variavel de ambiente. Usada para operacoes sensiveis em `cadastros` e `audit_log`.
- `SUPABASE_ANON_KEY`: no backend, em variavel de ambiente, para autenticar chamadas de Auth do Supabase. Se voce voltar a usar SDK Supabase no navegador, esta e a unica chave que pode ir para o frontend.
- `TURNSTILE_SECRET_KEY`: somente no backend, em variavel de ambiente. Valida o token do Cloudflare Turnstile antes de criar cadastro.
- `TURNSTILE site key`: continua no frontend. Ela e publica por natureza e serve apenas para renderizar o desafio.

## Como rodar

Depois da refatoracao, abrir `index.html` ou `login.html` diretamente no navegador nao basta para os fluxos que usam banco/autenticacao. As telas chamam rotas internas em `/api`, entao o projeto precisa estar publicado em uma plataforma serverless compatível, como Vercel/Netlify/Render, ou rodando com um servidor local que exponha essas rotas.

Se `/api/login` responder 404/vazio, o login administrativo nao conseguira autenticar. Se o Turnstile mostrar erro no cadastro, confira se o dominio atual esta permitido no Cloudflare Turnstile e se a pagina esta em `http://localhost`, `https://...` ou no dominio publicado, nao em `file://`.

O erro `110200` do Turnstile significa dominio nao autorizado. Em desenvolvimento local, o `index.html` usa automaticamente a site key invisivel oficial de teste da Cloudflare. Para o backend validar esse token local, configure:

```env
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

Em producao, volte para o secret real e adicione seu dominio publicado em Turnstile > Hostname Management no painel da Cloudflare.

## RLS e policies

O arquivo `supabase/rls.sql` habilita RLS, remove acesso `anon` direto e cria leitura apenas para usuarios autenticados com `app_metadata.role = admin`.

Para marcar um usuario como admin no Supabase Auth, defina `app_metadata` como:

```json
{ "role": "admin" }
```

Tambem configure `ADMIN_EMAILS` no backend para restringir os administradores por e-mail.

## Checklist

- Chaves Supabase removidas de `index.html`, `login.html`, `admin.html` e `auth.js`.
- `service_role` nunca fica no client-side.
- Criacao de cadastro movida para `POST /api/cadastros`.
- Listagem administrativa movida para `GET /api/cadastros`.
- Login, sessao e logout passam por rotas backend.
- Backend valida sessao e permissao administrativa antes de listar dados.
- Backend valida Turnstile com secret server-side.
- Backend repete validacao de payload antes de gravar.
- RLS recomendado para bloquear leitura/escrita indevida pelo navegador.
