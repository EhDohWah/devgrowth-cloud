-- devgrowth-core 1.1.0 adds two event types: `session_delete` (a tombstone that
-- removes a session and makes every client recompute its stats) and
-- `session_edit` (replaces a session's message).
--
-- 001 declared the allowed types as an inline CHECK on events.type. Postgres
-- gave it a generated name, and it is the only CHECK on this table, so drop
-- whichever CHECK exists rather than assuming a name, then add the wider one.

DO $$
DECLARE
  existing text;
BEGIN
  FOR existing IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'events'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE events DROP CONSTRAINT %I', existing);
  END LOOP;
END
$$;

ALTER TABLE events
  ADD CONSTRAINT events_type_check CHECK (type IN (
    'session', 'review', 'milestone_check', 'config_snapshot', 'baseline',
    'session_delete', 'session_edit'
  ));
