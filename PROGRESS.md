# 开发进度缓存（接力文档）

更新时间：2026-03-16

## 目标
- 将小游戏项目升级为工程化架构（Vite 多页面）
- 扫雷保留
- 赛车升级为高质量 3D（Three.js + Rapier + 后处理）并支持锦标赛流程

## 当前完成

### 1) 工程化
- 已接入 `Vite` 多页面构建
- 已新增一键脚本：
  - `start-dev.cmd`
  - `start-preview.cmd`
- 已新增依赖：
  - `three`
  - `@dimforge/rapier3d-compat`
  - `postprocessing`

### 2) 大厅与目录规模化
- 大厅入口保留，支持小游戏切换（扫雷 / 赛车）
- 目录已拆分：
  - `games/minesweeper`
  - `games/racer3d`
  - `src`（大厅逻辑）
  - `assets/styles`（大厅样式）

### 3) 赛车重构（Epic 方向）
- 已完成子系统拆分：
  - `RendererSystem`
  - `PhysicsSystem`
  - `VehicleController`
  - `AIController`
  - `RaceRules`
  - `AssetPipeline`
  - `GameRuntime`
- 已实现：
  - 2 赛道（`Alpine Ring` / `Coastal Strike`）
  - 6 AI（同场）
  - 3 难度（rookie/pro/legend）
  - 锦标赛流程（分站结束 -> 下一站 -> 总结算）
  - 事件总线与关键事件（开始、过圈、碰撞、完赛）
  - HUD（速度/圈数/排名/赛道/难度/最佳圈速/状态）
  - 本地持久化（最佳圈速 + 锦标赛历史）

### 4) 构建状态
- `npm run build` 通过
- 当前构建体积较大（Three + Rapier + 后处理），有 chunk size warning（非阻塞）

## 关键文件（优先阅读）
- `games/racer3d/src/main.js`
- `games/racer3d/src/game-runtime.js`
- `games/racer3d/src/config.js`
- `games/racer3d/src/renderer-system.js`
- `games/racer3d/src/physics-system.js`
- `games/racer3d/src/race-rules.js`
- `games/racer3d/src/records.js`

## 下次继续建议（按优先级）
1. 视觉升级：
   - 改用本地可控 HDRI 与贴图资源
   - 加入轮胎烟雾、尾焰、碰撞火花粒子
2. 车辆手感调参：
   - 不同难度下抓地、转向、ABS/牵引辅助曲线精调
3. AI 行为提升：
   - 更稳定的超车策略与防拥堵逻辑
4. 资源与包体优化：
   - 动态导入赛车重包
   - 资源分包与延迟加载
5. 音频系统：
   - 引擎声分层、碰撞声、环境氛围

## 本地运行
```bash
npm install
npm run dev
```
或双击：`start-dev.cmd`

## 备注
- 如果出现黑屏，优先检查：
  - 是否通过 Vite 本地服务打开（不要 file://）
  - 浏览器控制台是否报资源加载错误
