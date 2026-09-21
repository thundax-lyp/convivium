# V1 后缀删除清单（Draft）

> 状态：机械盘点，不作为实现依据。

## 统计

| 模块 | 名称数 |
| --- | ---: |
| `runtime` | 26 |
| `tools` | 1 |
| 合计（按模块去重） | 27 |

声明出现次数：27

全局唯一名称数：27

## runtime

| 当前名称 | 删除后名称 |
| --- | --- |
| `MeetingCommandRecoveryDependenciesV1` | `MeetingCommandRecoveryDependencies` |
| `MeetingCreationCoordinatorV1` | `MeetingCreationCoordinator` |
| `MeetingIdentityEffectHandlerDependenciesV1` | `MeetingIdentityEffectHandlerDependencies` |
| `MeetingIdentityProvisionDependenciesV1` | `MeetingIdentityProvisionDependencies` |
| `MeetingNoticeDispatcherV1Dependencies` | `MeetingNoticeDispatcherDependencies` |
| `MeetingOutboxWakeupV1` | `MeetingOutboxWakeup` |
| `ResolveCallerScopeV1` | `ResolveCallerScope` |
| `ResolvedCallerScopeV1` | `ResolvedCallerScope` |
| `ReviewDeliveryDispatcherDependenciesV1` | `ReviewDeliveryDispatcherDependencies` |
| `TargetMeetingCreationDependenciesV1` | `TargetMeetingCreationDependencies` |
| `activateTargetMeetingApplicationV1` | `activateTargetMeetingApplication` |
| `createEvidenceReviewDispatcherV1` | `createEvidenceReviewDispatcher` |
| `createIdentityProvisionOwnerV1` | `createIdentityProvisionOwner` |
| `createMeetingArchiveDispatcherV1` | `createMeetingArchiveDispatcher` |
| `createMeetingCommandApplicationV1` | `createMeetingCommandApplication` |
| `createMeetingCreationCoordinatorV1` | `createMeetingCreationCoordinator` |
| `createMeetingIdentityEffectHandlerV1` | `createMeetingIdentityEffectHandler` |
| `createMeetingNoticeDispatcherV1` | `createMeetingNoticeDispatcher` |
| `createReviewDeliveryDispatcherV1` | `createReviewDeliveryDispatcher` |
| `createTargetMeetingEffectDispatcherV1` | `createTargetMeetingEffectDispatcher` |
| `ensureTargetMeetingDeliveryV1` | `ensureTargetMeetingDelivery` |
| `getLocalMeetingWebRuntimeV1` | `getLocalMeetingWebRuntime` |
| `getMeetingCommandApplicationV1` | `getMeetingCommandApplication` |
| `provisionMeetingIdentityV1` | `provisionMeetingIdentity` |
| `recoverMeetingCommandsV1` | `recoverMeetingCommands` |
| `recoverTargetMeetingDeliveriesV1` | `recoverTargetMeetingDeliveries` |

## tools

| 当前名称 | 删除后名称 |
| --- | --- |
| `registerMeetingToolsV1` | `registerMeetingTools` |
