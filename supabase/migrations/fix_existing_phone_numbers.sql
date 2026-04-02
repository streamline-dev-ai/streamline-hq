-- Fix existing South African phone numbers stored in local format (0xx...)
-- to international format (27xx...).
-- Also handles numbers already prefixed with +27 that still have a leading 0 after the country code.

-- Strip non-digits and fix 0xx -> 27xx
update leads
set phone = '27' || substring(regexp_replace(phone, '[^0-9]', '', 'g') from 2)
where
  phone is not null
  and regexp_replace(phone, '[^0-9]', '', 'g') ~ '^0[0-9]{9}$';

-- Fix numbers with +27 prefix stored as +270xx (12 digits with extra 0)
update leads
set phone = '27' || substring(regexp_replace(phone, '[^0-9]', '', 'g') from 4)
where
  phone is not null
  and regexp_replace(phone, '[^0-9]', '', 'g') ~ '^270[0-9]{9}$';

-- Same fixes for alt_phone
update leads
set alt_phone = '27' || substring(regexp_replace(alt_phone, '[^0-9]', '', 'g') from 2)
where
  alt_phone is not null
  and regexp_replace(alt_phone, '[^0-9]', '', 'g') ~ '^0[0-9]{9}$';

update leads
set alt_phone = '27' || substring(regexp_replace(alt_phone, '[^0-9]', '', 'g') from 4)
where
  alt_phone is not null
  and regexp_replace(alt_phone, '[^0-9]', '', 'g') ~ '^270[0-9]{9}$';
