# Review Dimensions

这些维度只描述审查方法，不定义产品业务规则。具体的状态、角色、字段、事件、错误码、完成条件和资源边界，必须从当前 PR 相关的正式文档中读取。

## Contract consistency

适用于接口、类型、schema、序列化、配置、错误和跨模块边界变化。

追踪字段的 producer、adapter、validator、consumer/sink，检查 requiredness、默认值、枚举、未知值、交叉字段一致性、版本兼容和失败映射。

## State transition integrity

适用于状态、事件、命令、异步任务、并发、重试和恢复变化。

从正式文档提取合法状态图，检查每条变更路径的前置条件、事件记录、非法转换、迟到结果、重复请求和交错时序。

## Identity and authorization integrity

适用于 caller、身份绑定、资源定位、能力、租约、委托和客户端输入变化。

确认身份和授权来自可信服务端事实源；资源边界、跨作用域访问、过期或撤销状态，以及显示字段与真实身份的区分都有证据。

## Persistence and recovery integrity

适用于数据库、迁移、事务、receipt、outbox、缓存、文件和重启恢复变化。

检查事实、事件、幂等记录和待处理副作用的原子性；检查部分失败、重复执行、旧数据、未知版本、路径竞争和恢复后的可观察状态。

## Lifecycle and ownership integrity

适用于资源创建、异步副作用、释放、关闭、归档、重启和清理变化。

建立资源 ownership 生命周期，检查每个成功、失败、中断和重试分支是否有归属、释放、撤销或恢复语义。

## Fact and projection boundary

适用于领域事实、派生文件、缓存、日志、归档、投影和外部结果变化。

确认正式事实只有一个来源，派生物不能反向改变事实；输出、归档和投影不能丢失文档要求的字段、引用或状态语义。

## Verification validity

适用于测试、CI、脚本、package contract、readiness 和 Skill 变化。

确认测试断言的是真实运行对象和可观察行为，而不是文件形状、构造结果或伪造依赖；检查失败、权限、重复、恢复、历史数据和交错时序是否被实际覆盖。
