# 藏宝图 · 小程序地图核心代码

## 这是什么

「藏宝图」小程序的核心可行性验证代码：**Canvas 2D 自绘 2.5D 等轴测家庭地图**，
包含地图渲染、触摸命中检测、搜索高亮、点击下钻面板的完整骨架。

对应设计方案 v2.0 的 M1（数据底座）+ M2（地图画布）+ M3（搜索高亮）的核心逻辑。

## 文件结构

```
miniprogram/
├── app.json               # 页面注册
├── data/tree.js           # 位置树演示数据（接云数据库后替换）
├── utils/isomap.js        # 核心：等轴测绘制 + 命中检测（纯 Canvas 2D）
└── pages/map/
    ├── map.js / map.wxml / map.wxss
```

## 运行 MVP（最小可行版本，无需云开发）

1. 微信开发者工具 →「导入项目」→ 选择本 `miniprogram/` 目录（appid 用测试号即可）；
2. 编译即用，数据存本地（wx storage），改动即时持久化；工具菜单「清除缓存」可复位种子数据。

**MVP 已含功能**：
- 2.5D 地图浏览（卧室/客厅/阳台，Canvas 自绘）
- 点击家具逐级下钻 → 查看箱内物品
- 搜索「手套」「冬」等 → 结果列表 + 地图红圈高亮
- 任意位置添加物品（名称/数量/季节标签）与子位置/箱子
- 点击物品可取出/放回/删除（防「放了又忘」）

## 文件说明

- `utils/isomap.js` 2.5D 等轴测引擎（已由户型图取代，保留备查）
- `utils/planmap.js` 户型图（平面俯视）渲染 + 矩形命中检测
- `utils/plan3d.js` **3D 渲染引擎**（自研 Canvas 2D 光栅化：透视投影/背面剔除/画家算法/环绕相机，零依赖）
- `utils/store.js` MVP 数据层（本地存储；接云开发时只改此文件）
- `pages/map/` 首页：户型图 + 搜索高亮 + 下钻面板 + 录入表单 + 功能入口
- `pages/build/` AI 建图向导：上传户型图图片 + 环视视频 → AI 生成布局 → 拖拽校准 → 保存
- `pages/view3d/` 3D 视图：单指旋转/双指缩放/点家具看存放内容
- `utils/videoframes.js` 客户端视频抽帧（VideoDecoder）
- `cloudfunctions/analyzeHome/` 云函数：户型图+视频 → 视觉大模型 → 布局 JSON（需配 VISION_API_URL/KEY）
- 交互原型（工作区根目录）：`藏宝图-交互原型.html` / `藏宝图-视频建图原型.html`

## 接入云数据库（M1）

`data/tree.js` 中的 `TREE` 目前是内存演示数据。真实实现时拆为两个集合
（结构与设计方案 v2.0 第 8 节一致）：

- `locations`：位置树（parentId 自引用 + 家具图形坐标字段）
- `items`：物品（locationId、season、qty...）

首页 `onLoad` 时用云函数一次性拉取，在本地重建 `children` 树即可，
`isomap.js` 的绘制与命中逻辑完全不用改。

## 视频建图（L1 / M4）核心代码

| 文件 | 职责 |
|---|---|
| `utils/videoframes.js` | 客户端抽帧：VideoDecoder 按 6 个时间点解码 → RGBA → 离屏 canvas → 320×180 jpg base64 |
| `cloudfunctions/analyzeVideo/index.js` | 云函数：6 帧 + system prompt → 视觉大模型 → 结构化布局 JSON（房间/家具/置信度/子位置） |
| 交互原型 `../藏宝图-视频建图原型.html` | 完整 UX 流程：拍视频 → 抽帧 → AI 分析 → 草稿拖拽校准 → 保存 |

**接入步骤**：
1. 云函数目录右键「上传并部署」，环境变量配置 `VISION_API_URL` / `VISION_API_KEY`（任意 OpenAI 兼容多模态接口）；
2. 客户端调 `wx.cloud.callFunction({ name:'analyzeVideo', data:{ frames } })`；
3. 返回的 `layout` 映射到 isomap 引擎坐标（相对方位 → 网格坐标），渲染草稿；
4. 用户拖拽校准后，把 furniture 数组写入云数据库。

**降级链**：VideoDecoder 不兼容 → 视频传云存储 + 云函数 ffmpeg 抽帧；AI 返回解析失败 → 引导用户直接用 L0 手动摆家具（永远保底可用）。

## 已知简化（验证骨架，非生产代码）

- 触摸坐标换算按 375 宽设计稿线性映射，真机上需按 canvas 实际尺寸修正；
- 未做画布拖拽/缩放（M2 后半段再加，isomap.js 数学不受影响）；
- 高亮脉冲用 setInterval 重绘，生产建议 requestAnimationFrame（canvas.requestAnimationFrame）。
