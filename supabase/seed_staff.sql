-- Staff roster. Safe to re-run any time the list changes — matches on
-- line_user_id and updates name/institution/is_admin if they've changed,
-- inserts if new. Unlike fellows, no email/OTP: staff are trusted by LINE ID
-- alone.

insert into public.staff (full_name, institution, line_user_id, is_admin) values
  ('ปองสิทธิ์ โพธิคุณ', 'สมุทรสาคร', 'U1f7800c1ec874bb896bb11598c5ec49e', true),
  ('Staff Admin', 'สมุทรสาคร', 'Udbdae946176342d40b9a2cc117c37da3', true)
on conflict (line_user_id) do update
  set full_name = excluded.full_name,
      institution = excluded.institution,
      is_admin = excluded.is_admin;
