-- The indexer inserts swap amounts as wei (token * 1e18), which overflow BIGINT
-- (max ~9.2e18) and silently fail the insert. Use arbitrary-precision NUMERIC.
ALTER TABLE trade_history ALTER COLUMN amount_in  TYPE NUMERIC USING amount_in::numeric;
ALTER TABLE trade_history ALTER COLUMN amount_out TYPE NUMERIC USING amount_out::numeric;
