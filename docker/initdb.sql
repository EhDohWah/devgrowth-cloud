-- Runs once, when the volume is first created. The tests use their own database
-- so running them never touches development data.
CREATE DATABASE devgrowth_test OWNER devgrowth;
