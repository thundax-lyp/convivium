# V1 后缀删除清单（Draft）

> 状态：机械盘点，不作为实现依据。

## 统计

| 模块 | 名称数 |
| --- | ---: |
| `protocol` | 80 |
| `repository` | 23 |
| `role-composition` | 6 |
| `runtime` | 37 |
| `tools` | 1 |
| 合计（按模块去重） | 147 |

声明出现次数：147

全局唯一名称数：147

## protocol

| 当前名称 | 删除后名称 |
| --- | --- |
| `ObjectiveViewV1` | `ObjectiveView` |
| `ObjectiveViewV1Schema` | `ObjectiveViewSchema` |
| `OpenRoundActionV1Schema` | `OpenRoundActionSchema` |
| `OutcomeViewV1` | `OutcomeView` |
| `OutcomeViewV1Schema` | `OutcomeViewSchema` |
| `ParticipantSpecV1` | `ParticipantSpec` |
| `PauseMeetingActionV1Schema` | `PauseMeetingActionSchema` |
| `PauseMeetingInputV1` | `PauseMeetingInput` |
| `PendingHandRaiseViewV1` | `PendingHandRaiseView` |
| `PendingHandRaiseViewV1Schema` | `PendingHandRaiseViewSchema` |
| `PositionClaimV1` | `PositionClaim` |
| `PositionViewV1` | `PositionView` |
| `PositionViewV1Schema` | `PositionViewSchema` |
| `PrivateMailViewV1` | `PrivateMailView` |
| `PrivateMailViewV1Schema` | `PrivateMailViewSchema` |
| `ProposalClaimV1` | `ProposalClaim` |
| `ProposalRevisionViewV1` | `ProposalRevisionView` |
| `ProposalRevisionViewV1Schema` | `ProposalRevisionViewSchema` |
| `ProtocolErrorV1` | `ProtocolError` |
| `ProtocolSuccessV1` | `ProtocolSuccess` |
| `PublicAgendaItemV1` | `PublicAgendaItem` |
| `PublicAttendanceRecommendationV1` | `PublicAttendanceRecommendation` |
| `PublicBlockingFactV1` | `PublicBlockingFact` |
| `PublicContinuationMaterialV1` | `PublicContinuationMaterial` |
| `PublicDecisionCandidateV1` | `PublicDecisionCandidate` |
| `PublicDecisionV1` | `PublicDecision` |
| `PublicHandRaiseV1` | `PublicHandRaise` |
| `PublicMeetingChangesV1` | `PublicMeetingChanges` |
| `PublicMeetingLimitsV1` | `PublicMeetingLimits` |
| `PublicMeetingMessageV1` | `PublicMeetingMessage` |
| `PublicMinutesDraftV1` | `PublicMinutesDraft` |
| `PublicObjectiveContractV1` | `PublicObjectiveContract` |
| `PublicQuestionV1` | `PublicQuestion` |
| `PublicRiskV1` | `PublicRisk` |
| `PublicSpeakerStepV1` | `PublicSpeakerStep` |
| `PublicTurnV1` | `PublicTurn` |
| `PublicationViewV1` | `PublicationView` |
| `PublicationViewV1Schema` | `PublicationViewSchema` |
| `PublishRoundActionV1Schema` | `PublishRoundActionSchema` |
| `QuestionClaimV1` | `QuestionClaim` |
| `QuestionResolutionClaimV1` | `QuestionResolutionClaim` |
| `QuestionViewV1` | `QuestionView` |
| `QuestionViewV1Schema` | `QuestionViewSchema` |
| `RaiseHandActionV1Schema` | `RaiseHandActionSchema` |
| `ReadMeetingRequestV1` | `ReadMeetingRequest` |
| `ReadMeetingRequestV1Schema` | `ReadMeetingRequestSchema` |
| `ReassignTurnInputV1` | `ReassignTurnInput` |
| `ReassignTurnResultV1` | `ReassignTurnResult` |
| `RecommendIdentityActionV1Schema` | `RecommendIdentityActionSchema` |
| `RecordIdentityAdmissionResultActionV1Schema` | `RecordIdentityAdmissionResultActionSchema` |
| `RefreshNoticeV1` | `RefreshNotice` |
| `RefreshNoticeV1Schema` | `RefreshNoticeSchema` |
| `ReleaseReviewBatchClaimActionV1Schema` | `ReleaseReviewBatchClaimActionSchema` |
| `ResumeMeetingActionV1Schema` | `ResumeMeetingActionSchema` |
| `ResumeMeetingInputV1` | `ResumeMeetingInput` |
| `ReviewClaimV1` | `ReviewClaim` |
| `ReviewDeliveryViewV1` | `ReviewDeliveryView` |
| `ReviewDeliveryViewV1Schema` | `ReviewDeliveryViewSchema` |
| `RiskAcceptanceClaimV1` | `RiskAcceptanceClaim` |
| `RiskDispositionViewV1` | `RiskDispositionView` |
| `RiskDispositionViewV1Schema` | `RiskDispositionViewSchema` |
| `RiskLevelV1` | `RiskLevel` |
| `RoleErrorCodeV1` | `RoleErrorCode` |
| `RoleErrorCodeV1Schema` | `RoleErrorCodeSchema` |
| `RoundViewV1` | `RoundView` |
| `RoundViewV1Schema` | `RoundViewSchema` |
| `SendMeetingMessageInputV1` | `SendMeetingMessageInput` |
| `SpeakerMeetingContextV1` | `SpeakerMeetingContext` |
| `SubmitEvidenceActionV1Schema` | `SubmitEvidenceActionSchema` |
| `SubmitManagerPlanActionV1Schema` | `SubmitManagerPlanActionSchema` |
| `SubmitReviewBatchActionV1Schema` | `SubmitReviewBatchActionSchema` |
| `TaskViewV1` | `TaskView` |
| `TaskViewV1Schema` | `TaskViewSchema` |
| `TerminationViewV1` | `TerminationView` |
| `TerminationViewV1Schema` | `TerminationViewSchema` |
| `TurnSubmissionResultV1` | `TurnSubmissionResult` |
| `TurnSubmissionV1` | `TurnSubmission` |
| `UnclosedContributionViewV1` | `UnclosedContributionView` |
| `UnclosedContributionViewV1Schema` | `UnclosedContributionViewSchema` |
| `serializeValidatedRequestV1` | `serializeValidatedRequest` |

## repository

| 当前名称 | 删除后名称 |
| --- | --- |
| `CatalogMeetingRecordV1` | `CatalogMeetingRecord` |
| `CatalogMeetingRecordV1Schema` | `CatalogMeetingRecordSchema` |
| `CheckpointPageV1` | `CheckpointPage` |
| `CheckpointPageV1Schema` | `CheckpointPageSchema` |
| `CheckpointPointerV1` | `CheckpointPointer` |
| `CheckpointPointerV1Schema` | `CheckpointPointerSchema` |
| `CheckpointRootV1` | `CheckpointRoot` |
| `CheckpointRootV1Schema` | `CheckpointRootSchema` |
| `CommitRecordV1` | `CommitRecord` |
| `CommitRecordV1Schema` | `CommitRecordSchema` |
| `CommittedFactRecordV1` | `CommittedFactRecord` |
| `CommittedFactRecordV1Schema` | `CommittedFactRecordSchema` |
| `CreationRecordV1` | `CreationRecord` |
| `CreationRecordV1Schema` | `CreationRecordSchema` |
| `JsonPatchOperationV1` | `JsonPatchOperation` |
| `JsonPatchOperationV1Schema` | `JsonPatchOperationSchema` |
| `PersistedEventV1Schema` | `PersistedEventSchema` |
| `PersistedOutboxV1Schema` | `PersistedOutboxSchema` |
| `PersistedReceiptV1Schema` | `PersistedReceiptSchema` |
| `PersistenceProjectionV1` | `PersistenceProjection` |
| `PersistenceProjectionV1Schema` | `PersistenceProjectionSchema` |
| `decodeMeetingStateV1` | `decodeMeetingState` |
| `encodeMeetingStateV1` | `encodeMeetingState` |

## role-composition

| 当前名称 | 删除后名称 |
| --- | --- |
| `AgentDefinitionBindingV1` | `AgentDefinitionBinding` |
| `DynamicDefinitionResolutionV1` | `DynamicDefinitionResolution` |
| `MeetingAgentDefinitionV1` | `MeetingAgentDefinition` |
| `PreflightIdentityResultV1` | `PreflightIdentityResult` |
| `preflightDynamicMeetingIdentityV1` | `preflightDynamicMeetingIdentity` |
| `resolveDynamicMeetingDefinitionV1` | `resolveDynamicMeetingDefinition` |

## runtime

| 当前名称 | 删除后名称 |
| --- | --- |
| `ArchiveSessionsV1` | `ArchiveSessions` |
| `CallerBindingV1` | `CallerBinding` |
| `CreateMeetingCommandV1` | `CreateMeetingCommand` |
| `DispatchArchiveCleanupInputV1` | `DispatchArchiveCleanupInput` |
| `DispatchEvidenceReviewBatchInputV1` | `DispatchEvidenceReviewBatchInput` |
| `EvidenceReviewDispatcherDependenciesV1` | `EvidenceReviewDispatcherDependencies` |
| `IdentityProvisionResultV1` | `IdentityProvisionResult` |
| `MeetingArchiveDispatcherDependenciesV1` | `MeetingArchiveDispatcherDependencies` |
| `MeetingCommandApplicationDependenciesV1` | `MeetingCommandApplicationDependencies` |
| `MeetingCommandApplicationV1` | `MeetingCommandApplication` |
| `MeetingCommandExecutionContextV1` | `MeetingCommandExecutionContext` |
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
