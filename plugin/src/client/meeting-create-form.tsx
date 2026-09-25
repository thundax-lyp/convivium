import * as React from "react";
import { useState, type ReactElement } from "react";
import { CreateMeetingActionSchema, type MeetingCommand } from "@/protocol/index.js";
import { useMeetingSubmission, type MeetingClient } from "./meeting-client.js";
import { en, type MeetingLocaleKey, type MeetingTranslate } from "./locales.js";

export const formText = (name: string, t?: MeetingTranslate): string => {
    const key = `form.${name}` as MeetingLocaleKey;
    return Object.hasOwn(en, key) ? (t ? t(key) : en[key]) : name;
};
export const MeetingField = ({
    name,
    label = name.split(".").at(-1)!,
    options,
    multiple = false,
    type = "text",
    required = true,
    t,
    defaultValue
}: {
    name: string;
    label?: string;
    options?: readonly (string | { id: string; text: string })[];
    multiple?: boolean;
    type?: "text" | "number" | "checkbox" | "textarea";
    required?: boolean;
    t?: MeetingTranslate;
    defaultValue?: string;
}): ReactElement => (
    <label style={{ display: "block", marginBlock: 8 }}>
        {formText(label, t)}
        {options ? (
            <select
                name={name}
                required={required}
                multiple={multiple}
                defaultValue={multiple ? [] : (defaultValue ?? "")}
            >
                {multiple ? null : <option value="">—</option>}
                {options.map((option) => {
                    const id = typeof option === "string" ? option : option.id;
                    return (
                        <option key={id} value={id}>
                            {typeof option === "string" ? option : option.text}
                        </option>
                    );
                })}
            </select>
        ) : type === "textarea" ? (
            <textarea name={name} required={required} defaultValue={defaultValue} />
        ) : (
            <input
                name={name}
                type={type}
                required={type === "checkbox" ? false : required}
                min={type === "number" ? 1 : undefined}
                step={type === "number" ? 1 : undefined}
                defaultValue={defaultValue}
            />
        )}
    </label>
);
export const formValue = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
export const formValues = (data: FormData, name: string) =>
    data.getAll(name).map(String).filter(Boolean);
export const SubmissionFeedback = ({
    submission,
    disabled,
    t
}: {
    submission: ReturnType<typeof useMeetingSubmission>;
    disabled: boolean;
    t?: MeetingTranslate;
}) => (
    <>
        {submission.message && <p role="status">{formText(submission.message, t)}</p>}
        {submission.uncertain && (
            <button
                type="button"
                disabled={disabled || submission.pending}
                onClick={() => void submission.retry()}
            >
                {formText("retry", t)}
            </button>
        )}
    </>
);
const roles = [
    "meeting_manager",
    "domain_architect",
    "runtime_engineer",
    "protocol_ui_engineer",
    "verification_reviewer",
    "github_research_analyst",
    "arxiv_research_analyst"
] as const;
const TargetRows = ({ name, t }: { name: string; t?: MeetingTranslate }) => {
    const [count, setCount] = useState(0);
    return (
        <fieldset>
            <legend>{formText(name, t)}</legend>
            {Array.from({ length: count }, (_, i) => (
                <div key={i}>
                    <input type="hidden" name={`${name}.index`} value={i} />
                    <MeetingField name={`${name}.${i}.id`} t={t} />
                    <MeetingField name={`${name}.${i}.text`} type="textarea" t={t} />
                </div>
            ))}
            <button type="button" onClick={() => setCount(count + 1)}>
                {formText("add", t)}
            </button>
            {count > 0 && (
                <button type="button" onClick={() => setCount(count - 1)}>
                    {formText("remove", t)}
                </button>
            )}
        </fieldset>
    );
};

export const MeetingCreateForm = ({
    client,
    disabled,
    onCreated,
    t
}: {
    client: MeetingClient;
    disabled: boolean;
    onCreated: (meetingId: string) => void;
    t?: MeetingTranslate;
}): ReactElement => {
    const submission = useMeetingSubmission(client, disabled, onCreated);
    const [agendaCount, setAgendaCount] = useState(1);
    const [continuation, setContinuation] = useState(false);
    const [keys, setKeys] = useState<string[]>([...roles]);
    const [agendaIds, setAgendaIds] = useState<string[]>([""]);
    const [outputIds, setOutputIds] = useState<string[]>([]);
    const collect = (form: HTMLFormElement) => {
        const data = new FormData(form);
        const targets = (name: string) =>
            formValues(data, `${name}.index`).map((i) => ({
                id: formValue(data, `${name}.${i}.id`),
                text: formValue(data, `${name}.${i}.text`)
            }));
        const initialAgenda = Array.from({ length: agendaCount }, (_, i) => ({
            id: formValue(data, `agenda.${i}.id`),
            title: formValue(data, `agenda.${i}.title`),
            question: formValue(data, `agenda.${i}.question`),
            requiredOutputIds: formValues(data, `agenda.${i}.requiredOutputIds`),
            ...(formValue(data, `agenda.${i}.ownerIdentityKey`)
                ? { ownerIdentityKey: formValue(data, `agenda.${i}.ownerIdentityKey`) }
                : {})
        }));
        return {
            kind: "create_meeting",
            objective: {
                statement: formValue(data, "objective"),
                requiredOutputs: targets("requiredOutputs"),
                acceptanceCriteria: targets("acceptanceCriteria"),
                hardConstraints: targets("hardConstraints"),
                acceptableRiskLevel: formValue(data, "acceptableRiskLevel")
            },
            identities: roles.map((role, i) => ({
                identityKey: formValue(data, `identity.${i}.identityKey`),
                displayName: formValue(data, `identity.${i}.displayName`),
                definitionId: `convivium.${role}`,
                definitionVersion: "2.0.0",
                roles: [i === 0 ? "manager" : i === 4 ? "evidence_reviewer" : "contributor"],
                agendaResponsibilityIds: formValues(data, `identity.${i}.agendaResponsibilityIds`),
                riskAuthority: data.has(`identity.${i}.riskAuthority`),
                required: data.has(`identity.${i}.required`)
            })),
            managerIdentityKey: formValue(data, "identity.0.identityKey"),
            evidenceReviewerIdentityKey: formValue(data, "identity.4.identityKey"),
            initialAgenda,
            initialActiveAgendaId: formValue(data, "initialActiveAgendaId"),
            limits: Object.fromEntries(
                ["maxFormalMessages", "maxDurationMs", "taskDeadlineMs", "reviewDeadlineMs"].map(
                    (key) => [key, Number(formValue(data, key))]
                )
            ),
            ...(continuation
                ? {
                      continuation: {
                          sourceArchiveId: formValue(data, "sourceArchiveId"),
                          selectedMaterialIds: formValue(data, "selectedMaterialIds")
                              .split(/\r?\n/)
                              .map((s) => s.trim())
                              .filter(Boolean)
                      }
                  }
                : {})
        };
    };
    const updateOptions = (form: HTMLFormElement) => {
        const data = new FormData(form);
        setKeys(roles.map((_, i) => formValue(data, `identity.${i}.identityKey`)).filter(Boolean));
        setAgendaIds(
            Array.from({ length: agendaCount }, (_, i) => formValue(data, `agenda.${i}.id`)).filter(
                Boolean
            )
        );
        setOutputIds(
            formValues(data, "requiredOutputs.index")
                .map((i) => formValue(data, `requiredOutputs.${i}.id`))
                .filter(Boolean)
        );
        submission.edit();
    };
    const submit = (form: HTMLFormElement) => {
        const parsed = CreateMeetingActionSchema.safeParse(collect(form));
        if (!parsed.success || !form.checkValidity()) {
            submission.invalid();
            return;
        }
        const action = parsed.data;
        const ids = [
            action.objective.requiredOutputs,
            action.objective.acceptanceCriteria,
            action.objective.hardConstraints,
            action.initialAgenda
        ].flatMap((items) => items.map((item) => item.id));
        const identityKeys = action.identities.map((item) => item.identityKey);
        const agendas = new Set(action.initialAgenda.map((item) => item.id));
        const outputs = new Set(action.objective.requiredOutputs.map((item) => item.id));
        if (
            new Set(ids).size !== ids.length ||
            new Set(identityKeys).size !== 7 ||
            !agendas.has(action.initialActiveAgendaId) ||
            action.identities.some((item) =>
                item.agendaResponsibilityIds.some((id) => !agendas.has(id))
            ) ||
            action.initialAgenda.some(
                (item) =>
                    item.requiredOutputIds.some((id) => !outputs.has(id)) ||
                    (item.ownerIdentityKey !== undefined &&
                        !identityKeys.includes(item.ownerIdentityKey))
            )
        ) {
            submission.invalid();
            return;
        }
        void submission.submit("new", 0, action as MeetingCommand["action"]);
    };
    return (
        <details>
            <summary>{formText("create", t)}</summary>
            <form
                data-testid="meeting-create-form"
                onChange={(event) => updateOptions(event.currentTarget)}
                onSubmit={(event) => {
                    event.preventDefault();
                    submit(event.currentTarget);
                }}
            >
                <fieldset disabled={disabled || submission.pending}>
                    <MeetingField name="objective" type="textarea" t={t} />
                    <MeetingField
                        name="acceptableRiskLevel"
                        options={["low", "medium", "high"]}
                        t={t}
                    />
                    {["requiredOutputs", "acceptanceCriteria", "hardConstraints"].map((name) => (
                        <TargetRows key={name} name={name} t={t} />
                    ))}
                    <fieldset>
                        <legend>{formText("identities", t)}</legend>
                        {roles.map((role, i) => (
                            <fieldset key={role}>
                                <legend>
                                    {role} · convivium.{role} · 2.0.0
                                </legend>
                                <MeetingField
                                    name={`identity.${i}.identityKey`}
                                    defaultValue={role}
                                    t={t}
                                />
                                <MeetingField name={`identity.${i}.displayName`} t={t} />
                                <MeetingField
                                    name={`identity.${i}.agendaResponsibilityIds`}
                                    options={[...new Set(agendaIds)]}
                                    multiple
                                    required={false}
                                    t={t}
                                />
                                <MeetingField
                                    name={`identity.${i}.riskAuthority`}
                                    type="checkbox"
                                    t={t}
                                />
                                <MeetingField
                                    name={`identity.${i}.required`}
                                    type="checkbox"
                                    t={t}
                                />
                            </fieldset>
                        ))}
                    </fieldset>
                    <fieldset>
                        <legend>{formText("initialAgenda", t)}</legend>
                        {Array.from({ length: agendaCount }, (_, i) => (
                            <fieldset key={i}>
                                <MeetingField name={`agenda.${i}.id`} t={t} />
                                <MeetingField name={`agenda.${i}.title`} t={t} />
                                <MeetingField name={`agenda.${i}.question`} type="textarea" t={t} />
                                <MeetingField
                                    name={`agenda.${i}.requiredOutputIds`}
                                    options={[...new Set(outputIds)]}
                                    multiple
                                    required={false}
                                    t={t}
                                />
                                <MeetingField
                                    name={`agenda.${i}.ownerIdentityKey`}
                                    options={[...new Set(keys)]}
                                    required={false}
                                    t={t}
                                />
                            </fieldset>
                        ))}
                        <button
                            type="button"
                            onClick={() => {
                                setAgendaCount(agendaCount + 1);
                                submission.edit();
                            }}
                        >
                            {formText("add", t)}
                        </button>
                    </fieldset>
                    <MeetingField
                        name="initialActiveAgendaId"
                        options={[...new Set(agendaIds)]}
                        t={t}
                    />
                    {[
                        "maxFormalMessages",
                        "maxDurationMs",
                        "taskDeadlineMs",
                        "reviewDeadlineMs"
                    ].map((name) => (
                        <MeetingField key={name} name={name} type="number" t={t} />
                    ))}
                    <label>
                        <input
                            type="checkbox"
                            checked={continuation}
                            onChange={(event) => setContinuation(event.target.checked)}
                        />
                        {formText("continuation", t)}
                    </label>
                    {continuation && (
                        <>
                            <MeetingField name="sourceArchiveId" t={t} />
                            <MeetingField name="selectedMaterialIds" type="textarea" t={t} />
                        </>
                    )}
                    <button type="submit">{formText("create", t)}</button>
                </fieldset>
                <SubmissionFeedback submission={submission} disabled={disabled} t={t} />
            </form>
        </details>
    );
};
