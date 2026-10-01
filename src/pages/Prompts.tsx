/**
 * Prompts: the system prompt, tone, model override and handoff phrases.
 *
 * These are fields on the project row rather than a separate resource, so this
 * screen is a different arrangement of the same PATCH that Customize uses.
 *
 * A PATCH only writes fields that are present and non-null, so an emptied text
 * box cannot clear a value server-side. That is deliberate on the backend
 * (null must not silently wipe a prompt) and it is why the clear buttons below
 * confirm rather than assume.
 */

import {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';

import {ApiError} from '../lib/api';
import {useProject, useUpdateProject} from '../lib/queries';
import {
  Button,
  Card,
  ErrorNote,
  Field,
  inputClass,
  Spinner,
} from '../components/ui';

const TONES = [
  'friendly',
  'professional',
  'concise',
  'warm',
  'technical',
  'playful',
];

export function PromptsScreen() {
  const {projectId} = useParams();
  const project = useProject(projectId ?? null);
  const update = useUpdateProject(projectId ?? null);

  const [systemPrompt, setSystemPrompt] = useState('');
  const [tone, setTone] = useState('friendly');
  const [modelOverride, setModelOverride] = useState('');
  const [handoffPhrases, setHandoffPhrases] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!project.data) return;
    setSystemPrompt(project.data.system_prompt ?? '');
    setTone(project.data.tone || 'friendly');
    setModelOverride(project.data.llm_model_override ?? '');
    setHandoffPhrases(project.data.handoff_phrases ?? '');
  }, [project.data]);

  if (project.isPending) return <Spinner />;
  if (project.isError || !project.data) {
    return (
      <ErrorNote
        message={project.error instanceof ApiError ? project.error.message : 'Failed to load project'}
      />
    );
  }

  const promptTooLong = systemPrompt.length > 8000;
  const phrasesTooLong = handoffPhrases.length > 4000;

  async function onSave() {
    setError(null);
    try {
      // Sent as empty strings rather than null for the optional fields: the
      // backend treats null as "leave alone", and an empty string is how a
      // value gets cleared.
      await update.mutateAsync({
        system_prompt: systemPrompt,
        tone,
        llm_model_override: modelOverride,
        handoff_phrases: handoffPhrases,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
    }
  }

  return (
    <>
      <Card
        title="System prompt"
        description="The assistant's instructions. Keep facts in documents and behaviour here."
      >
        <Field
          label="Instructions"
          htmlFor="system-prompt"
          error={
            promptTooLong
              ? `${systemPrompt.length} of 8000 characters.`
              : undefined
          }
          hint="Leave the documents to carry the facts; a prompt that lists them goes stale the moment a document changes."
        >
          <textarea
            id="system-prompt"
            rows={10}
            className={`${inputClass} font-mono text-xs`}
            value={systemPrompt}
            onChange={(e) => {
              setSaved(false);
              setSystemPrompt(e.target.value);
            }}
          />
        </Field>
      </Card>

      <Card title="Voice">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tone" htmlFor="tone">
            <select
              id="tone"
              className={inputClass}
              value={tone}
              onChange={(e) => {
                setSaved(false);
                setTone(e.target.value);
              }}
            >
              {TONES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Model override"
            htmlFor="model-override"
            hint="Blank uses the provider default. Leave blank unless you know you need it."
          >
            <input
              id="model-override"
              className={inputClass}
              placeholder="openai/gpt-oss-120b"
              value={modelOverride}
              onChange={(e) => {
                setSaved(false);
                setModelOverride(e.target.value);
              }}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Handoff triggers"
        description="One phrase per line. When a visitor says one of these, the assistant offers a human."
      >
        <Field
          label="Phrases"
          htmlFor="handoff"
          error={
            phrasesTooLong ? `${handoffPhrases.length} of 4000 characters.` : undefined
          }
        >
          <textarea
            id="handoff"
            rows={5}
            className={inputClass}
            placeholder={'talk to a human\nspeak to someone\nescalate this'}
            value={handoffPhrases}
            onChange={(e) => {
              setSaved(false);
              setHandoffPhrases(e.target.value);
            }}
          />
        </Field>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          onClick={onSave}
          busy={update.isPending}
          disabled={promptTooLong || phrasesTooLong}
        >
          Save
        </Button>
        {saved && <span className="text-xs text-emerald-700">Saved.</span>}
      </div>
      {error && <ErrorNote message={error.message} issues={error.issues} />}
    </>
  );
}