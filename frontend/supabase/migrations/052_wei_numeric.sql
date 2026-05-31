-- Wei-scale amounts (token * 1e18) overflow BIGINT (max ~9.2e18) past ~9 tokens.
-- settlement.ts writes these as wei, so they must be arbitrary-precision NUMERIC.
ALTER TABLE agents ALTER COLUMN sprawl_balance         TYPE NUMERIC USING sprawl_balance::numeric;
ALTER TABLE agents ALTER COLUMN sprawl_lifetime_earned TYPE NUMERIC USING sprawl_lifetime_earned::numeric;
ALTER TABLE agents ALTER COLUMN sprawl_lifetime_spent  TYPE NUMERIC USING sprawl_lifetime_spent::numeric;
ALTER TABLE agents ALTER COLUMN last_portfolio_value   TYPE NUMERIC USING last_portfolio_value::numeric;
ALTER TABLE agents ALTER COLUMN net_pnl                TYPE NUMERIC USING net_pnl::numeric;
