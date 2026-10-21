/**
 * Slow Rise Co — 6-Month Comprehensive Historical Test Data Generator
 *
 * Generates realistic, mathematically coherent data spanning 180 days (Apr 1, 2026 - Sep 28, 2026)
 * Specifically tailored for AI agent training & simulation:
 *  - POS transactions & M-Pesa Kopo payments (with weekend/hour sales patterns)
 *  - Production baking batches (yields, sold quantities, depleted status, stale rate)
 *  - Recipe formulas & ingredient stock movements (purchases, usage, spoilage)
 *  - Operating expenses & monthly fixed costs for P&L tracking
 *  - Staff rosters & daily attendance check-in/out shifts
 *  - Online storefront customer orders (pickup & delivery with GPS coordinates)
 *  - System audit events
 *
 * Preserves the Admin/Owner account while wiping and regenerating all operational test data.
 */

import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import prisma from '@/services/prisma';

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 25);
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, decimals: number = 2): number {
  const val = Math.random() * (max - min) + min;
  return parseFloat(val.toFixed(decimals));
}

function choose<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function pad(n: number, width: number = 2): string {
  return String(n).padStart(width, '0');
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

async function wipeOperationalData() {
  console.log('==> Wiping previous operational test data (preserving owner/admin)...');

  // Delete child records first to respect FK constraints
  await prisma.posTransactionItem.deleteMany({});
  await prisma.kopoPayment.deleteMany({});
  await prisma.posTransaction.deleteMany({});

  await prisma.stockReservationHold.deleteMany({});
  await prisma.stockReservationItem.deleteMany({});
  await prisma.stockReservation.deleteMany({});

  await prisma.shopOrderItem.deleteMany({});
  await prisma.shopOrder.deleteMany({});
  await prisma.phoneOtp.deleteMany({});
  await prisma.customer.deleteMany({});

  await prisma.productionBatch.deleteMany({});
  await prisma.menuItemIngredient.deleteMany({});
  await prisma.menuItem.deleteMany({});
  await prisma.menuCategory.deleteMany({});

  await prisma.stockMovement.deleteMany({});
  await prisma.inventoryItem.deleteMany({});
  await prisma.supplier.deleteMany({});

  await prisma.expense.deleteMany({});
  await prisma.staffAttendance.deleteMany({});
  await prisma.auditEvent.deleteMany({});

  // Wipe non-owner users only
  const deletedUsers = await prisma.user.deleteMany({
    where: { role: { not: 'owner' } },
  });
  console.log(`    Cleared ${deletedUsers.count} non-owner staff records.`);
}

async function main() {
  console.log('================================================================');
  console.log('  SLOW RISE CO — 6-MONTH HISTORICAL DATA SEEDER');
  console.log('  Date range: 2026-04-01 to 2026-09-28 (180 days)');
  console.log('================================================================\n');

  await wipeOperationalData();

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ENSURE OWNER & STAFF USERS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[1/9] Setting up staff accounts...');
  const defaultPasswordHash = await bcrypt.hash('Password@123', 10);

  const ownerEmail = (process.env.SEED_OWNER_EMAIL || 'ckipkemoi99@gmail.com').trim().toLowerCase();
  const ownerName = process.env.SEED_OWNER_NAME || 'Caleb Salat';
  const ownerPassword = process.env.SEED_OWNER_PASSWORD || 'salatkipkemoi';
  const ownerHash = await bcrypt.hash(ownerPassword, 10);

  let owner = await prisma.user.findFirst({ where: { role: 'owner' } });
  if (!owner) {
    owner = await prisma.user.create({
      data: {
        name: ownerName,
        email: ownerEmail,
        role: 'owner',
        status: 'active',
        password: ownerHash,
        phone: '0712345678',
      },
    });
  } else {
    owner = await prisma.user.update({
      where: { id: owner.id },
      data: { status: 'active', password: ownerHash },
    });
  }

  // Create Staff
  const staffData = [
    { name: 'Faith Wanjiku', email: 'cashier.faith@slowrise.co', role: 'cashier', phone: '0722112233' },
    { name: 'Brian Kiprono', email: 'cashier.brian@slowrise.co', role: 'cashier', phone: '0733445566' },
    { name: 'David Ochieng', email: 'delivery.david@slowrise.co', role: 'delivery', phone: '0744778899' },
    { name: 'Mercy Chebet', email: 'mercy.baker@slowrise.co', role: 'cashier', phone: '0755990011' }, // Kitchen lead
  ];

  const createdStaff: Array<{ id: string; name: string; email: string; role: string; phone: string }> = [];
  for (const s of staffData) {
    const user = await prisma.user.create({
      data: {
        name: s.name,
        email: s.email,
        role: s.role,
        status: 'active',
        password: defaultPasswordHash,
        phone: s.phone,
      },
    });
    createdStaff.push({ id: user.id, name: user.name, email: user.email, role: user.role, phone: s.phone });
  }

  const cashierUsers = createdStaff.filter((s) => s.role === 'cashier');
  const deliveryDriver = createdStaff.find((s) => s.role === 'delivery')!;

  console.log(`    Owner: ${owner.name} (${owner.email})`);
  console.log(`    Staff: ${createdStaff.map((s) => `${s.name} [${s.role}]`).join(', ')}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. CATEGORIES, INVENTORY ITEMS & SUPPLIERS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[2/9] Creating menu categories, inventory items & suppliers...');

  const categoryNames = ['Bread', 'Pastries', 'Cakes', 'Beverages', 'Savory & Snacks'];
  const categories: Record<string, string> = {};
  for (let i = 0; i < categoryNames.length; i++) {
    const cat = await prisma.menuCategory.create({
      data: { name: categoryNames[i], sortOrder: i + 1 },
    });
    categories[cat.name] = cat.id;
  }

  const suppliersData = [
    { name: 'Unga Holdings Ltd', contactPerson: 'James Kariuki', email: 'sales@ungaholdings.co.ke', phone: '0720100200', address: 'Commercial St, Industrial Area, Nairobi' },
    { name: 'Brookside Dairy Ltd', contactPerson: 'Grace Muthoni', email: 'orders@brookside.co.ke', phone: '0722300400', address: 'Ruiru Plant, Thika Road' },
    { name: 'Kenchic Poultry Ltd', contactPerson: 'Peter Kamau', email: 'supply@kenchic.com', phone: '0733500600', address: 'Enterprise Rd, Nairobi' },
    { name: 'Packaging World Kenya', contactPerson: 'Alice Njeri', email: 'info@packagingworld.co.ke', phone: '0721700800', address: 'Mombasa Road, Nairobi' },
    { name: 'Tropical Cane Sugar Ltd', contactPerson: 'Hassan Ali', email: 'orders@tropicalsugar.co.ke', phone: '0734900100', address: 'Kisumu Depot / Nairobi Distribution' },
    { name: 'Dormans Coffee Roasters', contactPerson: 'Kevin Omondi', email: 'sales@dormanscoffee.com', phone: '0722880099', address: 'Tatu City, Kiambu' },
  ];

  const suppliers: Array<{ id: string; name: string }> = [];
  for (const sup of suppliersData) {
    const s = await prisma.supplier.create({ data: sup });
    suppliers.push({ id: s.id, name: s.name });
  }

  const inventoryCatalog = [
    { name: "Baker's Wheat Flour", category: 'Dry goods', unit: 'kg', stockLevel: 250, reorderLevel: 50, unitCost: 85, supplierName: 'Unga Holdings Ltd' },
    { name: 'Wholemeal Flour', category: 'Dry goods', unit: 'kg', stockLevel: 180, reorderLevel: 40, unitCost: 95, supplierName: 'Unga Holdings Ltd' },
    { name: 'Granulated Sugar', category: 'Dry goods', unit: 'kg', stockLevel: 120, reorderLevel: 30, unitCost: 145, supplierName: 'Tropical Cane Sugar Ltd' },
    { name: 'Active Dry Yeast', category: 'Dry goods', unit: 'kg', stockLevel: 25, reorderLevel: 5, unitCost: 450, supplierName: 'Unga Holdings Ltd' },
    { name: 'Unsalted Butter', category: 'Dairy', unit: 'kg', stockLevel: 45, reorderLevel: 10, unitCost: 820, supplierName: 'Brookside Dairy Ltd' },
    { name: 'Fresh Whole Milk', category: 'Dairy', unit: 'liters', stockLevel: 60, reorderLevel: 15, unitCost: 75, supplierName: 'Brookside Dairy Ltd' },
    { name: 'Fresh Eggs', category: 'Dairy', unit: 'pieces', stockLevel: 360, reorderLevel: 60, unitCost: 15, supplierName: 'Kenchic Poultry Ltd' },
    { name: 'Baking Powder', category: 'Dry goods', unit: 'kg', stockLevel: 20, reorderLevel: 5, unitCost: 320, supplierName: 'Tropical Cane Sugar Ltd' },
    { name: 'Fine Table Salt', category: 'Dry goods', unit: 'kg', stockLevel: 30, reorderLevel: 10, unitCost: 40, supplierName: 'Tropical Cane Sugar Ltd' },
    { name: 'Pastry Margarine', category: 'Dry goods', unit: 'kg', stockLevel: 50, reorderLevel: 12, unitCost: 280, supplierName: 'Tropical Cane Sugar Ltd' },
    { name: 'Pure Cocoa Powder', category: 'Dry goods', unit: 'kg', stockLevel: 15, reorderLevel: 4, unitCost: 950, supplierName: 'Dormans Coffee Roasters' },
    { name: 'Vanilla Extract', category: 'Dry goods', unit: 'liters', stockLevel: 10, reorderLevel: 2, unitCost: 1200, supplierName: 'Dormans Coffee Roasters' },
    { name: 'Arabica Coffee Beans', category: 'Beverages', unit: 'kg', stockLevel: 35, reorderLevel: 8, unitCost: 1100, supplierName: 'Dormans Coffee Roasters' },
    { name: 'Minced Beef (Pastry filling)', category: 'Meat', unit: 'kg', stockLevel: 25, reorderLevel: 6, unitCost: 650, supplierName: 'Kenchic Poultry Ltd' },
    { name: 'Chicken Breast (Pie filling)', category: 'Meat', unit: 'kg', stockLevel: 20, reorderLevel: 5, unitCost: 700, supplierName: 'Kenchic Poultry Ltd' },
    { name: 'Brown Kraft Paper Bags', category: 'Packaging', unit: 'pieces', stockLevel: 2500, reorderLevel: 500, unitCost: 8, supplierName: 'Packaging World Kenya' },
    { name: 'Pastry & Cake Boxes', category: 'Packaging', unit: 'pieces', stockLevel: 800, reorderLevel: 150, unitCost: 35, supplierName: 'Packaging World Kenya' },
  ];

  const inventoryMap: Record<string, { id: string; unitCost: number; supplierId: string }> = {};
  for (const item of inventoryCatalog) {
    const sup = suppliers.find((s) => s.name === item.supplierName) || suppliers[0];
    const created = await prisma.inventoryItem.create({
      data: {
        name: item.name,
        category: item.category,
        unit: item.unit,
        stockLevel: item.stockLevel,
        reorderLevel: item.reorderLevel,
        unitCost: item.unitCost,
      },
    });
    inventoryMap[item.name] = { id: created.id, unitCost: item.unitCost, supplierId: sup.id };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. MENU ITEMS & RECIPES
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[3/9] Creating menu items & recipes...');

  type MenuItemDef = {
    name: string;
    category: string;
    price: number;
    unitType: string;
    bestBeforeHours: number | null;
    batchYield: number | null;
    stockLevel: number | null;
    description: string;
    ingredients: Array<{ name: string; quantity: number }>;
  };

  const menuCatalog: MenuItemDef[] = [
    // Bread
    {
      name: 'Brown Loaf 800g',
      category: 'Bread',
      price: 180,
      unitType: 'loaf',
      bestBeforeHours: 48,
      batchYield: 24,
      stockLevel: 30,
      description: 'Stone-ground wholemeal hearty sandwich bread',
      ingredients: [
        { name: 'Wholemeal Flour', quantity: 0.5 },
        { name: "Baker's Wheat Flour", quantity: 0.1 },
        { name: 'Active Dry Yeast', quantity: 0.01 },
        { name: 'Fine Table Salt', quantity: 0.01 },
        { name: 'Brown Kraft Paper Bags', quantity: 1 },
      ],
    },
    {
      name: 'White Sourdough Loaf',
      category: 'Bread',
      price: 220,
      unitType: 'loaf',
      bestBeforeHours: 48,
      batchYield: 20,
      stockLevel: 25,
      description: 'Naturally fermented artisanal sourdough with crispy crust',
      ingredients: [
        { name: "Baker's Wheat Flour", quantity: 0.55 },
        { name: 'Active Dry Yeast', quantity: 0.005 },
        { name: 'Fine Table Salt', quantity: 0.01 },
        { name: 'Brown Kraft Paper Bags', quantity: 1 },
      ],
    },
    {
      name: 'Sweet Milk Bread',
      category: 'Bread',
      price: 130,
      unitType: 'loaf',
      bestBeforeHours: 36,
      batchYield: 30,
      stockLevel: 35,
      description: 'Hokkaido-style fluffy golden sweet milk loaf',
      ingredients: [
        { name: "Baker's Wheat Flour", quantity: 0.4 },
        { name: 'Fresh Whole Milk', quantity: 0.15 },
        { name: 'Granulated Sugar', quantity: 0.05 },
        { name: 'Unsalted Butter', quantity: 0.03 },
        { name: 'Active Dry Yeast', quantity: 0.01 },
        { name: 'Brown Kraft Paper Bags', quantity: 1 },
      ],
    },
    {
      name: 'French Baguette',
      category: 'Bread',
      price: 140,
      unitType: 'piece',
      bestBeforeHours: 24,
      batchYield: 25,
      stockLevel: 20,
      description: 'Traditional crisp French baguette with airy crumb',
      ingredients: [
        { name: "Baker's Wheat Flour", quantity: 0.35 },
        { name: 'Active Dry Yeast', quantity: 0.008 },
        { name: 'Fine Table Salt', quantity: 0.006 },
        { name: 'Brown Kraft Paper Bags', quantity: 1 },
      ],
    },
    // Pastries
    {
      name: 'Slow Rise Mandazi (Pair)',
      category: 'Pastries',
      price: 40,
      unitType: 'piece',
      bestBeforeHours: 14,
      batchYield: 60,
      stockLevel: 60,
      description: 'Cardamom and coconut-infused fluffy coastal mandazi',
      ingredients: [
        { name: "Baker's Wheat Flour", quantity: 0.08 },
        { name: 'Granulated Sugar', quantity: 0.02 },
        { name: 'Baking Powder', quantity: 0.004 },
        { name: 'Brown Kraft Paper Bags', quantity: 1 },
      ],
    },
    {
      name: 'Butter Croissant',
      category: 'Pastries',
      price: 160,
      unitType: 'piece',
      bestBeforeHours: 20,
      batchYield: 36,
      stockLevel: 30,
      description: 'Flaky, 27-layer butter croissant with honeycomb interior',
      ingredients: [
        { name: "Baker's Wheat Flour", quantity: 0.1 },
        { name: 'Unsalted Butter', quantity: 0.06 },
        { name: 'Fresh Whole Milk', quantity: 0.03 },
        { name: 'Active Dry Yeast', quantity: 0.005 },
        { name: 'Brown Kraft Paper Bags', quantity: 1 },
      ],
    },
    {
      name: 'Cinnamon Roll',
      category: 'Pastries',
      price: 170,
      unitType: 'piece',
      bestBeforeHours: 24,
      batchYield: 24,
      stockLevel: 22,
      description: 'Spiced cinnamon swirl drizzled with cream cheese glaze',
      ingredients: [
        { name: "Baker's Wheat Flour", quantity: 0.1 },
        { name: 'Granulated Sugar', quantity: 0.03 },
        { name: 'Unsalted Butter', quantity: 0.03 },
        { name: 'Fresh Whole Milk', quantity: 0.02 },
        { name: 'Brown Kraft Paper Bags', quantity: 1 },
      ],
    },
    {
      name: 'Chocolate Danish',
      category: 'Pastries',
      price: 190,
      unitType: 'piece',
      bestBeforeHours: 24,
      batchYield: 24,
      stockLevel: 18,
      description: 'Laminated pastry filled with rich Belgian dark chocolate',
      ingredients: [
        { name: "Baker's Wheat Flour", quantity: 0.09 },
        { name: 'Unsalted Butter', quantity: 0.05 },
        { name: 'Pure Cocoa Powder', quantity: 0.02 },
        { name: 'Brown Kraft Paper Bags', quantity: 1 },
      ],
    },
    // Savory & Snacks
    {
      name: 'Spiced Beef Samosa (2pcs)',
      category: 'Savory & Snacks',
      price: 100,
      unitType: 'piece',
      bestBeforeHours: 12,
      batchYield: 50,
      stockLevel: 40,
      description: 'Crispy samosas filled with lean seasoned beef and onions',
      ingredients: [
        { name: "Baker's Wheat Flour", quantity: 0.06 },
        { name: 'Minced Beef (Pastry filling)', quantity: 0.08 },
        { name: 'Fine Table Salt', quantity: 0.004 },
        { name: 'Brown Kraft Paper Bags', quantity: 1 },
      ],
    },
    {
      name: 'Chicken Pot Pie',
      category: 'Savory & Snacks',
      price: 240,
      unitType: 'piece',
      bestBeforeHours: 18,
      batchYield: 20,
      stockLevel: 15,
      description: 'Golden shortcrust pie filled with tender chicken in creamy sauce',
      ingredients: [
        { name: "Baker's Wheat Flour", quantity: 0.12 },
        { name: 'Pastry Margarine', quantity: 0.05 },
        { name: 'Chicken Breast (Pie filling)', quantity: 0.1 },
        { name: 'Fresh Whole Milk', quantity: 0.04 },
        { name: 'Pastry & Cake Boxes', quantity: 1 },
      ],
    },
    // Cakes
    {
      name: 'Black Forest Cake 1kg',
      category: 'Cakes',
      price: 2600,
      unitType: 'kg',
      bestBeforeHours: 72,
      batchYield: 6,
      stockLevel: 4,
      description: 'Layered chocolate sponge with whipped cream and cherries',
      ingredients: [
        { name: "Baker's Wheat Flour", quantity: 0.35 },
        { name: 'Pure Cocoa Powder', quantity: 0.1 },
        { name: 'Granulated Sugar', quantity: 0.25 },
        { name: 'Fresh Eggs', quantity: 6 },
        { name: 'Vanilla Extract', quantity: 0.015 },
        { name: 'Pastry & Cake Boxes', quantity: 1 },
      ],
    },
    {
      name: 'Vanilla Celebration Cake 1kg',
      category: 'Cakes',
      price: 2300,
      unitType: 'kg',
      bestBeforeHours: 72,
      batchYield: 6,
      stockLevel: 5,
      description: 'Classic moist vanilla sponge with silky vanilla buttercream',
      ingredients: [
        { name: "Baker's Wheat Flour", quantity: 0.4 },
        { name: 'Granulated Sugar', quantity: 0.3 },
        { name: 'Unsalted Butter', quantity: 0.2 },
        { name: 'Fresh Eggs', quantity: 6 },
        { name: 'Vanilla Extract', quantity: 0.02 },
        { name: 'Pastry & Cake Boxes', quantity: 1 },
      ],
    },
    {
      name: 'Red Velvet Cupcake Box (4pcs)',
      category: 'Cakes',
      price: 550,
      unitType: 'piece',
      bestBeforeHours: 48,
      batchYield: 15,
      stockLevel: 12,
      description: 'Crimson velvet cupcakes topped with cream cheese frosting',
      ingredients: [
        { name: "Baker's Wheat Flour", quantity: 0.2 },
        { name: 'Granulated Sugar', quantity: 0.15 },
        { name: 'Unsalted Butter', quantity: 0.1 },
        { name: 'Fresh Eggs', quantity: 3 },
        { name: 'Pure Cocoa Powder', quantity: 0.02 },
        { name: 'Pastry & Cake Boxes', quantity: 1 },
      ],
    },
    // Beverages
    {
      name: 'House Cappuccino',
      category: 'Beverages',
      price: 220,
      unitType: 'piece',
      bestBeforeHours: null,
      batchYield: null,
      stockLevel: null,
      description: 'Double shot of Kenyan Arabica espresso with velvety micro-foam',
      ingredients: [
        { name: 'Arabica Coffee Beans', quantity: 0.018 },
        { name: 'Fresh Whole Milk', quantity: 0.18 },
      ],
    },
    {
      name: 'Caffe Latte',
      category: 'Beverages',
      price: 240,
      unitType: 'piece',
      bestBeforeHours: null,
      batchYield: null,
      stockLevel: null,
      description: 'Smooth espresso with steamed whole milk',
      ingredients: [
        { name: 'Arabica Coffee Beans', quantity: 0.018 },
        { name: 'Fresh Whole Milk', quantity: 0.24 },
      ],
    },
    {
      name: 'Spiced Chai Latte',
      category: 'Beverages',
      price: 180,
      unitType: 'piece',
      bestBeforeHours: null,
      batchYield: null,
      stockLevel: null,
      description: 'Slow-simmered Kenyan black tea with whole spices and milk',
      ingredients: [
        { name: 'Fresh Whole Milk', quantity: 0.2 },
        { name: 'Granulated Sugar', quantity: 0.02 },
      ],
    },
  ];

  const menuItems: Array<{ id: string; name: string; price: number; category: string; batchYield: number | null }> = [];
  for (const item of menuCatalog) {
    const created = await prisma.menuItem.create({
      data: {
        name: item.name,
        category: item.category,
        price: item.price,
        unitType: item.unitType,
        bestBeforeHours: item.bestBeforeHours,
        batchYield: item.batchYield,
        stockLevel: item.stockLevel,
        description: item.description,
        isAvailable: true,
      },
    });

    for (const ing of item.ingredients) {
      const inv = inventoryMap[ing.name];
      if (inv) {
        await prisma.menuItemIngredient.create({
          data: {
            menuItemId: created.id,
            inventoryItemId: inv.id,
            quantity: ing.quantity,
          },
        });
      }
    }

    menuItems.push({
      id: created.id,
      name: created.name,
      price: created.price,
      category: created.category,
      batchYield: created.batchYield,
    });
  }
  console.log(`    Created ${menuItems.length} menu items with full ingredient recipes.`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. GENERATE 180 DAYS OF HISTORICAL SIMULATION (2026-04-01 -> 2026-09-28)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[4/9] Generating 180 days of shifts, batches, POS sales & M-Pesa records...');

  const startDate = new Date('2026-04-01T00:00:00.000Z');
  const endDate = new Date('2026-09-28T12:00:00.000Z');

  // Accumulator buffers for bulk inserts
  const attendanceBuffer: any[] = [];
  const batchBuffer: any[] = [];
  const posTransactionBuffer: any[] = [];
  const posItemBuffer: any[] = [];
  const kopoPaymentBuffer: any[] = [];
  const stockMovementBuffer: any[] = [];
  const auditEventBuffer: any[] = [];

  // Suppliers restock schedule (every ~10-14 days for bulk ingredients)
  const restockCycleDays = 12;

  let dayCursor = new Date(startDate);
  let dayIndex = 0;

  // Track transaction receipt counter
  let receiptSequence = 1000;

  const bakeableItems = menuItems.filter((m) => m.batchYield != null);

  while (dayCursor <= endDate) {
    const currentDay = new Date(dayCursor);
    const dayOfWeek = currentDay.getUTCDay(); // 0 = Sun, 5 = Fri, 6 = Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isFriday = dayOfWeek === 5;
    const dateStr = formatDate(currentDay);

    // ── A. Staff Attendance (Shifts) ──────────────────────────────────────────
    // Cashiers and kitchen staff clock in/out
    for (let sIdx = 0; sIdx < createdStaff.length; sIdx++) {
      const staffMember = createdStaff[sIdx];
      // Staff get 1 rest day per week based on index
      if (dayOfWeek === (sIdx % 7)) continue;

      // Morning shift (06:00 to 14:30) or Evening shift (12:30 to 21:00)
      const isMorning = (sIdx + dayIndex) % 2 === 0;
      const startHour = isMorning ? 6 : 12;
      const startMin = randInt(0, 20); // slight variance in check-in
      const endHour = isMorning ? 14 : 21;
      const endMin = randInt(15, 45);

      const checkInTime = new Date(currentDay);
      checkInTime.setUTCHours(startHour, startMin, 0, 0);

      const checkOutTime = new Date(currentDay);
      checkOutTime.setUTCHours(endHour, endMin, 0, 0);

      attendanceBuffer.push({
        id: randomId(),
        userId: staffMember.id,
        type: 'check_in',
        source: 'manual',
        createdAt: checkInTime,
      });

      attendanceBuffer.push({
        id: randomId(),
        userId: staffMember.id,
        type: 'check_out',
        source: 'manual',
        createdAt: checkOutTime,
      });
    }

    // ── B. Daily Production Batches ───────────────────────────────────────────
    // Kitchen logs fresh batches every morning between 04:45 and 06:15
    for (const bItem of bakeableItems) {
      const isToday = currentDay.toISOString().slice(0, 10) === endDate.toISOString().slice(0, 10);
      const yieldQty = bItem.batchYield! * (isWeekend ? randInt(2, 3) : randInt(1, 2));
      const unitPrice = bItem.price;
      const expectedRevenue = yieldQty * unitPrice;

      // AI training target: high demand on weekends, small percentage of end-of-day stales
      const soldRatio = isToday ? randFloat(0.3, 0.6) : randFloat(0.88, 0.98);
      const soldQty = Math.round(yieldQty * soldRatio);
      const soldAmount = soldQty * unitPrice;

      const batchTime = new Date(currentDay);
      batchTime.setUTCHours(5, randInt(15, 55), 0, 0);

      batchBuffer.push({
        id: randomId(),
        menuItemId: bItem.id,
        yieldQuantity: yieldQty,
        unitPrice,
        expectedRevenue,
        soldQuantity: soldQty,
        soldAmount,
        status: isToday ? 'active' : 'depleted',
        notes: isWeekend ? 'Weekend high-volume bake' : 'Standard daily morning batch',
        userId: owner.id,
        createdAt: batchTime,
      });
    }

    // ── C. Periodic Ingredient Restocking (Stock Movements) ───────────────────
    if (dayIndex % restockCycleDays === 0) {
      for (const [invName, invMeta] of Object.entries(inventoryMap)) {
        if (invName.includes('Bags') || invName.includes('Boxes')) {
          // Packaging restock
          const qty = randInt(500, 1500);
          stockMovementBuffer.push({
            id: randomId(),
            inventoryItemId: invMeta.id,
            type: 'IN',
            quantity: qty,
            reason: 'purchase',
            supplierId: invMeta.supplierId,
            reference: `INV-PKG-${dateStr}-${randInt(100, 999)}`,
            notes: 'Bi-weekly packaging materials restock',
            userId: owner.id,
            createdAt: new Date(currentDay.getTime() + 10 * 3600 * 1000),
          });
        } else if (invName.includes('Flour') || invName.includes('Sugar')) {
          // Bulk flour/sugar restock
          const qty = randInt(100, 300);
          stockMovementBuffer.push({
            id: randomId(),
            inventoryItemId: invMeta.id,
            type: 'IN',
            quantity: qty,
            reason: 'purchase',
            supplierId: invMeta.supplierId,
            reference: `INV-BULK-${dateStr}-${randInt(100, 999)}`,
            notes: 'Warehouse grain & dry ingredients replenishment',
            userId: owner.id,
            createdAt: new Date(currentDay.getTime() + 9 * 3600 * 1000),
          });
        }
      }
    }

    // Occasional minor spoilage log (e.g. spilled milk or expired dairy) once every 20 days
    if (dayIndex % 20 === 7) {
      const milkInv = inventoryMap['Fresh Whole Milk'];
      if (milkInv) {
        stockMovementBuffer.push({
          id: randomId(),
          inventoryItemId: milkInv.id,
          type: 'OUT',
          quantity: randInt(2, 5),
          reason: 'spoilage',
          supplierId: milkInv.supplierId,
          reference: `SPOIL-${dateStr}`,
          notes: 'Discarded due to cold chain temperature fluctuation',
          userId: owner.id,
          createdAt: new Date(currentDay.getTime() + 18 * 3600 * 1000),
        });
      }
    }

    // ── D. POS Transactions & M-Pesa Kopo Payments ───────────────────────────
    // Number of daily customers: 20-35 on weekdays, 35-55 on Fri/Weekends
    const baseTxCount = isWeekend ? randInt(35, 52) : isFriday ? randInt(30, 45) : randInt(20, 34);
    const dayCashier = cashierUsers[dayIndex % cashierUsers.length];

    for (let txIdx = 0; txIdx < baseTxCount; txIdx++) {
      receiptSequence++;
      const receiptNo = `SR-${dateStr}-${pad(txIdx + 1, 3)}`;

      // Realistic hours: morning peak (07:00-09:30), lunch (12:30-14:00), tea/evening (16:30-19:30)
      let txHour = 8;
      const roll = Math.random();
      if (roll < 0.45) {
        // Morning rush
        txHour = randInt(7, 9);
      } else if (roll < 0.70) {
        // Lunch rush
        txHour = randInt(12, 14);
      } else {
        // Evening rush
        txHour = randInt(16, 19);
      }
      const txMinute = randInt(0, 59);
      const txSecond = randInt(0, 59);

      const txDate = new Date(currentDay);
      txDate.setUTCHours(txHour, txMinute, txSecond, 0);

      // Payment method: 60% M-Pesa, 40% Cash
      const isMpesa = Math.random() < 0.62;
      const paymentMethod = isMpesa ? 'mpesa' : 'cash';

      // 1 to 4 basket items per transaction
      const itemCount = Math.random() < 0.5 ? 1 : Math.random() < 0.8 ? 2 : randInt(3, 4);
      let totalAmount = 0;
      const txId = randomId();

      const chosenItems: any[] = [];
      for (let c = 0; c < itemCount; c++) {
        // Pick item with bias towards bread and pastries in morning, cake/beverage in evening
        let itemPool = menuItems;
        if (txHour <= 10) {
          itemPool = menuItems.filter((m) => m.category === 'Bread' || m.category === 'Pastries' || m.category === 'Beverages');
        }
        const item = choose(itemPool.length > 0 ? itemPool : menuItems);
        const qty = item.category === 'Pastries' ? randInt(1, 4) : item.category === 'Bread' ? randInt(1, 2) : 1;
        const lineTotal = item.price * qty;
        totalAmount += lineTotal;

        posItemBuffer.push({
          id: randomId(),
          transactionId: txId,
          menuItemId: item.id,
          quantity: qty,
          price: item.price,
        });

        chosenItems.push({ menuItemId: item.id, name: item.name, quantity: qty, price: item.price });
      }

      posTransactionBuffer.push({
        id: txId,
        receiptNo,
        cashierId: dayCashier.id,
        totalAmount,
        status: 'completed',
        paymentMethod,
        createdAt: txDate,
        updatedAt: txDate,
      });

      // If M-Pesa, generate corresponding KopoPayment record
      if (isMpesa) {
        const phone = `2547${randInt(10, 99)}${randInt(100000, 999999)}`;
        const refChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const mpesaRef = Array.from({ length: 10 }, () => refChars[Math.floor(Math.random() * refChars.length)]).join('');

        kopoPaymentBuffer.push({
          id: randomId(),
          reference: `KP-${mpesaRef}`,
          location: `https://api.kopokopo.com/transactions/${randomId()}`,
          status: 'received',
          eventType: 'buygoods_transaction_received',
          amount: totalAmount,
          currency: 'KES',
          phone,
          description: `POS Sale Receipt ${receiptNo}`,
          tillNumber: '389201',
          transactionReference: mpesaRef,
          originationTime: txDate.toISOString(),
          purpose: 'pos_sale',
          posCompleted: true,
          posTransactionId: txId,
          createdAt: txDate,
          updatedAt: txDate,
        });
      }
    }

    // Advance 1 day
    dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
    dayIndex++;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. BULK INSERT PRODUCTION & POS RECORDS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log(`    Writing ${attendanceBuffer.length} staff attendance shift events...`);
  await prisma.staffAttendance.createMany({ data: attendanceBuffer });

  console.log(`    Writing ${batchBuffer.length} kitchen production batches...`);
  await prisma.productionBatch.createMany({ data: batchBuffer });

  console.log(`    Writing ${stockMovementBuffer.length} inventory supplier stock movements...`);
  await prisma.stockMovement.createMany({ data: stockMovementBuffer });

  console.log(`    Writing ${posTransactionBuffer.length} POS transactions...`);
  // Chunk inserts by 500 to avoid query payload limits
  for (let i = 0; i < posTransactionBuffer.length; i += 500) {
    await prisma.posTransaction.createMany({
      data: posTransactionBuffer.slice(i, i + 500),
    });
  }

  console.log(`    Writing ${posItemBuffer.length} POS transaction line items...`);
  for (let i = 0; i < posItemBuffer.length; i += 1000) {
    await prisma.posTransactionItem.createMany({
      data: posItemBuffer.slice(i, i + 1000),
    });
  }

  console.log(`    Writing ${kopoPaymentBuffer.length} M-Pesa Kopo Kopo payment receipts...`);
  for (let i = 0; i < kopoPaymentBuffer.length; i += 500) {
    await prisma.kopoPayment.createMany({
      data: kopoPaymentBuffer.slice(i, i + 500),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. OPERATING EXPENSES (MONTHLY & WEEKLY)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[5/9] Creating operating expenses & cost of goods records...');
  const expenseBuffer: any[] = [];
  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];

  for (const m of months) {
    const monthFirst = new Date(`${m}-02T09:00:00.000Z`);

    // Rent
    expenseBuffer.push({
      id: randomId(),
      category: 'Rent',
      amount: 120000,
      description: `Commercial Bakery Premises Rent - ${m}`,
      date: monthFirst,
      recordedBy: owner.id,
    });

    // Salaries
    expenseBuffer.push({
      id: randomId(),
      category: 'Salaries',
      amount: 220000,
      description: `Staff Payroll (Cashiers, Bakers, Driver) - ${m}`,
      date: new Date(`${m}-28T16:00:00.000Z`),
      recordedBy: owner.id,
    });

    // KPLC Electricity (High due to commercial deck ovens)
    expenseBuffer.push({
      id: randomId(),
      category: 'Utilities',
      amount: randInt(38000, 46000),
      description: `KPLC Commercial Electricity Bill - ${m}`,
      date: new Date(`${m}-10T11:00:00.000Z`),
      recordedBy: owner.id,
    });

    // Water & Sewage
    expenseBuffer.push({
      id: randomId(),
      category: 'Utilities',
      amount: randInt(7500, 9200),
      description: `Nairobi Water & Sewerage Company - ${m}`,
      date: new Date(`${m}-12T10:00:00.000Z`),
      recordedBy: owner.id,
    });

    // High Speed Fiber Internet
    expenseBuffer.push({
      id: randomId(),
      category: 'Utilities',
      amount: 6500,
      description: `Safaricom Business Fiber POS Internet - ${m}`,
      date: new Date(`${m}-05T09:00:00.000Z`),
      recordedBy: owner.id,
    });

    // Equipment maintenance & oven servicing
    expenseBuffer.push({
      id: randomId(),
      category: 'Maintenance',
      amount: randInt(12000, 22000),
      description: `Deck oven, spiral mixer servicing & kitchen ventilation filter cleaning - ${m}`,
      date: new Date(`${m}-16T14:00:00.000Z`),
      recordedBy: owner.id,
    });

    // Weekly ingredient purchases matching supplier movements
    for (let w = 1; w <= 4; w++) {
      expenseBuffer.push({
        id: randomId(),
        category: 'Ingredients',
        amount: randInt(45000, 75000),
        description: `Flour, dairy, yeast & packaging materials restock (Week ${w} ${m})`,
        date: new Date(`${m}-${pad(w * 7, 2)}T11:00:00.000Z`),
        recordedBy: owner.id,
      });
    }
  }

  await prisma.expense.createMany({ data: expenseBuffer });
  console.log(`    Logged ${expenseBuffer.length} comprehensive expense records across 6 months.`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. ONLINE CUSTOMERS & E-COMMERCE SHOP ORDERS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[6/9] Generating online shop customers & delivery orders...');

  const customerProfiles = [
    { name: 'Angela Mwangi', phone: '0712345601' },
    { name: 'Dennis Kiprop', phone: '0722345602' },
    { name: 'Linda Cheruiyot', phone: '0733345603' },
    { name: 'Kelvin Mutua', phone: '0744345604' },
    { name: 'Stephanie Otieno', phone: '0755345605' },
    { name: 'Victor Wanyama', phone: '0766345606' },
    { name: 'Beatrice Nduta', phone: '0777345607' },
    { name: 'Collins Korir', phone: '0788345608' },
    { name: 'Brenda Achieng', phone: '0799345609' },
    { name: 'Samuel Kimani', phone: '0711345610' },
  ];

  const createdCustomers: Array<{ id: string; name: string; phone: string }> = [];
  for (const cp of customerProfiles) {
    const cust = await prisma.customer.create({ data: cp });
    createdCustomers.push({ id: cust.id, name: cust.name, phone: cust.phone });
  }

  const deliveryLocations = [
    { building: 'Silverpool Condos', street: 'Lenana Road', area: 'Kilimani', floor: '4th Floor', unit: 'B4', lat: -1.2921, lng: 36.7865 },
    { building: 'The Mirage Towers', street: 'Chiromo Road', area: 'Westlands', floor: '7th Floor', unit: 'Suite 702', lat: -1.2673, lng: 36.8052 },
    { building: 'Greenhouse Mall Offices', street: 'Ngong Road', area: 'Kilimani', floor: '2nd Floor', unit: 'Unit 204', lat: -1.3005, lng: 36.7818 },
    { building: 'Valley View Office Park', street: 'City Park Drive', area: 'Parklands', floor: 'Tower B, 3rd Floor', unit: 'B3', lat: -1.2589, lng: 36.8251 },
    { building: 'Orchid Heights', street: 'Gatundu Close', area: 'Kileleshwa', floor: '1st Floor', unit: 'A12', lat: -1.2785, lng: 36.7915 },
    { building: 'Karen Plains Villas', street: 'Karen Road', area: 'Karen', floor: 'Ground Floor', unit: 'House 14', lat: -1.3211, lng: 36.7118 },
  ];

  const shopOrderBuffer: any[] = [];
  const shopOrderItemBuffer: any[] = [];

  // 1 to 2 shop orders every 3 days across 180 days (~90 orders)
  let shopOrderSeq = 500;
  for (let d = 5; d < 180; d += randInt(2, 4)) {
    const orderDate = new Date(startDate);
    orderDate.setUTCDate(orderDate.getUTCDate() + d);
    orderDate.setUTCHours(randInt(9, 16), randInt(0, 59), 0, 0);

    const isToday = orderDate.toISOString().slice(0, 10) === endDate.toISOString().slice(0, 10);
    const customer = choose(createdCustomers);
    const isDelivery = Math.random() < 0.7;
    const loc = isDelivery ? choose(deliveryLocations) : null;

    shopOrderSeq++;
    const orderId = randomId();
    const receiptNo = `ORD-${formatDate(orderDate)}-${shopOrderSeq}`;

    let status = 'delivered';
    if (!isDelivery) {
      status = 'picked_up';
    }
    if (isToday) {
      status = isDelivery ? 'out_for_delivery' : 'ready_for_pickup';
    }

    // 1 to 3 items ordered
    const itemCount = randInt(1, 3);
    for (let k = 0; k < itemCount; k++) {
      const item = choose(menuItems);
      const qty = item.category === 'Cakes' ? 1 : randInt(1, 3);
      shopOrderItemBuffer.push({
        id: randomId(),
        orderId,
        menuItemId: item.id,
        name: item.name,
        unitType: item.category === 'Cakes' ? 'kg' : 'piece',
        quantity: qty,
        unitPrice: item.price,
      });
    }

    shopOrderBuffer.push({
      id: orderId,
      customerId: customer.id,
      fulfillmentType: isDelivery ? 'delivery' : 'pickup',
      status,
      receiptNo,
      deliveryUserId: isDelivery ? deliveryDriver.id : null,
      buildingName: loc?.building || null,
      street: loc?.street || null,
      area: loc?.area || null,
      floor: loc?.floor || null,
      unit: loc?.unit || null,
      latitude: loc?.lat || null,
      longitude: loc?.lng || null,
      createdAt: orderDate,
      updatedAt: orderDate,
    });
  }

  await prisma.shopOrder.createMany({ data: shopOrderBuffer });
  await prisma.shopOrderItem.createMany({ data: shopOrderItemBuffer });
  console.log(`    Created ${shopOrderBuffer.length} customer online shop orders with delivery mapping.`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. AUDIT LOG EVENTS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[7/9] Recording realistic security and operations audit trails...');
  const auditActions = [
    { action: 'User Login', description: 'User authenticated successfully into POS Terminal', eventType: 'auth' },
    { action: 'Production Batch Created', description: 'Logged morning artisanal bread bake', eventType: 'production' },
    { action: 'Inventory Restock Received', description: 'Logged bulk ingredient delivery from Unga Holdings', eventType: 'inventory' },
    { action: 'Price Updated', description: 'Updated promotional weekend pastry pricing', eventType: 'menu' },
    { action: 'Staff Shift Started', description: 'Clocked in for morning shift counter service', eventType: 'attendance' },
  ];

  for (let d = 0; d < 180; d += 2) {
    const aDate = new Date(startDate);
    aDate.setUTCDate(aDate.getUTCDate() + d);
    aDate.setUTCHours(randInt(6, 18), randInt(0, 59), 0, 0);

    const aStaff = choose(createdStaff);
    const chosenAction = choose(auditActions);

    auditEventBuffer.push({
      id: randomId(),
      eventType: chosenAction.eventType,
      userType: aStaff.role,
      userId: aStaff.id,
      userName: aStaff.name,
      userEmail: aStaff.email,
      action: chosenAction.action,
      description: chosenAction.description,
      ipAddress: '192.168.1.105',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SlowRisePOS/2.0',
      timestamp: aDate,
      createdAt: aDate,
    });
  }

  await prisma.auditEvent.createMany({ data: auditEventBuffer });
  console.log(`    Recorded ${auditEventBuffer.length} historical audit events.`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. SUMMARY & VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[8/9] Aggregating simulation results...');
  const totalTx = await prisma.posTransaction.count();
  const totalBatches = await prisma.productionBatch.count();
  const totalRevenueResult = await prisma.posTransaction.aggregate({ _sum: { totalAmount: true } });
  const totalExpensesResult = await prisma.expense.aggregate({ _sum: { amount: true } });
  const totalMpesaCount = await prisma.kopoPayment.count();
  const totalAttendance = await prisma.staffAttendance.count();
  const totalOrders = await prisma.shopOrder.count();

  const totalRev = totalRevenueResult._sum.totalAmount || 0;
  const totalExp = totalExpensesResult._sum.amount || 0;
  const netProfit = totalRev - totalExp;

  console.log('\n================================================================');
  console.log('  6-MONTH SIMULATION COMPLETE! METRICS SUMMARY:');
  console.log('================================================================');
  console.log(`  Total POS Transactions:    ${totalTx.toLocaleString()}`);
  console.log(`  M-Pesa Payments Matched:   ${totalMpesaCount.toLocaleString()}`);
  console.log(`  Production Batches:        ${totalBatches.toLocaleString()}`);
  console.log(`  Staff Attendance Shifts:   ${totalAttendance.toLocaleString()}`);
  console.log(`  Customer Online Orders:    ${totalOrders.toLocaleString()}`);
  console.log(`  Total Gross POS Revenue:   KES ${totalRev.toLocaleString()}`);
  console.log(`  Total Operating Expenses:  KES ${totalExp.toLocaleString()}`);
  console.log(`  Net Operating Profit:      KES ${netProfit.toLocaleString()} (${((netProfit / (totalRev || 1)) * 100).toFixed(1)}% margin)`);
  console.log('================================================================\n');
}

main()
  .catch((err) => {
    console.error('Fatal error during historical data seeding:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
