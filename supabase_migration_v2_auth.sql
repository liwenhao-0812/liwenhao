-- =================================================================
-- 保单管理系统 - Supabase 迁移脚本 V2（接入 Supabase Auth + RLS）
-- 执行位置：Supabase Dashboard → SQL Editor → 新建查询 → 粘贴运行
-- 执行顺序：从上到下依次执行（幂等，可重复运行不会报错）
-- =================================================================

-- =================================================================
-- 1. 扩展：如果还没有 pgcrypto（一般 public schema 默认有）
-- =================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =================================================================
-- 2. 创建 user_data 表（如果之前不存在）
--    老项目若已有 user_data 表，请跳过此段到第 3 步
-- =================================================================
CREATE TABLE IF NOT EXISTS public.user_data (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  username TEXT,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  insurance_types JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- =================================================================
-- 3. ★ 新增 user_id 列（Supabase Auth 的 UUID，真正的行级隔离键）
-- =================================================================
ALTER TABLE public.user_data
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 给已有数据回填 user_id：根据 username = auth.users.email 的用户匹配
-- （如果您还没有在 Supabase Auth 里注册邮箱，可后面手动 update user_id）
UPDATE public.user_data u
SET user_id = au.id
FROM auth.users au
WHERE u.user_id IS NULL
  AND (u.username = au.email OR u.username = split_part(au.email, '@', 1));

-- 强烈建议：给 user_id 加索引 + 唯一约束（每个 auth 用户只能有 1 行）
CREATE UNIQUE INDEX IF NOT EXISTS user_data_user_id_idx ON public.user_data(user_id);

-- =================================================================
-- 4. 自动维护 updated_at 时间戳
-- =================================================================
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_timestamp_user_data ON public.user_data;
CREATE TRIGGER set_timestamp_user_data
BEFORE UPDATE ON public.user_data
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

-- =================================================================
-- 5. ★★ 启用 RLS（行级安全）—— 隔离的核心 ★★
--    不开这一步，前端改 user_id 就能读到别人数据！
-- =================================================================
ALTER TABLE public.user_data ENABLE ROW LEVEL SECURITY;

-- 删除所有老策略（避免旧策略冲突）
DROP POLICY IF EXISTS "user_data_select_self" ON public.user_data;
DROP POLICY IF EXISTS "user_data_insert_self" ON public.user_data;
DROP POLICY IF EXISTS "user_data_update_self" ON public.user_data;
DROP POLICY IF EXISTS "user_data_delete_self" ON public.user_data;

-- 读：只允许读自己 user_id 对应的行
CREATE POLICY "user_data_select_self"
  ON public.user_data
  FOR SELECT
  USING (auth.uid() = user_id);

-- 插：只能插入 user_id = 自己 id 的行
CREATE POLICY "user_data_insert_self"
  ON public.user_data
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 改：只能改自己 user_id 的行
CREATE POLICY "user_data_update_self"
  ON public.user_data
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 删：只能删自己 user_id 的行（前端没有删除按钮，但RLS保险）
CREATE POLICY "user_data_delete_self"
  ON public.user_data
  FOR DELETE
  USING (auth.uid() = user_id);

-- =================================================================
-- 6. 开启 Realtime（多设备实时同步推送依赖它）
-- =================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_data;

-- =================================================================
-- 7. Supabase Auth 设置（网页后台操作，不是 SQL）★ 管理员必做 ★
--    Authentication → Providers → Email：打开
--    Authentication → URL Configuration → Redirect URLs：
--       请添加以下所有 URL（Pages 本地/公网都要加）：
--       · http://localhost:8000
--       · http://localhost:8080
--       · http://127.0.0.1:8000
--       · https://liwenhao-0812.github.io
--       · https://liwenhao-0812.github.io/liwenhao/
--       · https://liwenhao-0812.github.io/liwenhao/baodanguanli.html
--       · 您自己的自定义域名（如果有）
--
--   （可选）Authentication → Providers → Email → Confirm email：可关闭
--        关闭后 signUp 直接返回 access_token，用户不需要去邮箱点验证链接。
--        建议开服初期关闭降低注册门槛，正式给大量陌生人用再打开。
-- =================================================================
