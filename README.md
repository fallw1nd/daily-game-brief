# Daily Game Brief

每天北京时间 12:00 计划发布的可核验游戏行业日报；事实窗口在 10:10 封窗。页面由结构化 Canonical 数据渲染，历史早报/晚报保持归档，不再作为当前生产 cadence。

## Production docs

- [AGENTS.md](AGENTS.md)：仓库级工作与编辑边界。
- [docs/SCHEDULED_TASK_PROMPT.md](docs/SCHEDULED_TASK_PROMPT.md)：唯一启用的 ChatGPT Daily 编辑任务契约。
- [docs/AUTOMATION_ARCHITECTURE.md](docs/AUTOMATION_ARCHITECTURE.md)：GitHub/ChatGPT 职责、状态机、恢复和发布路径。
- [docs/DATA_PIPELINE.md](docs/DATA_PIPELINE.md)：Canonical、证据、译名、日历和双语数据契约。
- [docs/MEDIA_PIPELINE.md](docs/MEDIA_PIPELINE.md)：新闻图与封面流程。
- [docs/RELEASE_CALENDAR.md](docs/RELEASE_CALENDAR.md)：未来 15 天发售发现与核验。
- [docs/SHOWCASE_RECOVERY.md](docs/SHOWCASE_RECOVERY.md)：发布会补齐的有界 continuation 规则。

历史事故、一次性验收与已完成迁移只记录在 [docs/MAINTENANCE_LOG.md](docs/MAINTENANCE_LOG.md)，不作为生产指令。

## Local development

```bash
npm install
npm run dev
npm run check
```
