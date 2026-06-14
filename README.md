# Unique & Stylish — Imitation Jewellery Website (Full Stack)

A complete jewellery e-commerce website with user accounts, shopping cart, payments (GPay / Paytm / UPI / COD) and **MongoDB storage** for registered users and all purchases.

## What gets stored in MongoDB

**`users` collection** — every account created on the website:
name, email, phone, hashed password (bcrypt), registration date.

**`orders` collection** — every purchase:
order ID, the customer's delivery details, every item with its **name (type)** and **category** (Earrings, Necklace Sets, Bridal Sets, etc.), quantity, prices, subtotal, shipping, total, payment method, status, date — and a link to the user account if they were logged in (guest checkouts are stored too, with `user: null`).

## Project structure

```
unique-stylish-fullstack/
├── server.js          → Express API + MongoDB models (users & orders)
├── package.json       → dependencies
├── .env.example       → environment config template
└── public/
    └── index.html     → the full website (frontend)
```

## Setup (5 steps)

**1. Install Node.js** (v18+) from https://nodejs.org if you don't have it.

**2. Get MongoDB** — either option works:
   - **Local:** install MongoDB Community Server from https://www.mongodb.com/try/download/community and start it.
   - **Cloud (easiest):** create a free cluster at https://www.mongodb.com/cloud/atlas, click *Connect → Drivers*, and copy the connection string.

**3. Configure:** copy `.env.example` to `.env` and set your `MONGO_URI` (and change `JWT_SECRET`).

**4. Install & run:**
```bash
cd unique-stylish-fullstack
npm install
npm start
```

**5. Open** http://localhost:5000 — the website is served by the same server, so accounts and orders save automatically.

## How it works on the website

- **👤 Login button** in the header opens the Register / Login form. New accounts are saved to MongoDB instantly.
- When a logged-in user **buys items**, the order is saved against their account; the account panel shows their full **order history** pulled from the database.
- **Guest checkout** still works — those orders are saved in MongoDB too, just without a user link.

## API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/register` | Create account → saved in `users` |
| POST | `/api/login` | Login, returns JWT token |
| GET | `/api/me` | Current user profile (auth) |
| POST | `/api/orders` | Save a purchase → saved in `orders` |
| GET | `/api/my-orders` | Logged-in user's order history |
| GET | `/api/admin/orders?key=KEY` | All orders (for you, the owner) |
| GET | `/api/admin/users?key=KEY` | All registered users |
| GET | `/api/health` | Server + DB status |

View your data anytime with MongoDB Compass (GUI) or the admin endpoints above.

## Before going live — replace these placeholders

- `public/index.html` → `WHATSAPP_NUMBER` and `UPI_ID` (top of the `<script>`)
- `.env` → real `MONGO_URI`, a strong `JWT_SECRET`, and your own `ADMIN_KEY`

## Note on login sessions

For compatibility with preview environments, the login token is kept in memory, so refreshing the page logs the user out. Once you host this on your own server, you can persist sessions by saving the token in `localStorage` (store it in `setUser()` and read it on page load) — it works normally in real browsers.

## Deploying

Render, Railway, or any Node host works: push this folder, set the `.env` values as environment variables, and use `npm start`. Pair it with MongoDB Atlas for the database.
