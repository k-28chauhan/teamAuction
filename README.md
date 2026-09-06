This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

Turf — a group of friends splitting into two fair teams for 5-a-side/6-a-side football, via a credit auction or a balanced shuffle. See `00-shared-contract.md` and `02-backend-prd.md` for the full spec this backend implements.

## Backend setup

1. Start a Postgres instance and set `DATABASE_URL`, `AUTH_SECRET`, `NODE_ENV` (copy `.env.example` to `.env.local`). A throwaway local database works well via Docker:
   ```bash
   docker run -d --name turf-db -e POSTGRES_PASSWORD=turf -e POSTGRES_DB=turf -p 55432:5432 postgres:16-alpine
   ```
2. Run migrations: `npm run db:migrate`
3. Seed sample data (a master account `master`/PIN `1234`, 15 players, 3 completed matchdays): `npm run db:seed`
4. Run the unit test suite (the draft engine and split search, no database needed): `npm test`

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
