const requiredVersion = "016";
const enforce =
  process.env.VERCEL_ENV === "production" ||
  process.env.PULSEFY_ENFORCE_FINANCIAL_MIGRATIONS === "true";

if (!enforce) {
  process.exit(0);
}

if (process.env.PULSEFY_FINANCIAL_MIGRATIONS_APPLIED !== requiredVersion) {
  console.error(
    `Financial migration guard failed: apply migrations 014 → 015 → ${requiredVersion} ` +
      "with the controlled migration process, verify them, then set " +
      `PULSEFY_FINANCIAL_MIGRATIONS_APPLIED=${requiredVersion} for the production build. ` +
      "db:push alone is not sufficient."
  );
  process.exit(1);
}
