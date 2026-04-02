-- Add alt_phone column to store a secondary phone number
alter table leads add column if not exists alt_phone text;
