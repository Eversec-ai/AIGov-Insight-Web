<div align="center">

# AIGov-Insight Web

**恒安嘉新大模型与智能体安全治理平台 - 可视化分析层**

[![Eversec](https://img.shields.io/badge/Eversec-CN-blue?link=https://www.eversec.com.cn)](https://www.eversec.com.cn) [![Eversec.AI](https://img.shields.io/badge/AIGov-Insight-green?link=https://dreamheart09.github.io/page-AstroWind/)](https://dreamheart09.github.io/page-AstroWind/) 

[![GitHub stars](https://img.shields.io/github/stars/Eversec-AI/AIGov-Insight-Web?style=social)](https://github.com/Eversec-AI/AIGov-Insight-Web/stargazers) [![GitHub forks](https://img.shields.io/github/forks/Eversec-AI/AIGov-Insight-Web?style=social)](https://github.com/Eversec-AI/AIGov-Insight-Web/network/members) [![GitHub release](https://img.shields.io/github/v/release/Eversec-AI/AIGov-Insight-Web?include_prereleases)](https://github.com/Eversec-AI/AIGov-Insight-Web/releases)

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/) [![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/) [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)](https://www.typescriptlang.org/) [![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?logo=tailwind-css)](https://tailwindcss.com/) [![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js)](https://nodejs.org/)


[English](#english) | [中文文档](#中文文档)

</div>

---

## 中文文档

### 🌟 项目简介

**AIGov-Insight Web** 是恒安嘉新大模型与智能体安全治理平台（Eversec AIGov-Insight）的可视化分析层，为安全分析师提供极致丝滑、极具视觉冲击力的观测界面。

这是一套专为新一代 AI 系统（LLM / Agent / OpenClaw / MCP / RAG）量身定制的现代化可观测工具。它就像是潜伏在 AI 大脑与双手之间的"行车记录仪"，静静地放在服务器上，不改代码、不拦截流量、不依赖证书，却能把 AI 交互的每一个微小动作都完整记录并解析。

> **注意**: 本仓库仅包含 Web 可视化层。AI 智能数据采集探针参见 [AIGov-Insight Agent](https://github.com/Eversec-ai/AIGov-Insight-Agent)。


### 🎉 v0.3.0 更新亮点

AIGov-Insight Web v0.3.0 迎来重大架构升级，从“被动观测”正式迈向“主动防御”。本次更新重构了底层交互逻辑，引入全新的 OpenClaw 智能防护中心对应针对龙虾全新的安全防护能力，在保持极致视觉体验的同时，为 AI 智能体加装了“安全刹车片”。

| 全新 UI + OpenClaw 智能防护中心  |
|:---:|
| ![Defense Hub](./docs/screenshots/defense-hub.png) |

### ✨ 核心特性

#### 🔍 全息可视化
- **实时日志监控** - 实时展示 AI 交互日志，支持动态加载
- **Dashboard 多指标仪表盘** - 一览全局态势
- **会话级全景分析** - 深入分析单个会话的完整流程
- **全流程拓扑图** - 可视化展示 AI 调用链路

#### 📊 交互式分析
- **AI 观测日志时间线** - 时间轴上的事件追踪
- **会话级时序图** - 清晰展示事件因果关系
- **进程分类分级分析** - 系统级活动追踪
- **自然语言搜索** - 智能日志检索

#### 🎯 专业能力
- **OpenClaw 可观测能力** - 支持最新 AI Agent 框架
- **系统命令执行监控** - 追踪 AI 执行的系统命令
- **多会话关联分析** - 跨会话事件关联
- **全文搜索 + Dark Mode** - 现代化用户体验

#### 🛡️ OpenClaw 智能体主动防御
- **毫秒级实时拦截** - 支持 Block（阻断）、Confirm（确认）、Warn（告警）三级防御机制。
- **热加载动态策略** - 规则变更后秒级生效，**无需重启 AI 服务**，业务零中断。
- **全场景规则覆盖** - 内置 8 大场景模板（防删库、防密钥泄露、防集群误删等），支持自定义正则匹配。
- **全系统联动** - 实时日志会话分析联动安全防护，快速转化自定义防护规则。

### 📸 功能截图

| 实时日志 + Dashboard 多指标仪表盘 | 交互式AI观测日志时间线 + 高效动态话单加载 |
|:---:|:---:|
| ![Dashboard](./docs/screenshots/dashboard.png) | ![Timeline](./docs/screenshots/timeline.png) |

| OpenClaw 安全防护概览 | OpenClaw 安全防护规则 |
|:---:|:---:|
| ![](./docs/screenshots/defense-logs.png) | ![](./docs/screenshots/rules-template.png) |

| 会话级多维度启发式分析 | 会话级全景分析 + 全流程拓扑图 |
|:---:|:---:|
| ![Alert Analysis](./docs/screenshots/alert-analysis.png) | ![Image Analysis](./docs/screenshots/img-analysis.png) |

| 会话流程分析 + 自然语言 | OpenClaw 会话级关联分析 |
|:---:|:---:|
| ![Agent Analysis](./docs/screenshots/agent-analysis.png) | ![OpenClaw Analysis](./docs/screenshots/openclaw-analysis.png) |


### 🚀 快速开始

#### 前置要求

- x86_64 架构
- Ubuntu 22.04 LTS / Windows 11
- Node.js 20+ 
- npm 或 yarn 包管理器
- [AIGov-Insight Agent](https://github.com/Eversec-ai/AIGov-Insight-Agent) 智能探针

#### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/eversec/AIGov-Insight-web.git
cd AIGov-Insight-web

# 安装依赖
npm install
# 如果有冲突
npm install --legacy-peer-deps

# 开发模式
npm run dev
# 开启调试模式，指定日志目录为 AIGov-Insight Agent 探针默认输出日志目录。
npm run dev -- --debug -d /var/log/ai-sec-agent/data/ 

# 生产模式
npm run build
npm run start

# standalone 模式
./build-package.sh -v 0.2.20 
cd dist/ && ./start.sh --debug -d /var/log/ai-sec-agent/data/

```

访问 [http://localhost:3000](http://localhost:3000) 开启全链路安全洞察之旅 🎉🎉。

### 👤 账户管理

系统提供交互式账户管理工具，支持创建、修改、删除登录账户。

#### 交互式操作（推荐）

```bash
npm run account
# 或简写
npm run acc
```

使用 **上下键** 选择操作，**回车** 确认。

#### 快捷命令

```bash
# 查看账户列表
npm run acc ls

# 创建账户
npm run acc add <用户名> <密码> [邮箱]

# 修改密码
npm run acc pwd <用户名> <新密码>

# 删除账户
npm run acc rm <用户名>
```

#### 功能说明

| 命令 | 说明 |
|------|------|
| `ls` / `list` | 查看所有账户 |
| `add` / `create` | 创建新账户 |
| `pwd` / `passwd` | 修改账户密码 |
| `rm` / `delete` | 删除账户 |

> 密码使用 bcrypt 加密存储，安全可靠。


### 🛠️ 技术栈

- **框架**: [Next.js 16](https://nextjs.org/) - React 全栈框架
- **UI**: [React 19](https://react.dev/) + [Tailwind CSS 4](https://tailwindcss.com/)
- **动画**: [Framer Motion](https://www.framer.com/motion/)
- **图表**: [Recharts](https://recharts.org/)
- **图标**: [Lucide React](https://lucide.dev/)
- **认证**: [NextAuth.js](https://next-auth.js.org/)
- **语言**: [TypeScript](https://www.typescriptlang.org/)

### 📁 项目结构

```
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── api/          # API 路由
│   │   ├── auth/         # 认证页面
│   │   └── page.tsx      # 主页面
│   ├── components/       # React 组件
│   │   ├── Dashboard.tsx
│   │   ├── TimelineView.tsx
│   │   ├── TopologyGraph.tsx
│   │   └── ...
│   ├── lib/              # 工具函数
│   ├── hooks/            # 自定义 Hooks
│   ├── context/          # React Context
│   └── types/            # TypeScript 类型
├── public/               # 静态资源
└── package.json          # 项目配置
```

### 🤝 贡献

我们欢迎所有形式的贡献！请阅读 [贡献指南](./CONTRIBUTING.md) 了解如何参与项目开发。

### 📄 许可证

本仓库遵循 [LICENSE](./LICENSE) 开源协议，该许可证本质上是 Apache 2.0，但有一些额外的限制。

### 🙏 致谢

感谢所有为这个项目做出贡献的开发者！

---

## English

### 🌟 Overview

**AIGov-Insight Web** is the visualization and analysis layer of Eversec AIGov-Insight, the world's first LLM & Agent security governance platform. It provides security analysts with a smooth, visually stunning observation interface.

This is a modern observability tool tailored for next-generation AI systems (LLM / Agent / RAG / MCP / OpenClaw). It acts like a "dashcam" placed between the AI's brain and hands - sitting quietly on the server, without modifying code, intercepting traffic, or relying on certificates, yet capturing and parsing every tiny action of AI interactions.

> **Note**: This repository only contains the Web visualization layer. The data collection probe see [AIGov-Insight Agent](https://github.com/Eversec-ai/AIGov-Insight-Agent)

### ✨ Key Features

- **Real-time Log Monitoring** - Real-time display of AI interaction logs
- **Dashboard Multi-metric Dashboard** - Overview of global security posture
- **Session-level Panoramic Analysis** - Deep analysis of complete session flows
- **Full-process Topology Graph** - Visualize AI call chains
- **Interactive Timeline** - Event tracking on timeline
- **Process Classification Analysis** - System-level activity tracking
- **OpenClaw Observability** - Support for latest AI frameworks
- **Dark Mode** - Modern user experience

### 🚀 Quick Start

First make sure the [AIGov-Insight Agent](https://github.com/Eversec-ai/AIGov-Insight-Agent) is installed and started.

```bash
# Clone the repository
git clone https://github.com/eversec/AIGov-Insight-web.git
cd AIGov-Insight-web

# Install dependencies
npm install --legacy-peer-deps

# Development mode
npm run dev
# Debug mode, '-d' set to AIGov-Insight Agent log path。
npm run dev -- --debug -d /var/log/ai-sec-agent/data/ 

# Production mode
npm run build
npm run start

# standalone mode
./build-package.sh -v 0.2.20 
cd dist/ && ./start.sh --debug -d /var/log/ai-sec-agent/data/
```

Visit [http://localhost:3000](http://localhost:3000) to view the application and start your security journey  🎉🎉.

### 👤 Account Management

Interactive account management tool for creating, modifying, and deleting login accounts.

#### Interactive Mode (Recommended)

```bash
npm run account
# or shorthand
npm run acc
```

Use **arrow keys** to select, **Enter** to confirm.

#### Quick Commands

```bash
# List accounts
npm run acc ls

# Create account
npm run acc add <username> <password> [email]

# Change password
npm run acc pwd <username> <new_password>

# Delete account
npm run acc rm <username>
```

#### Command Reference

| Command | Description |
|---------|-------------|
| `ls` / `list` | List all accounts |
| `add` / `create` | Create new account |
| `pwd` / `passwd` | Change password |
| `rm` / `delete` | Delete account |

> Passwords are encrypted with bcrypt for security.

### 📄 License

This repository is licensed under the [LICENSE](./LICENSE), based on Apache 2.0 with additional conditions.

---

<div align="center">

**[⬆ Back to Top](#AIGov-Insight-web)**

Made with ❤️ by [Eversec.ai (恒安嘉新)](https://www.eversec.com.cn/)

</div>
