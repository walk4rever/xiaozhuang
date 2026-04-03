-- -----------------------------------------------------------------------------
-- 卦象解读缓存表 (xz_gua_interpretations)
-- key 格式："{本卦id}_{动爻位列表}" 如 "1_1,3,5"，无动爻则 "1_0"
-- -----------------------------------------------------------------------------
create table if not exists xz_gua_interpretations (
  key text primary key,
  base_interpretation text not null,
  changing_lines_guidance text not null,
  changed_interpretation text not null,
  created_at timestamptz not null default now()
);
