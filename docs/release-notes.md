# MyPortfolio 交付说明（封板）

| 项 | 内容 |
| --- | --- |
| 版本 | v0.1.0（首次封板） |
| 封板日期 | 2026-10-12 |
| 交付形态 | Windows 本机应用：双击 `MyPortfolio.cmd` 启动（托盘图标，无控制台窗口），双击 `退出 MyPortfolio.cmd` 或托盘菜单退出 |
| 仓库 | `myportfolio/`（独立 git 仓库，tag 见下） |
| 运行依赖 | 已随交付提供前端构建产物 `dist/` 与便携 Node 运行时 `runtime/node.exe`；日常使用不需要 npm、不需要联网 |

## 1. 交付内容

| 范围 | 内容 |
| --- | --- |
| 需求 | PRD v1.7（35 FR / 69 AC / 26 SCN / 48 DFX / 11 安全需求），拆两个 spec |
| 设计 | `.project/design/DESIGN.md` + 浅色/暗色预览；两个 spec 与对应 plan（含执行记录） |
| 实现 | 后端 51 个 TypeScript 模块、前端 10 个 Vue 组件/页面（5 个业务页面） |
| 用例 | 26 个单元测试文件（93 条）+ 2 个端到端文件（27 条 × Edge/Chrome） |
| 文档 | `README.md`、`docs/getting-started.md`、`docs/deploy.md`、`docs/data-dictionary.md`、`docs/troubleshooting.md`、`docs/dependencies.md` |
| 启动器 | `MyPortfolio.cmd`、`退出 MyPortfolio.cmd`、`launcher/{app.mjs,tray.ps1,stop.ps1,app.ico}` |
| 图标 | `public/{icon.svg,favicon.ico,app-icon.ico,icon-256.png}`，接入网页标签页、页面左上角与托盘 |

## 2. 功能清单（已交付）

1. **持仓与组合**：资产总额、分类占比（饼图仅一级分类、图例不含数值）、分类明细（小项占比/分类占比/分类总收益）、二级分类维护、成本覆盖、缓存降级标识。
2. **收益分析**：指标卡（市值/累计投入/浮动盈亏/已实现盈亏/累计收益率）、收益曲线（市值与累计收益率双线）、投资组合维度三级级联（组合 → 一级 → 二级，子级默认总计）、账户维度、近 6 个月/1/3/5 年与自定义时间段（起止日期真实参与快照过滤）、快照不足 2 条不绘曲线、前复权序列与异常样本过滤（默认 15%，可配 5%–50%）。
3. **账户与现金**：账户维护（新增/停用需二次确认、类型中文标签、空态文案）、现金账户（5 个币种、汇率折算与手工覆盖标记、负数与重名校验）。
4. **交易与现金**：八类流水（买入/卖出/现金分红/红利再投/收入/支出/转账）、移动加权平均成本、手续费双口径、现金与持仓同事务更新、超卖与现金不足拒绝、删除后 5 分钟撤销、版本号并发控制。
5. **账号与隔离**：口令加盐存储、连续 5 次错误锁定、会话 12 小时 + 闲置 2 小时、跨账号访问拒绝。
6. **数据源**：数据源开关与优先级（至少保留一个启用源、拒绝自定义地址）、连通性检测、批量刷新（场外基金排除、30 秒缓存、1 秒全局限流）、失败降级（保留最近成功数据 + 数据时间 + 失败原因、连续 3 次提示、写入日志）、场外基金仅手动刷新且当日未发布时展示上一净值。
7. **运维与偏好**：备份（按日、保留 7 天）、审计（操作前后值）、主题（浅色默认/暗色，非法值回退）、四项启动前置检查（环境版本/目录写权限/端口占用）。

## 3. 验证证据（封板基线）

| 检查 | 结果 |
| --- | --- |
| 单元测试 `npm test` | **93 / 93 通过**（26 个文件） |
| 端到端 `npx playwright test` | **54 / 54 通过**（27 用例 × Edge + Chrome） |
| 双击模式服务端到端 | **27 / 27 通过**（直接跑在构建产物服务上） |
| 构建 `npm run build` | 通过（最近一次 6.53s） |
| 门禁 `spec_gate.py` | spec-lint / plan-lint / ac-coverage(--tests) / dfx-coverage：**两 spec 共 8/8 PASS** |
| 接口自检 | `GET /api/summary` 资产总额 220057.20；`GET /api/accounts` rows=3；`POST /api/accounts` ok=true |
| 启动器自检 | 页面 200 含 MyPortfolio；`/api` 代理正常；PID 文件写入与清理、进程退出均验证通过 |
| 图标自检 | `System.Drawing.Icon(launcher/app.ico)` 加载成功；`/icon.svg`、`/favicon.ico`、`/icon-256.png` 均 200 |

## 4. 已知限制与遗留项

1. **设计退出门禁已补齐（2026-10-12）**：PRD 置 `requirements_exit_status: passed` 并给出 `requirements_baseline`；两个 spec 置 `design_exit_status: passed`、`design_baseline: .project/design/DESIGN.md`、`review_record: .project/specs/<name>/review.md`（新增两份设计评审记录，逐条记录评审对象、方式、覆盖内容、证据与发现处置）。复验结果：`design-exit` 两个 spec 均 **PASS**；连同 spec-lint / plan-lint / ac-coverage(--tests) / dfx-coverage 共 **10/10 PASS**。
2. **本轮流程复盘**：早期批量落盘脚本使用 `str.replace` 未校验替换结果，导致 `/api/accounts` 的 import 静默缺失（接口 500）；已改为「用接口自检验证」并修复。启动器在 Windows PowerShell 5.1 下先后暴露脚本编码与日志重定向两个缺陷，均已修复并纳入验证清单。
3. `public/` 构建产物已随仓库提供；**修改前端源码后需重新构建一次**才会反映到双击启动的页面。
4. 数据源页 `ready` 标记已用于「未就绪时禁用周期输入与保存」；`app.log` / `app.err.log` / `.myportfolio.pid` 已加入 `.gitignore`。
5. 端到端用例串行执行（`workers: 1`），因为所有用例共享同一内存数据库；新增用例时需注意数据污染（外币现金用例已挂到不属于「家庭总仓」的测试账户）。

## 5. 启动与退出（交付对象使用方式）

```text
启动：双击 myportfolio\MyPortfolio.cmd        → 托盘出现图标，浏览器自动打开 http://127.0.0.1:5183/
打开页面：托盘图标双击，或托盘右键「Open MyPortfolio」
查看日志：托盘右键「View log」（app.log）
退出：托盘右键「Exit MyPortfolio」，或双击 myportfolio\退出 MyPortfolio.cmd
```

接口地址 `http://127.0.0.1:8787/api/`；页面端口 5183 被占用时自动顺延，接口 8787 已运行则复用。

## 6. 封板基线（可回滚）

| 项 | 值 |
| --- | --- |
| 封板提交 | `b6fb9c9`（其后可能追加封板提交与 tag） |
| 提交总数 | 23 |
| tag | `v0.1.0` |
