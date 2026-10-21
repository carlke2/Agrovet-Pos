# Agrovet POS

Point of sale for an agrovet shop: staff login, counter sales, receipts, inventory, suppliers, and reporting.

## Features

| Area | Capabilities |
|------|----------------|
| POS Terminal | Checkout, cart, receipts, cash / M-Pesa |
| Catalog | Products, categories, pricing, availability |
| Inventory | Stock levels, reorder thresholds, stock movements |
| Suppliers | Supplier records and purchase tracking |
| Reporting | Revenue, expenses, receipts, audit log |
| Access | Five roles. See Access below. JWT login, 12 hours |

## Tech stack

| Layer | Technologies |
|-------|----------------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Backend | Node.js, Express, TypeScript, Prisma, JWT |
| Database | PostgreSQL |

## Local setup

### Backend

```bash
cd backend
npm install
# backend/.env is already in place — set DATABASE_URL, DIRECT_URL, JWT_SECRET
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`. Backend runs at `http://localhost:5000`.

## Access

Sign-in uses this app's users table and a JWT. These are the five system roles:

| Role | Access |
|------|--------|
| Admin | Every permission: users, roles, settings, the audit log, back office, and point of sale |
| Manager | Back office and point of sale |
| Cashier | Point of sale, starting an M-Pesa sale, own attendance clock, and own profile |
| Stock keeper | No pages yet |
| Accountant | Audit log only |

Back office is the temporary `legacy_full_access` permission (menu changes, inventory, suppliers, finance, expenses, reports, and the dashboard). Point of sale is `legacy_pos_access`. A role with nothing to open sees "No access yet".

## Project structure

```text
agrovet-pos/
├── backend/
│   ├── prisma/schema.prisma
│   ├── routes/
│   └── services/
└── frontend/src/
    ├── pages/
    └── components/
```
