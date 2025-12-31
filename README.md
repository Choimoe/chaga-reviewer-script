# 雀渣 CHAGA 牌谱分析

适用于雀渣平台的 CHAGA 牌谱分析工具，在牌谱回放时实时显示 CHAGA 推荐的候选打法和权重评分。

主要代码来自 [tziakcha/reviewer-homepage](https://github.com/tziakcha/reviewer-homepage)，本项目只是写了一点简陋的显示和简单的优化，放到了油猴脚本。

![demo](doc/img/chaga_view.jpg)

## 安装

需要先安装用户脚本管理器（[Tampermonkey](https://www.tampermonkey.net/) 或 Violentmonkey），然后访问 [Greasy Fork](https://greasyfork.org/zh-CN/scripts/560977) 安装脚本。脚本会在雀渣牌谱页面（`https://tziakcha.net/record/*`）自动启用。

## 功能

脚本在牌谱回放页面的控制面板右侧提供以下功能：

**高亮首选牌**：用红框标记 CHAGA 推荐的最优打牌选择。

**显示权重条**：在手牌上方显示柱状图，通过 Softmax 归一化后的概率分布直观展示各候选牌的权重。

**候选打法列表**：按权重降序显示所有候选操作及其评分。

**加载状态指示**：实时显示当前步数和四个座位的数据加载状态（`✓` 已加载，`·` 加载中，`✗` 加载失败）。

## 实现

脚本通过拦截雀渣平台的 `TZ` 构造函数获取游戏实例，同步当前回放步数。分析数据从 CHAGA API（`https://tc-api.pesiu.org/review/`）异步获取，包含每个回合每个座位的候选打法和权重。对于缺失的中间步数，脚本会自动填充最近的有效数据以保持连续性。

反馈请访问 [Greasy Fork 脚本页面](https://greasyfork.org/zh-CN/scripts/560977)。

