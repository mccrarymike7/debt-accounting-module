# Aspida Debt Accounting Module

Standalone internal web app for multi-entity corporate debt accounting (funding agreements, notes, revolvers), styled after [aspida.com](https://aspida.com).

## Database

**PostgreSQL** is the application database (source of truth for instruments, accruals, journals, monthly close).

Local default connection:

```text
postgresql://debt:debt@localhost:5432/debt_accounting?schema=public
```

Snowflake is a later analytics destination — not the OLTP store for this module.

### Local Postgres (Homebrew)

```bash
brew services start postgresql@16
# DB/user already created for this project as debt / debt_accounting
```

### Local Postgres (Docker)

```bash
docker compose up -d
```

## Setup

```bash
npm install
cp .env.example .env   # if needed
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo users

| Email | Password | Role |
|-------|----------|------|
| admin@aspida.local | password123 | ADMIN |
| accountant@aspida.local | password123 | ACCOUNTANT |
| viewer@aspida.local | password123 | VIEWER |

## Features

- Multi-entity debt book with consolidated and entity-filtered views
- Funding agreements and floating rates (SOFR + spread)
- Monthly process: new debt, revolver activity, rates, payments, accruals, GL CSV
- Revolving facility draws / repayments / bank true-ups
- Effective interest method for issuance costs
- Covenant definitions UI (engine future state)
- Agreement document repository: upload debt/covenant PDFs, extract terms, review & approve into the ledger

## Scripts

- `npm run dev` — development server
- `npm run db:push` — sync Prisma schema to Postgres
- `npm run db:seed` — reseed sample data
- `npm run db:generate` — regenerate Prisma client
