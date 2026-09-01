# 保单管理系统 - Code Wiki 文档

---

## 目录

1. [项目概述](#1-项目概述)
2. [整体架构](#2-整体架构)
3. [技术栈与依赖](#3-技术栈与依赖)
4. [文件结构说明](#4-文件结构说明)
5. [核心数据模型](#5-核心数据模型)
6. [主要模块详解](#6-主要模块详解)
7. [关键函数说明](#7-关键函数说明)
8. [存储与同步机制](#8-存储与同步机制)
9. [项目运行方式](#9-项目运行方式)
10. [部署与配置指南](#10-部署与配置指南)
11. [常见问题与扩展点](#11-常见问题与扩展点)

---

## 1. 项目概述

### 1.1 项目简介

**保单管理系统**是一套面向保险理财顾问的个人工作台SaaS系统（纯前端实现），集成了客户保单管理、保险分红收益试算、销售话术流程导航三大核心功能。系统支持本地加密存储 + Supabase云端同步 + GitHub备份的三级数据安全架构，并提供PWA及Android APK两种移动端交付形态。

### 1.2 核心能力

| 能力模块 | 功能说明 |
|---------|---------|
| 客户保单管理 | 客户档案、家庭成员、保单CRUD、联系跟进历史、险种库管理 |
| 数据仪表盘 | 客户数/保单数/保费/保额统计、险种分布可视化、生存金到期提醒 |
| 收益试算计算器 | 年金/分红险收益模拟、万能账户追加、银行存款对比、多场景(低/中/高)推演 |
| 销售话术导航 | 树形话术节点管理、节点编辑、上下文面包屑导航、多分类标签 |
| 多端同步 | localStorage加密本地存储、Supabase PostgreSQL云同步+实时订阅、GitHub仓库冷备份 |
| 用户系统 | 用户名密码注册登录、密码本地哈希、多用户数据物理隔离 |

### 1.3 目标用户

保险代理人、理财顾问、独立保险经纪人

---

## 2. 整体架构

### 2.1 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                        前端浏览器层                           │
│  ┌─────────────────┐ ┌─────────────────┐ ┌────────────────┐ │
│  │ baodanguanli    │ │ fenhongjisuanqi │ │ sales_script   │ │
│  │  (主系统)       │ │  (分红计算器)   │ │  (话术导航)    │ │
│  └────────┬────────┘ └────────┬────────┘ └───────┬────────┘ │
│           │                   │                   │          │
│           └───────────────────┼───────────────────┘          │
│                               ▼                              │
│                    ┌────────────────────┐                    │
│                    │  数据抽象层 (JS)    │                    │
│                    │ secureGet/Set      │                    │
│                    └───┬────────────┬───┘                    │
│                        │            │                        │
│              ┌─────────▼──┐   ┌────▼──────────┐             │
│              │ localStorage│   │ CDN Libraries │             │
│              │ (加密存储)   │   │ Supabase JS   │             │
│              └─────────┬───┘   │ Chart.js      │             │
│                        │       │ Decimal.js    │             │
└────────────────────────┼───────┴──────┬───────┴─────────────┘
                         │              │
         ┌───────────────▼────┐   ┌────▼─────────────┐
         │  Supabase Cloud    │   │  GitHub API      │
         │  PostgreSQL        │   │  Repository      │
         │  + Realtime        │   │  (冷备份/跨设备) │
         └────────────────────┘   └──────────────────┘
```

### 2.2 设计理念

- **零后端依赖**：核心业务全部运行在浏览器端，无需自建服务器
- **渐进式增强**：无云配置时纯本地可用，配置后自动开启云同步
- **数据安全三重保护**：本地XOR加密 → Supabase行级安全 → GitHub私有库备份
- **单文件模块化**：每个页面自包含HTML+CSS+JS，便于独立维护和分发

---

## 3. 技术栈与依赖

### 3.1 前端技术栈

| 类别 | 技术 | 版本/说明 | 用途 |
|-----|------|----------|------|
| 基础语言 | HTML5 / CSS3 / ES6 JavaScript | - | 页面结构、样式、业务逻辑 |
| UI字体 | Noto Sans SC | Google Fonts CDN | 中文界面字体 |
| 图标方案 | Unicode Emoji | - | 按钮图标、状态指示 |
| 设计风格 | 金融蓝深色主题 | `#1a2744` 主色 | 专业、稳重的视觉风格 |

### 3.2 第三方库（CDN引入）

| 库名称 | 引入地址 | 作用模块 | 说明 |
|-------|---------|---------|------|
| **@supabase/supabase-js** | `@supabase/supabase-js@2` | 主系统 | Supabase客户端SDK，提供数据库操作和Realtime订阅 |
| **decimal.js** | `decimal.js@10.4.3` | 分红计算器 | 高精度十进制运算，避免金融计算浮点误差 |
| **chart.js** | `chart.js@4.4.0` | 分红计算器 | Canvas图表库，绘制收益曲线和对比图 |

### 3.3 后端/云服务

| 服务 | 用途 | 可替换性 |
|-----|------|---------|
| **Supabase (PostgreSQL)** | 主云同步存储 + Realtime实时订阅 | 可通过设置页配置任意项目 |
| **GitHub Contents API** | 跨设备数据恢复 + 冷备份 | 可配置任意Token |
| **PWA Service Worker** | 已禁用(自毁版本) | 如需离线缓存可重新启用 |

### 3.4 移动端

| 产物 | 说明 |
|-----|------|
| `baodan-app.apk` | Android安装包，基于WebView打包 |
| `manifest.json` | PWA清单，支持添加到桌面 |

---

## 4. 文件结构说明

### 4.1 根目录文件清单

```
/workspace/
├── index.html                     # [入口] 跳转页，自动重定向到主系统
├── baodanguanli.html              # [核心] 保单管理主系统 (~5000行)
├── fenhongjisuanqi.html           # [工具] 分红收益试算计算器
├── sales_script.html              # [工具] 销售话术流程导航
│
├── manifest.json                  # PWA应用清单
├── sw.js                          # Service Worker(自毁版，已禁用缓存)
├── supabase_migration.sql         # Supabase数据库建表/迁移脚本
│
├── icon-192.png                   # PWA图标 192x192
├── icon-512.png                   # PWA图标 512x512
├── apk-qrcode.png                 # APK下载二维码
├── baodan-app.apk                 # Android安装包
│
├── .uploads/                      # 用户上传资源目录
│   └── 保单备份_*.json            # 用户手动导出的数据备份
│
└── .trae-html-share-packages/     # 共享打包目录(部署用)
```

### 4.2 页面路由关系

```
index.html (302跳转)
    └──→ baodanguanli.html (主系统)
              ├── 导航栏 ───→ fenhongjisuanqi.html (新窗口)
              ├── 侧边按钮 ───→ sales_script.html (侧边抽屉/新窗口)
              └── 登录页 → 仪表盘/查询/险种库/设置/管理员
```

---

## 5. 核心数据模型

### 5.1 实体关系图

```
┌──────────────┐       1:N       ┌──────────────┐
│    Client    │────────────────→│    Policy    │
│  (投保人/客户)│                 │   (保单)      │
├──────────────┤                 ├──────────────┤
│ name         │ 1:N             │ policyCode   │
│ idCard       │────────────┐    │ insuranceName│
│ phone        │            │    │ codeType     │
│ address      │            │    │ status       │
│ workCompany  │            ▼    │ annualPremium│
│ workAddress  │     ┌──────────┐│ sumInsured   │
├──────────────┤     │  Family  ││ effectiveDate│
│ policies[]   │     │  Member  ││ maturityDate │
│ familyMembers│────▶│ (家庭成员)││ insured      │
│ contactHist[]│ 1:N ├──────────┤│ hasDividend  │
└──────────────┘     │ name     ││ survivalBen. │
                     │ relation │└──────────────┘
                     │ idCard   │        │
                     └──────────┘        ▼
                                ┌──────────────┐        ┌──────────────┐
                                │SurvivalBenefi│        │InsuranceType │
                                │ (生存金)      │        │  (险种库项)   │
                                ├──────────────┤        ├──────────────┤
                                │ type         │        │insuranceName │
                                │ amount       │        │ codeType     │
                                │ startDate    │        └──────────────┘
                                │ nextDate     │
                                └──────────────┘
```

### 5.2 数据对象详细定义

#### 5.2.1 Client (客户对象)

```javascript
{
  name: "张三",                    // String - 投保人姓名 (必填)
  idCard: "330100199001011234",   // String - 身份证号
  phone: "13800138000",            // String - 手机号
  address: "浙江省杭州市...",       // String - 家庭地址
  workCompany: "XX有限公司",        // String - 工作单位
  workAddress: "XX路XX号",          // String - 工作地址
  
  policies: [ /* Policy[] */ ],    // Array - 客户名下保单列表
  familyMembers: [                 // Array - 家庭成员
    {
      name: "李四",                 // String - 姓名
      relationship: "配偶",         // String - 关系(配偶/子女/父母等)
      idCard: "3301...",           // String - 身份证号
      phone: "139...",             // String - 电话
      note: "备注信息"              // String - 备注
    }
  ],
  contactHistory: [                // Array - 联系跟进记录
    {
      date: "20260801",            // String - 联系日期 YYYYMMDD
      status: "已加微信",           // String - 状态:未联系上/电话挂断/已加微信/面见客户
      note: "客户对年金险感兴趣"    // String - 沟通内容备注
    }
  ]
}
```

#### 5.2.2 Policy (保单对象)

```javascript
{
  policyCode: "PA2026001",         // String - 保单号
  insuranceName: "XX年金保险",      // String - 险种名称
  codeType: "NJ001",               // String - 险种代码
  mainType: "主险",                 // String - 主险/附加险
  parentPolicyCode: "",             // String - 关联主险保单号(附加险用)
  status: "有效",                   // String - 有效/失效
  
  effectiveDate: "20260101",       // String - 生效日期 YYYYMMDD
  maturityDate: "20560101",        // String - 满期日期
  paymentMethod: "年缴",            // String - 缴费方式:年缴/月缴/趸缴
  annualPremium: 50000,            // Number - 年缴保费 (元)
  sumInsured: 1000000,             // Number - 保额 (元)
  paymentTerm: "20年",              // String - 缴费期限
  paymentBank: "中国工商银行",       // String - 缴费银行
  paymentBankCard: "6222****1234", // String - 缴费银行卡号
  
  insured: "张三",                  // String - 被保险人姓名
  insuredRelation: "本人",          // String - 与投保人关系
  insuredId: "3301...",            // String - 被保人身份证
  insuredPhone: "138...",          // String - 被保人电话
  insuredAddress: "浙江省...",      // String - 被保人地址
  
  hasDividend: true,               // Boolean - 是否有分红
  survivalBenefit: {               // Object|null - 生存金配置
    type: "annual",                // String - annual(每年)/triennial(每3年)/maturity(满期)
    amount: 30000,                 // Number - 单次领取金额
    startDate: "20360101",        // String - 起领日
    lastDate: "20250101",         // String - 上次领取日
    nextDate: "20260101",         // String - 下次领取日
    note: "60岁起领"               // String - 备注
  },
  remark: "客户VIP，重点跟进"       // String - 保单备注
}
```

#### 5.2.3 InsuranceType (险种库条目)

```javascript
{
  insuranceName: "XX增额终身寿",    // String - 险种名称
  codeType: "ZE001",               // String - 险种代码
  traits: {                        // Object|null - 赔付/领取特征（双领取规则，分红型理财险可两笔钱并存）
    category: "分红险",             // String - 类别（重疾/防癌/医疗/寿险/年金/万能/意外/两全/分红/教育金/其他）
    waitingPeriod: "180",          // String - 等待期天数
    // 第①笔钱：生存金/年金规则
    annuityStart: "afterYears",    // '' | 'none' | 'afterYears' | 'atAge' | 'fixedDate'
    annuityStartVal: "5",          // String - 起领数值（N年/岁/指定期限）
    annuityFreq: "annual",         // '' | annual/semiannual/quarterly/monthly/triennial/lumpsum
    // 第②笔钱：分红金规则（分红型理财险特有）
    dividendStart: "nextYear",     // '' | 'none' | 'nextYear' | 'afterYears' | 'fixedDate'
    dividendStartVal: "",          // String - 分红起领数值（nextYear时为空）
    dividendFreq: "annual",        // '' | annual/semiannual/quarterly/monthly/lumpsum
    note: "..."                    // String - 其他赔付特征备注
  }
}
```

#### 5.2.4 User (系统用户)

```javascript
{
  username: "liwenhao",            // String - 用户名
  passwordHash: "Habc123xyz",      // String - simpleHash 加盐哈希
  createdAt: "2026-01-01T...",     // String - ISO创建时间
  lastLogin: "2026-08-14T..."      // String - 最后登录时间
}
```

---

## 6. 主要模块详解

### 6.1 模块一：保单管理主系统 (baodanguanli.html)

主系统是单页应用(SPA)，通过Tab切换6大功能面板。

#### 6.1.1 界面布局结构

```
┌─────────────────────────────────────────────────────┐
│  顶部Top-Bar (Logo + 用户名 + 设置/退出按钮)         │
├─────────────────────────────────────────────────────┤
│  导航Tab-Bar (首页 | 查询 | 险种库 | 设置 | 管理员)   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  内容Content区 (根据Tab动态渲染)                     │
│    ├── 首页: 统计卡片 + 生存金提醒 + 险种柱状图      │
│    ├── 查询: 左侧客户列表 + 右侧客户详情保单面板     │
│    ├── 险种库: 险种卡片列表 + 新增表单              │
│    ├── 设置: GitHub Token + Supabase配置 + 导入导出 │
│    └── 管理员: 用户列表(仅admin可见)                │
│                                                     │
├─────────────────────────────────────────────────────┤
│  底部Bottom-Bar (云同步状态 + 客户/保单统计)         │
└─────────────────────────────────────────────────────┘
                  右侧悬浮: 话术侧栏按钮
```

#### 6.1.2 Tab切换路由表

| Tab标识 | 页面名称 | 渲染函数 | 说明 |
|---------|---------|---------|------|
| `home` | 首页仪表盘 | `renderDashboard()` | 统计概览、到期提醒、险种分布 |
| `query` | 客户查询 | `handleSearch()` | 客户列表、筛选、详情查看 |
| `inslib` | 险种库 | `renderInsuranceTypeLib()` | 险种CRUD、自动同步 |
| `settings` | 设置页 | `initTokenStatus()` 等 | 云同步配置、数据导入导出 |
| `admin` | 管理员面板 | `renderAdminPanel()` | 仅admin用户可见 |

#### 6.1.3 客户查询页 - 双栏布局

```
┌─────────────────────────────┬───────────────────────────────────┐
│  搜索栏(关键词+筛选+排序)    │  ← 返回按钮                        │
├─────────────────────────────┤  ┌─────────────────────────────┐  │
│  客户列表                    │  │  客户姓名Hero高亮卡片         │  │
│  ┌──────────────────────┐   │  ├─────────────────────────────┤  │
│  │ 客户A (选中态active) │   │  │  客户基本信息 + 家庭成员     │  │
│  │   保单数:3 已加微信   │   │  ├─────────────────────────────┤  │
│  ├──────────────────────┤   │  │  保单详情卡片 × N            │  │
│  │ 客户B                │   │  │  ┌─────────────────────────┐│  │
│  ├──────────────────────┤   │  │  │ [险种名] 保单号+状态标签  ││  │
│  │ ...                  │   │  │  │ 保费/保额/被保人/生存金  ││  │
│  └──────────────────────┘   │  │  └─────────────────────────┘│  │
│                             │  │  + 新增保单 按钮             │  │
│                             │  └─────────────────────────────┘  │
└─────────────────────────────┴───────────────────────────────────┘
```

---

### 6.2 模块二：分红收益计算器 (fenhongjisuanqi.html)

专业级保险精算试算工具，支持多种产品形态的收益推演。

#### 6.2.1 功能分区

```
┌──────────────────────┬─────────────────────────────────────────┐
│                      │                                         │
│  左侧输入面板         │  右侧结果展示区                          │
│  (380px固定)         │                                         │
│                      │  ┌───────────────────────────────────┐  │
│  ┌────────────────┐  │  │  汇总卡片组 (现金价值/生存金/分红)  │  │
│  │基础参数        │  │  ├───────────────────────────────────┤  │
│  │ 投保年龄/性别  │  │  │  场景切换Tabs (低/中/高/SJJ)       │  │
│  │ 年缴保费       │  │  ├───────────────────────────────────┤  │
│  │ 缴费期/保障期  │  │  │  Chart.js 折线图表组              │  │
│  ├────────────────┤  │  │  · 累计投入vs领取对比             │  │
│  │生存金设置      │  │  │  · 现金价值增长曲线               │  │
│  │ 起领年龄       │  │  │  · 万能账户余额趋势               │  │
│  │ 年领金额       │  │  ├───────────────────────────────────┤  │
│  │ 额外派息比例   │  │  │  分年度数据明细表 (可滚动)         │  │
│  ├────────────────┤  │  ├───────────────────────────────────┤  │
│  │分红模式        │  │  │  银行存款对比表                    │  │
│  │ □启用分红      │  │  ├───────────────────────────────────┤  │
│  │ ○低中高利率    │  │  │  年龄投保对比(可选)               │  │
│  │ ○SJJ红利模式   │  │  └───────────────────────────────────┘  │
│  ├────────────────┤  │                                         │
│  │万能账户追加    │  │                                         │
│  │ 追加方式/金额  │  │                                         │
│  │ 追加上限比例   │  │                                         │
│  ├────────────────┤  │                                         │
│  │可选扩展        │  │                                         │
│  │ 闲置资金收益   │  │                                         │
│  │ 年龄投保对比   │  │                                         │
│  └────────────────┘  │                                         │
└──────────────────────┴─────────────────────────────────────────┘
```

#### 6.2.2 核心计算引擎

`computeScenario(params, firstYearDividend)` 为年度迭代算法：

| 年度迭代步骤 | 说明 |
|------------|------|
| 1. 当年保费计入累计缴费 | cumPremium累加 |
| 2. 生存金判断发放 | 年龄≥起领年龄 → annualSurvivalBenefit入账 |
| 3. 额外派息判断 | 起领首年 → annualPremium × extraDividendRate |
| 4. 红利计算 | SJJ多项式 or 累计红利 × 当年利率 |
| 5. 万能账户二次增值 | (base余额 + 追加) × secondaryInterestRate |
| 6. 闲置资金对比 | 银行定存对比组：累计保费 × bankRate |
| 7. 追加保费判断 | addMethod=annual/monthly + 上限校验 |
| 8. 年度提取 | annualWithdrawal从万能账户扣除 |

---

### 6.3 模块三：销售话术导航 (sales_script.html)

树形结构的销售话术流程管理工具，支持可视化编辑。

#### 6.3.1 布局结构

```
┌──────────────────────────────────────────────────────────────┐
│ Header (Logo + 编辑模式开关 + 导入导出 + 面包屑状态)          │
├───────────────┬──────────────────────────────────────────────┤
│               │                                              │
│  左: 树面板    │  右: 话术内容面板                             │
│  (420px)      │                                              │
│               │  Breadcrumb: 开场白 › 客户感兴趣 › 已有保险   │
│  ┌───────────┐│  ┌────────────────────────────────────────┐  │
│  │ 📁 根节点 ││  │ 当前节点标题 + 分类标签                  │  │
│  │  ├ 📄 子A ││  ├────────────────────────────────────────┤  │
│  │  ├ 📄 子B ││  │ 【话术正文】大字号卡片                  │  │
│  │  │  └ 📄孙││  ├────────────────────────────────────────┤  │
│  │  └ 📄 子C ││  │ 【要点备注】背景色高亮                  │  │
│  └───────────┘│  ├────────────────────────────────────────┤  │
│               │  │ 【下一步】子节点卡片列表                │  │
│  编辑模式下:   │  │  [客户认同] → 点击跳转下一层           │  │
│  +新增子节点   │  │  [客户拒绝] → ...                      │  │
│  ✕删除节点     │  └────────────────────────────────────────┘  │
└───────────────┴──────────────────────────────────────────────┘
```

#### 6.3.2 话术节点数据结构

```javascript
{
  id: "c1_1_2",                // 唯一ID，层级命名
  title: "医疗险/意外险",       // 节点标题
  script: "医疗险和意外险是基础保障...",  // 顾问实际话术
  notes: "了解产品类型，消费型vs返还型",  // 内部备注要点
  category: "需求挖掘",         // 分类标签:开场/需求挖掘/异议处理/产品推荐/结束
  children: [ /* 同结构子节点 */ ]
}
```

---

## 7. 关键函数说明

### 7.1 主系统 - 生命周期函数

| 函数名 | 文件位置 | 功能说明 |
|-------|---------|---------|
| `enterMainApp()` | [baodanguanli.html:2834](file:///workspace/baodanguanli.html#L2834-L2854) | 登录成功后主入口：初始化Supabase → 加载数据 → 自动云同步 → 渲染首页 |
| `loadUserData()` | [baodanguanli.html:2876](file:///workspace/baodanguanli.html#L2876-L2920) | 数据加载主流程：本地读取 → Supabase时间戳对比 → 自动拉取/推送 → Realtime订阅 |
| `switchTab(tab)` | 同文件 | Tab切换：更新导航高亮 → 调用对应渲染函数 → 刷新底部统计 |

### 7.2 主系统 - 数据CRUD函数

| 函数名 | 文件位置 | 功能说明 |
|-------|---------|---------|
| `saveClient()` | [baodanguanli.html:4262](file:///workspace/baodanguanli.html#L4262-L4312) | 保存客户(新增/编辑)：收集表单 → 构建Client对象 → 保存到三层存储 |
| `deleteClient(idx)` | 同文件 | 删除客户：二次确认 → splice → savePolicyData() |
| `savePolicy()` | [baodanguanli.html:4507](file:///workspace/baodanguanli.html#L4507) | 保存保单：表单收集 → 构建Policy → 自动同步险种库 → 触发云同步 |
| `savePolicyData()` | [baodanguanli.html:2866](file:///workspace/baodanguanli.html#L2866-L2873) | 数据统一保存入口：localStorage加密 → Supabase推送 → GitHub备份 |

### 7.3 主系统 - 云同步函数

| 函数名 | 文件位置 | 功能说明 |
|-------|---------|---------|
| `initSupabase()` | [baodanguanli.html:2239](file:///workspace/baodanguanli.html#L2239-L2266) | 创建Supabase客户端，清理旧Channel |
| `supabaseLoadData()` | [baodanguanli.html:2338](file:///workspace/baodanguanli.html#L2338-L2359) | REST API GET方式读取当前用户数据行 |
| `supabaseSaveData()` | [baodanguanli.html:2362](file:///workspace/baodanguanli.html#L2362-L2419) | UPSERT：先查存在性 → PATCH更新/POST插入 |
| `supabaseSubscribeRealtime()` | [baodanguanli.html:2423](file:///workspace/baodanguanli.html#L2423-L2460) | Realtime订阅：监听远端变化 → 自动同步localStorage → Toast提示 |
| `testSupabaseConnection()` | [baodanguanli.html:2286](file:///workspace/baodanguanli.html#L2286-L2335) | 连通性自检：GET读取 → POST写入 → DELETE清理测试数据 |
| `pushToCloud()` | [同文件 ~L3126]() | GitHub备份：读取当前数据 → 组装JSON → Base64编码 → PUT到仓库 |
| `pullFromCloud()` | 同文件 | GitHub恢复：GET Contents API → Base64解码 → 覆盖localStorage |

### 7.4 主系统 - 渲染函数

| 函数名 | 文件位置 | 功能说明 |
|-------|---------|---------|
| `renderDashboard()` | [baodanguanli.html:3404](file:///workspace/baodanguanli.html#L3404-L3506) | 首页仪表盘：8项统计卡片 + 30天生存金到期提醒 + 纯CSS柱状险种分布图 |
| `handleSearch()` | [baodanguanli.html:3536](file:///workspace/baodanguanli.html#L3536) | 查询页：关键词模糊匹配(姓名/地址/险种/代码) + 跟进状态筛选 + 多维度排序 |
| `renderInsuranceTypeLib()` | [baodanguanli.html:4783](file:///workspace/baodanguanli.html#L4783-L4812) | 险种库：syncExistingPoliciesToLib预同步 → 卡片网格渲染 → inline编辑支持 |
| `syncExistingPoliciesToLib()` | [baodanguanli.html:4667](file:///workspace/baodanguanli.html#L4667) | 从现有保单数据自动扫描补全险种库（确保录入数据不丢失） |

### 7.5 主系统 - 工具函数

| 函数名 | 文件位置 | 功能说明 |
|-------|---------|---------|
| `secureSetItem(key, val, keyHint)` | [baodanguanli.html:2585](file:///workspace/baodanguanli.html#L2585-L2604) | **加密存储**：_deriveKey派生16字节XOR密钥 → 逐字符异或 → Base64写入localStorage |
| `secureGetItem(key, keyHint)` | [baodanguanli.html:2605](file:///workspace/baodanguanli.html#L2605-L2630) | **解密读取**：Base64解码 → XOR还原 → JSON.parse；失败时尝试明文兼容降级 |
| `simpleHash(str)` | [baodanguanli.html:2473](file:///workspace/baodanguanli.html#L2473-L2481) | 简易哈希(非加密)：DJB2变种 → 36进制输出，用于密码本地存储 |
| `calcAgeFromIdCard(id, ref)` | [baodanguanli.html:2510](file:///workspace/baodanguanli.html#L2510-L2542) | 身份证解析：提取7-14位出生年月日 → 参考日期计算周岁 |
| `formatMoney(val)` | [baodanguanli.html:2504](file:///workspace/baodanguanli.html#L2504-L2507) | 金额千分位格式化，强制2位小数 |

### 7.6 计算器 - 核心函数

| 函数名 | 文件位置 | 功能说明 |
|-------|---------|---------|
| `calculate()` | [fenhongjisuanqi.html:849](file:///workspace/fenhongjisuanqi.html#L849-L946) | 试算主入口：参数收集与校验 → 多场景并行计算 → 卡片/图表/表格批量渲染 |
| `computeScenario(params, firstYearDiv)` | [fenhongjisuanqi.html:948](file:///workspace/fenhongjisuanqi.html#L948) | **年度迭代主算法**：逐保单年度模拟，涉及保费/生存金/分红/万能账户/追加/提取/银行对比共8类计算 |
| `computeSJJDividend(year, payYears, prem)` | [fenhongjisuanqi.html:771](file:///workspace/fenhongjisuanqi.html#L771-L788) | SJJ模式红利：缴费期4次多项式拟合 + 缴费后期线性外推，返回当年红利金额 |

### 7.7 话术导航 - 核心函数

| 函数名 | 文件位置 | 功能说明 |
|-------|---------|---------|
| `init()` | [sales_script.html:857](file:///workspace/sales_script.html#L857-L863) | 初始化：loadData() + buildNodeMap() + 选根节点 |
| `loadData() / saveData()` | [sales_script.html:865-888](file:///workspace/sales_script.html#L865-L888) | 话术数据持久化：localStorage读写，首次启动注入内置演示数据 |
| `getNodePath(targetId)` | [sales_script.html:899](file:///workspace/sales_script.html#L899-L913) | DFS搜索节点路径，用于面包屑导航渲染 |
| `renderNode(node, isRoot)` | [sales_script.html:927](file:///workspace/sales_script.html#L927-L956) | 递归渲染树节点：编辑态显示新增/删除按钮 |

---

## 8. 存储与同步机制

### 8.1 三级存储架构

```
┌─────────────────────────────────────────────────────────────┐
│  优先级1: 本地 localStorage (读写性能最高, 毫秒级)            │
│    · 数据格式: Base64(XOR(JSON))                             │
│    · 密钥派生: _deriveKey(username + ENC_SALT)               │
│    · Key命名: policy_data_{username} / insurance_type_lib_*  │
└────────────────────────┬────────────────────────────────────┘
                         ▼ 后台异步 (savePolicyData触发)
┌─────────────────────────────────────────────────────────────┐
│  优先级2: Supabase PostgreSQL (强一致主存储, 秒级)            │
│    · 表: user_data (username UNIQUE, JSONB列存业务数据)      │
│    · 协议: 直连 REST API (GET/PATCH/POST), 非客户端ORM       │
│    · Realtime: WebSocket监听postgres_changes, 跨设备推送     │
│    · 冲突解决: updated_at时间戳新者胜出 (Last Write Wins)    │
└────────────────────────┬────────────────────────────────────┘
                         ▼ 异步兜底 (autoSyncPush节流)
┌─────────────────────────────────────────────────────────────┐
│  优先级3: GitHub 仓库 (冷备份/迁移/跨浏览器恢复, 分钟级)       │
│    · 文件: 保单数据_{username}.json                           │
│    · 协议: GET /repos/{owner}/{repo}/contents/{path}         │
│    · 跨浏览器登录恢复: tryLoginFromCloud() 从云端验证密码哈希 │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 localStorage Key命名规范

| Key | 数据类型 | 说明 |
|-----|---------|------|
| `pms_users` | User[] | 全局用户列表(明文) |
| `pms_currentUser` | String | 当前登录用户名 |
| `policy_data_{user}` | Client[] (加密) | 用户主业务数据 |
| `policy_data_{user}_timestamp` | ISO String | 本地数据最后更新时间 |
| `insurance_type_lib_{user}` | InsuranceType[] (加密) | 险种库 |
| `gh_token_{user}` | String (加密) | GitHub PAT，keyHint独立盐值 |
| `supabase_url_{user}` / `supabase_key_{user}` | String (加密) | Supabase配置，keyHint=supabase_config |
| `sales_script_data` | ScriptNode | 话术数据(独立存储，未加密) |

### 8.3 Supabase数据库表结构

参考 [supabase_migration.sql](file:///workspace/supabase_migration.sql)：

```sql
CREATE TABLE user_data (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT UNIQUE NOT NULL,             -- 用户名(业务主键)
  data        JSONB NOT NULL DEFAULT '[]',      -- 存 clientData[]
  reminders   JSONB NOT NULL DEFAULT '[]',      -- 预留提醒字段
  insurance_types JSONB NOT NULL DEFAULT '[]',  -- 存险种库
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
-- RLS策略已开启(允许所有操作，个人使用场景)
-- Realtime Publication已添加user_data表
```

---

## 9. 项目运行方式

### 9.1 运行前提

- **无需构建工具链**：项目为纯静态HTML+CSS+JS，无Node.js/npm/打包依赖
- **仅需HTTP服务器**：因涉及localStorage、Supabase CORS、fetch API，直接双击打开(file://协议)会有部分功能受限
- **浏览器要求**：Chrome 90+ / Edge 90+ / Safari 14+ / 移动端主流浏览器（需支持ES6、fetch、btoa/atob）

### 9.2 本地快速启动方案

#### 方案A：Python内置HTTP服务器（推荐）
```bash
cd /workspace
# Python 3
python3 -m http.server 8080
# 访问 http://localhost:8080
```

#### 方案B：Node.js（如已安装）
```bash
npx serve .
# 或
npx http-server -p 8080
```

#### 方案C：PHP内置服务器
```bash
php -S localhost:8080
```

#### 方案D：VSCode Live Server插件
安装 "Live Server" 插件 → 右键 `index.html` → "Open with Live Server"

### 9.3 部署到生产环境

#### 静态托管平台（任选其一）

| 平台 | 部署步骤 | HTTPS | 自定义域 |
|-----|---------|-------|---------|
| **GitHub Pages** | 推送到仓库 → Settings → Pages → 选分支 | ✅ | ✅ |
| **Vercel** | `vercel --prod` 一键部署 | ✅ | ✅ |
| **Netlify** | 拖拽文件夹到 app.netlify.com/drop | ✅ | ✅ |
| **Cloudflare Pages** | 连接Git仓库 → 框架选择"None" → 部署 | ✅ | ✅ |
| **Nginx/Apache** | 上传 `/workspace` 所有文件到 `www/` 目录 | 手动配置 | ✅ |

**部署最小文件集**（仅需这些即可运行）：
```
index.html
baodanguanli.html
fenhongjisuanqi.html
sales_script.html
manifest.json
icon-192.png
icon-512.png
```

### 9.4 首次使用流程

```
浏览器打开 → index.html → 自动跳转到登录页
                        ↓
            [注册Tab] → 用户名+密码(≥6位) → 注册成功
                        ↓
            [登录Tab] → 输入账号 → 进入主系统
                        ↓
            (可选) 设置页 → 配置Supabase URL+Key → 连接测试
            (可选) 设置页 → 配置GitHub Token → 开启冷备份
                        ↓
            查询页 → 添加客户 → 添加保单 → 开始使用
```

### 9.5 初始化管理员账号

系统内置特殊用户名 `admin`，登录后自动显示「管理员面板」Tab，可查看所有用户的数据量统计。
首次使用先注册一个用户名为 `admin` 的账号即可。

### 9.6 Supabase后端初始化步骤

1. 注册 supabase.com → 新建项目 → 选择区域
2. SQL Editor → 粘贴执行 [supabase_migration.sql](file:///workspace/supabase_migration.sql) 全部内容
3. Dashboard → Database → Replication → 启用 `user_data` 表的Realtime（WebSocket实时同步）
4. Dashboard → Project Settings → API → 复制 `Project URL` 和 `anon public` key
5. 进入系统设置页 → Supabase配置 → 粘贴URL和Key → 保存 → 连接测试通过即可

---

## 10. 部署与配置指南

### 10.1 可配置项清单

#### 内置常量（需修改HTML源码）

| 常量名 | 文件位置 | 默认值 | 说明 |
|-------|---------|--------|------|
| `SUPABASE_DEFAULTS` | baodanguanli.html L2234 | YOUR_PROJECT_ID | 首次进入时的默认Supabase配置 |
| `GITHUB_OWNER` / `GITHUB_REPO` / `GITHUB_BRANCH` | L2930-2932 | `liwenhao-0812/liwenhao/master` | GitHub备份仓库，建议改为自有私有仓库 |
| `ENC_SALT` | L2566 | `PMSecureVault_2024_X7k9` | XOR加密盐值，建议首次部署修改并保持一致 |

#### 用户级配置（系统设置页配置，无需改代码）

| 配置项 | 说明 | 获取方式 |
|-------|------|---------|
| GitHub Personal Token | 跨浏览器恢复/冷备份 | github.com → Settings → Developer settings → PAT (classic) → 勾选`repo`权限 |
| Supabase Project URL | 云同步主存储 | Supabase Dashboard → Settings → API |
| Supabase Anon Key | 云同步公钥 | 同上 |

### 10.2 Android APK签名与更新

项目已提供 `baodan-app.apk`，如需重新打包：
1. 使用 Capacitor / Cordova / PWABuilder 将 baodanguanli.html 包装为 Android App
2. App内WebView需允许 `localStorage`、`third-party cookies`、跨域请求
3. 配置 `WebViewClient` + `WebChromeClient` 启用 file input、alert等原生交互

---

## 11. 常见问题与扩展点

### 11.1 常见问题 FAQ

**Q1: 为什么有些浏览器打开后登录后刷新就登出？**
A: 检查是否禁用了localStorage/cookies，或是否使用了隐私/无痕模式。无痕模式下部分浏览器会话结束后清空localStorage。

**Q2: Supabase连接测试成功但Realtime不工作？**
A: 两步排查：① Supabase Dashboard → Database → Replication → 确认 `user_data` 已加入supabase_realtime Publication ② 确认客户端网络未屏蔽443端口WebSocket。

**Q3: 换电脑了数据怎么迁移？**
A: 三种方式任选：① 设置页 → 导出JSON → 新电脑导入；② 配置了Supabase的话直接登录自动拉取；③ 配置了GitHub Token的话，登录页输入用户名密码会触发云端验证并自动恢复数据。

**Q4: 分红计算器的SJJ模式公式哪里来的？**
A: `computeSJJDividend` 使用的是针对特定产品（SJJ系列）的历史红利数据拟合多项式，如需替换为其他产品的红利模型，修改该函数或新增模式开关即可。

**Q5: 如何新增用户字段？**
A: 同时修改三处：① saveClient()的表单收集和clientObj构建 ② editClient()的回填逻辑 ③ 对应的HTML表单元素。

### 11.2 推荐扩展开发路径

| 扩展方向 | 建议实现方式 |
|---------|-------------|
| **保费到期提醒推送** | 接入企业微信/钉钉/飞书Webhook，在renderDashboard中计算30天内缴费到期 → 调用webhook发送 |
| **多租户团队版** | 改造Supabase RLS策略：增加team_id字段 → Realtime filter改为team级别 → 新增成员邀请模块 |
| **保单OCR录入** | 接入百度/腾讯OCR API → 上传保单照片 → 解析后自动填充addPolicy表单 |
| **产品对比矩阵** | 新建compare.html，根据insuranceTypeLib关联的产品参数（需在险种库扩展字段：预定利率、保障范围、公司评级）生成对比表 |
| **客户画像标签** | 在Client对象增加`tags: []`字段 → 查询页增加标签筛选 → 首页仪表盘增加标签云 |
| **数据备份加密** | 当前secureSetItem为XOR，可升级为AES-GCM（引入crypto-js库或Web Crypto API） |

### 11.3 源码定位速查表

| 想找什么 | 跳到哪里 |
|---------|---------|
| 客户表单HTML | 搜索 `id="clientModal"` |
| 保单表单HTML | 搜索 `id="policyModal"` |
| 登录/注册HTML | 搜索 `id="authPage"` |
| Tab导航注册点 | 搜索 `<button class="nav-item"` |
| 分红计算器输入区 | 搜索 `class="left-panel"` |
| 分红计算器结果区 | 搜索 `id="resultContent"` |
| 话术树样式 | 搜索 `.tree-node-` |
| 主要样式变量 | `:root` 块 (baodanguanli.html L10-L42) |

---

**文档版本**：v1.0  
**生成日期**：2026-08-14  
**适用代码版本**：/workspace 当前快照  
