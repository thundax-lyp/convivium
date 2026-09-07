# Convivium DSH Plugin

Convivium is a DSH plugin for continuous, structured multi-agent meetings.

The product is implemented independently in this directory. Product behavior and engineering contracts are defined by the repository-level `docs/` tree.

`convivium_submit_turn` accepts optional `minutesDraft` metadata for a non-authoritative summary. It references only existing messages in the delivered context; the original transcript remains authoritative. The role does not grant additional permissions, and a draft cannot submit decisions or completion claims or block archival. See the [Protocol contract](../docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md#referenced-minutes-draft) for fields and validation.
