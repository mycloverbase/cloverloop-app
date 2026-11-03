alter table public.creator_profiles
  add column if not exists contact_number text,
  add constraint creator_profiles_contact_number_format
    check (
      contact_number is null
      or (
        contact_number ~ '^[+]?[0-9][0-9 ().-]*$'
        and length(regexp_replace(contact_number, '[^0-9]', '', 'g')) between 7 and 15
      )
    );
