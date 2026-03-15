# Mini Arcade Hub

一个可扩展的网页小游戏大厅，当前内置：
- 扫雷（Minesweeper）
- 3D 赛车（Three.js / WebGL）

## 黑屏原因说明

你看到的黑屏主要是因为之前赛车页通过 CDN 直接 `import three`，在本地 `file://` 打开时，浏览器会触发模块跨域/安全策略，导致脚本不执行。

现在已改为工程化依赖：
- 赛车页 `games/racer3d/app.js` 改成 `import * as THREE from "three"`
- 通过 `Vite` 启动开发服务器和构建，避免 `file://` 模式问题

## 快速开始（工程化）

Windows 一键启动（推荐）：

```bat
start-dev.cmd
```

双击根目录 `start-dev.cmd` 也可以，脚本会自动安装依赖并启动开发服务器（自动打开浏览器）。

命令行方式：

```bash
npm install
npm run dev
```

打开终端输出的本地地址（通常是 `http://localhost:5173`）。

生产构建：

```bash
npm run build
npm run preview
```

Windows 一键预览生产包：

```bat
start-preview.cmd
```

## 操作说明

### 大厅
- 左侧底部卡片切换小游戏
- 快捷键：`1` 切扫雷，`2` 切赛车

### 扫雷
- 左键/轻触翻开
- 右键或长按插旗
- 右键数字格触发和弦

### 3D 赛车（Three.js）
- `A/D` 或 `←/→` 转向
- `W/S` 或 `↑/↓` 加减速
- `R` 重开

## 目录结构（规模化）

```text
.
├─ assets/
│  └─ styles/
│     └─ portal.css
├─ src/
│  └─ app.js
├─ games/
│  ├─ minesweeper/
│  │  ├─ index.html
│  │  ├─ style.css
│  │  └─ app.js
│  └─ racer3d/
│     ├─ index.html
│     ├─ style.css
│     └─ app.js
├─ index.html
├─ package.json
├─ vite.config.js
└─ README.md
```

## 扩展新小游戏

1. 在 `games/<game-id>/` 新建 `index.html`、`style.css`、`app.js`
2. 在 `src/app.js` 的 `GAMES` 数组注册 `id/title/desc/path`
3. 运行 `npm run dev`，大厅自动可选


## Epic 赛车架构

- 子系统拆分: Renderer / Physics / VehicleController / AIController / RaceRules / AssetPipeline
- 后处理链: Bloom + SSAO + FXAA + ToneMapping + Vignette + 色差
- 物理: Rapier 刚体与碰撞
- 模式: 2 赛道、6 AI、3 难度、锦标赛积分与本地最佳圈速

