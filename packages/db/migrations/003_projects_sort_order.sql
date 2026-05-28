ALTER TABLE projects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows with their creation order so initial UI matches
-- what users have been seeing (oldest first). Multiply by 1000 to leave
-- room between entries for cheap insertions, even though reorder() always
-- rewrites the full slice.
UPDATE projects
SET sort_order = (
  SELECT (rn - 1) * 1000
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
    FROM projects
  ) ordered
  WHERE ordered.id = projects.id
);

CREATE INDEX projects_sort_order ON projects(sort_order) WHERE deleted_at IS NULL;
