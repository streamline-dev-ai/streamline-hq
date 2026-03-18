ALTER TABLE leads
ADD COLUMN IF NOT EXISTS language text DEFAULT 'english'
CHECK (language IN ('english', 'afrikaans'));

