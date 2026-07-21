-- Whitelist roster. Safe to re-run any time the fellow list changes — matches
-- on email and updates name/institution if they've changed, inserts if new.

-- One-time addition if you ran schema.sql before this column existed.
alter table public.physicians add column if not exists institution text;

insert into public.physicians (full_name, email, institution) values
  ('เวชศักดิ์ บุนนาค', 'Ping.bunnak@gmail.com', 'ภูมิพลอดุลยเดช'),
  ('คุณากร บุญปัน', 'khunakorn@nmu.ac.th', 'วชิรพยาบาล'),
  ('ชวนินทร์ เลิศพงศ์ไพบูลย์', 'chawanin@gmail.com', 'รามาธิบดี'),
  ('บุณย์พิทักษ์ ถนัดศิลปกุล', 'hoshimin1509@gmail.com', 'รามาธิบดี'),
  ('อเนชา ว่องวัฒนาศิลป์', 'anacha6386@gmail.com', 'วชิรพยาบาล'),
  ('สุพิชชา ศิลปพันธุ์', 'supitcha.s13.m@gmail.com', 'มหาราชนครราชสีมา'),
  ('สิรีธร ฉัตรเพิ่มพร', 'Sireethorn.chatpermporn@gmail.com', 'ตำรวจ'),
  ('ชวรัตน์ ศรีปน', 'Chawaratsripon@gmail.com', 'ตำรวจ'),
  ('ณัฐพงษ์ สัมฤทธิ์ทรัพย์', 'boyisi124@gmail.com', 'ธรรมศาสตร์'),
  ('วุทธ์ โรจนกิจ', 'wut.6114@gmail.com', 'เลิดสิน'),
  ('ณภัทร อยรังสฤษฎ์กูล', 'napattton@gmail.com', 'สมเด็จพระบรมราชเทวี ณ ศรีราชา'),
  ('ชลพรรษ ตั้งบุตราวงศ์', 'chonlapas@gmail.com', 'พระมงกุฎเกล้า'),
  ('พิชญ์ภัทร สุคนพาทิพย์', 'Peachyacmez@gmail.com', 'พระมงกุฎเกล้า'),
  ('ทศพล ประทีปธีรานันต์', 'earthy59955@gmail.com', 'จุฬาลงกรณ์มหาวิทยาลัย'),
  ('อภิวิชญ์ ดำนิล', 'dumnilapiwit@gmail.com', 'จุฬาลงกรณ์มหาวิทยาลัย'),
  ('พฤษพล วรลักษณ์กิจ', 'prue.wora@gmail.com', 'ภูมิพลอดุลยเดช'),
  ('วรทย์ เพ็งศรีทอง', 'V.pengsritong@gmail.com', 'ภูมิพลอดุลยเดช'),
  ('ฐานุปัติ กุลสินทรัพย์', 'thanupat.kss@gmail.com', 'ภูมิพลอดุลยเดช'),
  ('ภูริวัฒน์ เลิศสุรวัฒน์', 'Pooriwat999@gmail.com', 'สงขลานครินทร์'),
  ('ณัฐธเดชน์ ทองมั่น', 'doctorbenz2025@gmail.com', 'กรุงเทพ'),
  ('ปองสิทธิ์ โพธิคุณ', 'pong.poti@gmail.com', 'สมุทรสาคร')
on conflict (email) do update
  set full_name = excluded.full_name,
      institution = excluded.institution;
