-- ============================================
-- 保单管理系统 - Supabase 数据库迁移脚本
-- 在 Supabase SQL Editor 中执行此脚本（可安全重复执行）
-- ============================================

-- 0. 先处理 publication 冲突
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_data'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE user_data;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 1. 用户数据表
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

-- 3. 先禁用 RLS 确保写入权限，再重新启用
ALTER TABLE user_data DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

-- 4. RLS 策略（显式指定 TO anon 角色）
DROP POLICY IF EXISTS "允许所有操作" ON user_data;
CREATE POLICY "允许所有操作" ON user_data
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 5. 如果上面还不行，直接禁用 RLS（临时方案，个人使用足够安全）
-- ALTER TABLE user_data DISABLE ROW LEVEL SECURITY;

-- 6. 重新添加到 Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE user_data;

-- 7. 索引
CREATE INDEX IF NOT EXISTS idx_user_data_username ON user_data(username);
CREATE INDEX IF NOT EXISTS idx_user_data_updated_at ON user_data(updated_at DESC);