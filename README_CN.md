# Gigaverse Agent Skill

[English → README.md](./README.md)

## 上游来源 / 归属说明
- 本仓库派生自（概念上可视为 fork）**https://github.com/Gigaverse-Games/play**。
- 本仓库作为 **distribution/hardening** 分支发布：强调 automation 的 reliability、recovery、observability 与安全默认值。

---

## Installation / 安装

仅保留两种安装方式：

### 方法 A：把仓库地址发给你的 Agent，让它直接学习
把本仓库 URL 直接丢给你的 OpenClaw / 代码 Agent，让它读取并学习（适合“先理解再改”）。

### 方法 B：手动安装到 OpenClaw workspace（推荐用于实际运行）

```bash
# 1) 进入 OpenClaw workspace 根目录
cd <YOUR_OPENCLAW_WORKSPACE>

# 2) clone 到 skills/ 下（目录名建议保持 gigaverse）
mkdir -p skills
cd skills

git clone <YOUR_REPO_URL> gigaverse

# 3) 安装 scripts 依赖
cd gigaverse/scripts
npm ci
```

---

## 1. 这是什么
这是一个面向 **Gigaverse (Abstract chain)** 的 OpenClaw 自动化技能，目标是让 Agent 以**稳定、可恢复、可观测**的方式完成：
- 进入/恢复地牢 run（Underhaul / Dungetron: 5000）
- 严格执行 pre-run gates（不可跳步、不可重排）
- 在战斗中做动作选择（charge-aware）
- 处理常见服务端不一致（actionToken 400 recovery）
- run 结束输出结构化战报（JSON），用于后续策略迭代

核心执行入口（脚本）：
- `./scripts/run-dungeon.ts`

核心“权威流程文档”（强制顺序）：
- `./references/pre-run-checklist.md`
- `./references/pre-run-gates.md`
- `./references/runbook.md`

---

## 2. 重要安全边界（必读）
### 2.1 绝对禁止提交的文件
本仓库默认要求：**任何用户凭据都不得进入 git**。
- `skills/gigaverse/credentials/jwt.txt`（standalone clone 场景对应 `./credentials/jwt.txt`）
- `skills/gigaverse/credentials/address.txt`（standalone clone 场景对应 `./credentials/address.txt`）
- `~/.secrets/*` 下任何内容（尤其是私钥/JWT/address）

仓库已提供：
- `.gitignore`（忽略 `credentials/jwt.txt` / `credentials/address.txt`）
- `./publish-check.sh`（发布前一键自检）

### 2.2 私钥与链上写入
- `purchase-juice.ts` 等脚本可能触发链上交易（需要私钥）。
- 私钥默认从 `~/.secrets/gigaverse-private-key.txt` 读取（可用 env `NOOB_PRIVATE_KEY` 覆盖）。
- **不要**把私钥粘贴进 shell 历史、聊天、issue。

---

## 3. 快速上手（按顺序）
### 3.1 必需配置（每个用户都必须改）
**A) 钱包地址**（二选一）：
- env：`GIGAVERSE_ADDRESS=0x...`
- 文件：`~/.secrets/gigaverse-address.txt`

**B) JWT**（推荐 skill-local）：
- 创建：`skills/gigaverse/credentials/jwt.txt`（standalone clone 场景对应 `./credentials/jwt.txt`）
- 内容格式：
  - `Bearer <JWT>`
  - `<JWT>`（raw）

JWT 加载优先级：
1) `GIGAVERSE_JWT` env
2) `skills/gigaverse/credentials/jwt.txt`
3) `~/.secrets/gigaverse-jwt.txt`

**C) 私钥**（仅 onchain 脚本需要）：
- `~/.secrets/gigaverse-private-key.txt`

### 3.2 安装依赖
```bash
cd skills/gigaverse/scripts
npm ci
```

### 3.3 获取 JWT（登录）
```bash
cd skills/gigaverse/scripts
./auth.sh
```

---

## 4. 运行模型（强制门禁：不可跳步）
该技能的“稳定性来源”是 **pre-run gates 的固定顺序**：

1) **Active run gate**：先查 `/game/dungeon/state`，若已有 run 必须 resume
2) **Energy gate**：
   - normal run：`>= 40`
   - juiced/3x：`>= 120`
3) **ROM claim gate**（当能量不足时）：按固定顺序 claim，直到达标，否则 abort
4) **Repair gate**：仅检查 equipped 装备；`durability==0` 必须修复，否则 abort
5) 仅 gates 全部通过才允许 `start_run`

这些规则在文档中是权威的，并在 runner 中落地。

---

## 5. 你必须知道的“可配置/可改动点”（避免别人装上就踩坑）
### 5.1 ROM ids / 顺序（账户/赛季差异点）
- 当前实现使用固定顺序（见代码与文档）。
- 如果某些 ROM 多次无增量（`energyAfter == energyBefore`），用户需要调整 ROM 顺序/可用 ROM 列表。

### 5.2 repair skip list（装备实例 ID 强绑定用户）
- gear instance id 形如 `GearInstance#...`，不同用户完全不同。
- 若遇到 `max repair count`（需要 restore）但本地未实现 restore 流程：
  - 需要换装，或把该 gear id 加入 `repair_skip_gear_ids`。

### 5.3 地址、JWT、私钥路径（环境差异点）
- 本仓库已移除绝对路径依赖，使用相对 skill 目录解析。
- 仍建议遵循统一 secrets 目录：`~/.secrets/`。

---

## 6. 现版 vs 初版（old）相对于最初版本更新了哪些地方（详细差异清单）
你现在拿到的是“经历多轮实战后硬化”的版本。下面不是概念性描述，而是**可执行层面的具体变更点**（按影响面从大到小排序）。

### 6.1 架构层：从“脚本散点”升级为“单一权威 runner”
- **old**：主要依赖分散脚本（setup/auth/mint/purchase 等），缺少统一的“run orchestration”入口。
- **现版**：新增并确立 `scripts/run-dungeon.ts` 为唯一权威执行入口：
  - 覆盖 Underhaul / 5000
  - 覆盖 normal / juiced
  - 统一 resume、pre-run gates、战斗循环、恢复策略与战报输出

### 6.2 流程层：新增“不可跳步”的 pre-run gates 体系（稳定性根因）
新增并将其作为权威流程源：
- `references/pre-run-checklist.md`（每次开局的不可跳步骨架）
- `references/pre-run-gates.md`（active-run/energy/repair 的 gate 顺序与 abort 条件）
- `references/runbook.md`（从 resume → gates → battle loop → recovery → report 的整条链路）

能力提升：
- 从“能开局”升级为“能解释、能恢复、能复现”。

### 6.3 Token/一致性层：actionToken 400 恢复协议（从易断到可恢复）
- **old**：actionToken 说明较偏文档化，缺少实战级恢复策略。
- **现版**：实现并固化恢复协议：
  - `400` 时最多重试一次
  - 优先使用服务端返回的 token
  - 解析错误文本中的 expected token（例如 `Invalid action token X != Y` → 取 `Y`）
  - 再执行 `/game/dungeon/state` resync

### 6.4 能量/ROM 层：ROM claim amount 自适应 + 本地 cache
- **old**：无系统化“ROM claim 失效/无增量”处理。
- **现版**：加入 amount candidates + 每 ROM 限制尝试次数 + 仅在能量确实增长时更新 cache。
- 效果：当服务端策略变化导致某些 amount 不再生效时，仍能继续推进到下一 ROM/下一 amount。

### 6.5 修理/装备层：equipped 判定硬化 + restore-required 识别
- **old**：repair 逻辑与“装备是否真的 equipped”的判定更弱，易误判/漏判。
- **现版**：
  - equipped 判定优先 `EQUIPPED_TO_SLOT_CID > 0`
  - fallback `IS_EQUIPPED_CID == true`
  - 对 `max repair count` 明确识别为 restore-required，并按 gate 规则 abort（不盲目循环重试）

### 6.6 策略层：分地牢策略体系化 + 版本化 + echo 处理
新增策略文档并要求“文档与实现同构”：
- `references/5000-policy.md`：从无 → vD5（no-paper siege fallback、paper budgeting、siegeHard trigger）
- `references/underhaul-policy.md`：从无 → vU7/vU7.1（siegeHardUnderhaul、SiegeHard rock ban discipline；并在实现侧加 hard guard 修复绕开点）
- `references/echo-handling.md`：疑似 echo 的独立处理范式
- `references/strategy-history.md`：策略演进与实测依据归档

### 6.7 可观测性层：结构化战报（RunReport）与复盘闭环
- **old**：缺少每局可复盘的结构化 run 输出。
- **现版**：每局输出 JSON report：
  - preRun：energyStart、romClaims、repairs、onboarding
  - snapshots：每 step 的 hp/shield/charges/lootPhase/action/lootOptions/tokenRecovery
  - summary：battleCount、lootCount、result

### 6.8 凭据与可移植性：workspace-local JWT + 文档/脚本一致化
- 统一 JWT precedence（env → skill-local → `~/.secrets`），并在 `CONFIG.md` / `SKILL.md` / `auth.sh` / `mint-direct.cjs` 等位置对齐。
- 去掉发布版里的硬编码路径与个人身份材料（JWT/address 等）。

### 6.9 文件级变化速查（新增/关键变更）
新增（old 中不存在）：
- `scripts/run-dungeon.ts`
- `references/pre-run-checklist.md`
- `references/pre-run-gates.md`
- `references/runbook.md`
- `references/echo-handling.md`
- `references/strategy-history.md`
- `references/5000-policy.md`
- `references/underhaul-policy.md`

关键变更（同名文件但语义显著升级）：
- `references/api.md`：Underhaul dungeonId 明确为 `3`；能量字段改用 `parsedData.energyValue/maxEnergy/regenPerHour` 等 live 字段
- `HEARTBEAT.md`：能量字段从 `currentEnergy` 迁移到 `energyValue`
- `CONFIG.md`/`SKILL.md`：新增 resume/gates/report/阈值/修理等可配置项与执行约束

---

## 7. 发布前检查
在公开发布前运行：
```bash
cd skills/gigaverse
./publish-check.sh
```
该脚本会检查：
- 是否遗留 `credentials/jwt.txt` / `credentials/address.txt`
- 是否存在 JWT blob（`eyJhbGci` / `Bearer eyJ`）
- 是否存在硬编码 workspace 绝对路径

---

## Documentation
完整文档请查看 `SKILL.md`。

---
