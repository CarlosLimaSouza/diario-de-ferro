# Diário de Ferro — Registro de Treino

App pessoal de tracking de treino: presença diária, registro de peso/tempo por
exercício, histórico de progressão e streak. Backend em Node/Express, dados
salvos em um arquivo JSON simples (sem dependências nativas — build de Docker
rápido e sem dor de cabeça).

## Rodar localmente com Docker

```bash
docker compose up --build
```

Acesse http://localhost:3000

Os dados ficam num volume Docker chamado `treino-data`, então sobrevivem
entre reinicializações do container.

## Rodar localmente sem Docker

```bash
npm install
npm start
```

## Deploy no Railway

1. Suba este projeto pra um repositório no GitHub (ou use `railway up` direto
   da CLI).
2. No Railway, crie um novo serviço a partir do repositório — ele vai
   detectar o `Dockerfile` automaticamente.
3. **Importante — adicione um Volume**: sem isso, os dados são apagados a
   cada novo deploy, porque o sistema de arquivos do container é efêmero.
   - No serviço, vá em **Settings → Volumes → New Volume**
   - Monte em `/data`
   - Isso faz o `DB_PATH=/data/db.json` (já configurado no Dockerfile)
     persistir de verdade.
4. O Railway injeta a variável `PORT` automaticamente — o app já está
   configurado pra usá-la.
5. Depois do deploy, o Railway te dá uma URL pública (ou você pode apontar
   um domínio próprio).

## Estrutura

```
meu-treino/
├── server.js          # API Express
├── db.js              # Armazenamento em JSON (arquivo único, com fila de escrita)
├── package.json
├── Dockerfile
├── docker-compose.yml  # pra rodar localmente
├── public/
│   ├── index.html
│   ├── app.js          # toda a lógica do front-end
│   └── styles.css
└── data/               # criado automaticamente, guarda db.json localmente
```

## Backup

Os dados vivem inteiros em um único arquivo JSON (`data/db.json` local, ou
`/data/db.json` no volume do Railway). Pra fazer backup manual, basta copiar
esse arquivo. Se quiser, dá pra adicionar depois um botão de exportar/importar
direto na interface.
