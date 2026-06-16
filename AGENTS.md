# D:\CODEX4 工作区补充规则

## Skill 写作与总结强制路由

- 当用户要求创建、修改、补充、整理、总结、审查或测试任何 Skill 时，必须先调用 `skill-creator` 和 `superpowers:writing-skills`。
- 两个 Skill 都要完整读取后才能编辑或总结目标 Skill；不能只调用其中一个。
- 修改 Skill 前先记录当前触发失败点或基线问题，修改后运行目标 Skill 的验证脚本或等效检查。
- Skill 的 `description` 只写触发条件，正文负责执行流程；不得用描述字段代替正文。
- 主工作流需要调用阶段模块时，使用明确的 `REQUIRED` 标记，并在阶段开始输出触发回执。
