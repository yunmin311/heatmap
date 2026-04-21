# Heatmap Vibe

一个本地优先（Local-first）的情绪/强度热力图记录项目：  
用 2.5D 日历网格展示每天的状态，并支持日志条目与链接关联。

## 功能概览

- 2.5D 月视图热力格（周一到周日）
- 支持按天记录日志（intensity / mood / tags / note）
- 支持给日志挂载链接（URL 或文件路径）
- 右侧面板查看某天所有日志明细
- IndexedDB 本地存储（Dexie）
- 预留 `voxel-3d` / `terrain` 视图模式入口（未实现）

## 技术栈

- React 19 + TypeScript
- Vite 8
- Three.js + @react-three/fiber + @react-three/drei
- Dexie (IndexedDB)
- date-fns

## 快速开始

> 推荐 Node.js 20+。

```bash
npm install
npm run dev
```

本地访问（默认）：

```text
http://localhost:5173
```

## 常用命令

```bash
npm run dev      # 开发
npm run build    # 构建
npm run preview  # 预览构建产物
npm run lint     # 代码检查
```

## 数据模型

### `entries`（日志主表）

- `id?: number`
- `day: string`（`yyyy-MM-dd`）
- `dimension: 'overall'`
- `intensity: number`（0..5）
- `mood?: number`（1..5）
- `tags: string[]`
- `note: string`
- `createdAt: string`（ISO）

### `links`（日志关联资源）

- `id?: number`
- `entryId: number`
- `type: 'url' | 'file' | 'command'`
- `title: string`
- `target: string`

## 交互说明

- 左侧点击某天柱体：选中该日并在右侧显示详情
- 右侧 `New log`：新增当天日志
- `Reset DB`：清空本地数据库并刷新（仅开发辅助）
- 鼠标交互（Canvas）：
  - 左键拖动：平移
  - 右键拖动：平移 + 高度方向微调
  - 中键双击：镜头复位
  - 滚轮：缩放

## 项目日志（Log）

已新增专业化日志文档：`/PROJECT_LOG.md`  
用于记录版本变化、修复项、影响范围和风险说明。

## 目前已知情况

- 当前 `lint` 存在部分历史规则问题（主要在 `HeatmapScene.tsx` 的渲染纯度与 `any`），不影响基础构建。
- 当前 `build` 可通过。

## 后续建议（小步迭代）

- 完成 3D/Terrain 视图渲染分支
- 给日志表单加入更明确的输入校验提示
- 增加导出/备份本地日志能力
