-- ============================================================
-- 迁移脚本 V3：话术系统与主系统打通
-- 功能：在 user_data 表新增 sales_scripts 列，实现话术云端同步
-- 执行方式：Supabase 控制台 → SQL Editor → 粘贴执行
-- 说明：本迁移是可选增强。未执行时系统自动回退为仅本地存储，
--       不影响保单数据的正常同步。
-- ============================================================

-- 1. 新增话术数据列（JSONB，与现有 data/insurance_types 结构一致）
ALTER TABLE public.user_data
  ADD COLUMN IF NOT EXISTS sales_scripts JSONB DEFAULT NULL;

-- 2. 更新触发器函数，同步维护 updated_at（若原触发器已覆盖则无需改动）
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. RLS 策略已存在（user_data_select_self 等），JSONB 列自动被行级安全覆盖，
--    无需新增策略 —— 话术数据与保单数据同享 user_id 隔离。

-- 4. 验证（执行后应看到 sales_scripts 列）
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'user_data' ORDER BY ordinal_position;
