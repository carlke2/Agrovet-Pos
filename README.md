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
| Access | Owner and cashier roles, JWT sessions |

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
