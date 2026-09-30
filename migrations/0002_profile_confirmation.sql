ALTER TABLE users
ADD COLUMN display_name_confirmed INTEGER NOT NULL DEFAULT 0
CHECK (display_name_confirmed IN (0, 1));
