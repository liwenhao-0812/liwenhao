-- ============================================
-- 保单管理系统 - Supabase 数据库迁移脚本
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 1. 用户数据表：存储每个用户的保单、提醒、险种库
CREATE TABLE IF NOT EXISTS user_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  reminders JSONB NOT NULL DEFAULT '[]'::jsonb,
  insurance_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 更新时间自动触发器
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_data_updated_at ON user_data;
CREATE TRIGGER user_data_updated_at
  BEFORE UPDATE ON user_data
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 3. 启用 Row Level Security
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

-- 4. RLS 策略：允许所有操作（个人使用，anon key 足够）
--    先删除旧策略再重建，避免冲突
DROP POLICY IF EXISTS "允许所有操作" ON user_data;
CREATE POLICY "允许所有操作" ON user_data
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 5. 启用实时订阅（Realtime）
--    注意：执行此脚本后，还需要手动在 Dashboard 中启用 Realtime：
--    Database → Replication → 找到 user_data 表 → 点击开关启用
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE user_data;
  END IF;
END $$;

-- 6. 创建索引
CREATE INDEX IF NOT EXISTS idx_user_data_username ON user_data(username);
CREATE INDEX IF NOT EXISTS idx_user_data_updated_at ON user_data(updated_at DESC);