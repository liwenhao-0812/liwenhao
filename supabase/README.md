# AI 辅助功能 - Edge Functions 部署指南

## 概述

本目录包含两个 Supabase Edge Functions，用于实现 AI 条款解读和保单照片 OCR 解析功能。

## 前置条件

1. 已在 Supabase 控制台设置以下 Secrets：
   - `DEEPSEEK_API_KEY` - DeepSeek API 密钥
   - `QWEN_API_KEY` - 通义千问 API 密钥（备用）

2. 已安装 Supabase CLI（可选，也可通过控制台部署）

## 部署方式

### 方式一：控制台在线部署（推荐）

1. 登录 [Supabase 控制台](https://supabase.com/dashboard)
2. 进入你的项目 → Edge Functions
3. 点击 "New Function"
4. 分别创建两个 Function：

#### Function 1: interpret-clause
- Name: `interpret-clause`
- 将 `interpret-clause/index.ts` 的内容粘贴到编辑器
- 点击 Deploy

#### Function 2: parse-policy
- Name: `parse-policy`
- 将 `parse-policy/index.ts` 的内容粘贴到编辑器
- 点击 Deploy

> 注意：`_shared/cors.ts` 的内容需要内联到每个 Function 中。部署时请将 cors.ts 中的代码合并到每个 index.ts 的顶部。

### 方式二：CLI 部署

```bash
# 安装 Supabase CLI
npm install -g supabase

# 登录
supabase login

# 关联项目
supabase link --project-ref mmvjtllkichjqnxebflw

# 部署 Edge Functions
supabase functions deploy interpret-clause
supabase functions deploy parse-policy

# 设置 Secrets（如果尚未通过控制台设置）
supabase secrets set DEEPSEEK_API_KEY=sk-你的密钥
supabase secrets set QWEN_API_KEY=你的通义千问密钥
```

## 验证

部署完成后，在保单管理系统的 **设置** 页面，找到 "AI 辅助功能" 卡片，点击 "测试连接" 按钮。

如果返回 "✅ 连接正常（供应商: deepseek）" 则部署成功。

## 文件结构

```
supabase/
  functions/
    _shared/
      cors.ts          # 共享 CORS 头和 LLM 调用逻辑
    interpret-clause/
      index.ts          # 条款解读 Edge Function
    parse-policy/
      index.ts          # 保单解析 Edge Function
```

## 注意事项

- Edge Function 超时时间为 150 秒，大文件条款可能需要截取前 15000 字符
- DeepSeek API 不支持 PDF 文件直接上传，PDF 文本在前端用 pdf.js 提取后发送文本
- 通义千问作为备用供应商，DeepSeek 不可用时自动回退
- 所有 API 密钥存储在 Edge Function 环境变量中，不会暴露给浏览器
