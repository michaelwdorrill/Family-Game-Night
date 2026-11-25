CREATE TABLE family_tables (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  metadata TEXT NOT NULL CHECK (json_valid(metadata)),
  state TEXT CHECK (state IS NULL OR json_valid(state)),
  due INTEGER
);
CREATE INDEX family_tables_due ON family_tables(due) WHERE due IS NOT NULL;
