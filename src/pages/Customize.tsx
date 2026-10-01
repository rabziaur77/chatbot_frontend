/**
 * Customize: widget appearance.
 *
 * Written to Project.widget_config, which the backend stores as a JSON *text*
 * column and hands back as a string. So this screen parses defensively on load
 * and serialises on save.
 *
 * theme_color is constrained to a hex value on the client for immediate
 * feedback, but the server re-validates it: the value becomes a CSS custom
 * property on every customer page, and the server refusing a url() there is the
 * control that actually matters.
 */

import {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';

import {ApiError} from '../lib/api';
import {useProject, useUpdateProject} from '../lib/queries';
import {Button, Card, ErrorNote, Field, inputClass, Spinner} from '../components/ui';

interface WidgetSettings {
  bot_name: string;
  subtitle: string;
  greeting: string;
  theme_color: string;
  position: 'left' | 'right';
  launcher_label: string;
  dark_mode: boolean;
}

const DEFAULTS: WidgetSettings = {
  bot_name: '',
  subtitle: 'How can we help?',
  greeting: '',
  theme_color: '#2563eb',
  position: 'right',
  launcher_label: 'Chat',
  dark_mode: false,
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function parse(raw: string): WidgetSettings {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULTS;
    const merged = {...DEFAULTS, ...(parsed as Partial<WidgetSettings>)};
    return {
      ...merged,
      theme_color: HEX.test(merged.theme_color ?? '') ? merged.theme_color : DEFAULTS.theme_color,
      position: merged.position === 'left' ? 'left' : 'right',
      dark_mode: Boolean(merged.dark_mode),
    };
  } catch {
    return DEFAULTS;
  }
}

export function CustomizeScreen() {
  const {projectId} = useParams();
  const project = useProject(projectId ?? null);
  const update = useUpdateProject(projectId ?? null);
  const [settings, setSettings] = useState<WidgetSettings>(DEFAULTS);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (project.data) setSettings(parse(project.data.widget_config));
  }, [project.data]);

  if (project.isPending) return <Spinner />;
  if (project.isError || !project.data) {
    return (
      <ErrorNote
        message={project.error instanceof ApiError ? project.error.message : 'Failed to load project'}
      />
    );
  }

  const colorValid = HEX.test(settings.theme_color);

  function set<K extends keyof WidgetSettings>(key: K, value: WidgetSettings[K]) {
    setSaved(false);
    setSettings((prev) => ({...prev, [key]: value}));
  }

  async function onSave() {
    setError(null);
    try {
      // The object, not a JSON string. The column is JSON text, which makes the
      // string form look plausible, but `UpdateProjectRequest.widget_config` is
      // a dict and Pydantic rejects a string with a 422 -- so this screen could
      // never save anything. api() serialises the body for us.
      await update.mutateAsync({widget_config: {...settings}});
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
    }
  }

  return (
    <>
      <Card
        title="Widget appearance"
        description="Changes apply to live widgets as soon as you save. Customers do not need to re-embed."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assistant name" htmlFor="bot-name">
            <input
              id="bot-name"
              maxLength={80}
              className={inputClass}
              value={settings.bot_name}
              onChange={(e) => set('bot_name', e.target.value)}
              placeholder={project.data.name}
            />
          </Field>

          <Field label="Subtitle" htmlFor="subtitle">
            <input
              id="subtitle"
              maxLength={80}
              className={inputClass}
              value={settings.subtitle}
              onChange={(e) => set('subtitle', e.target.value)}
            />
          </Field>

          <Field label="Launcher label" htmlFor="launcher-label">
            <input
              id="launcher-label"
              maxLength={80}
              className={inputClass}
              value={settings.launcher_label}
              onChange={(e) => set('launcher_label', e.target.value)}
            />
          </Field>

          <Field
            label="Accent colour"
            htmlFor="theme-color"
            error={colorValid ? undefined : 'Use a hex colour, for example #2563eb.'}
            hint="Hex only. The server rejects anything else."
          >
            <div className="flex gap-2">
              <input
                type="color"
                aria-label="Accent colour picker"
                className="h-9 w-12 cursor-pointer rounded border border-slate-300"
                value={colorValid ? settings.theme_color : '#2563eb'}
                onChange={(e) => set('theme_color', e.target.value)}
              />
              <input
                id="theme-color"
                className={inputClass}
                value={settings.theme_color}
                onChange={(e) => set('theme_color', e.target.value)}
              />
            </div>
          </Field>

          <Field label="Position" htmlFor="position">
            <select
              id="position"
              className={inputClass}
              value={settings.position}
              onChange={(e) => set('position', e.target.value as 'left' | 'right')}
            >
              <option value="right">Bottom right</option>
              <option value="left">Bottom left</option>
            </select>
          </Field>

          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={settings.dark_mode}
                onChange={(e) => set('dark_mode', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Dark mode
            </label>
          </div>

          <div className="sm:col-span-2">
            <Field
              label="Greeting"
              htmlFor="greeting"
              hint="Leave empty to let the assistant open with a neutral prompt."
            >
              <textarea
                id="greeting"
                rows={3}
                maxLength={400}
                className={inputClass}
                value={settings.greeting}
                onChange={(e) => set('greeting', e.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button onClick={onSave} busy={update.isPending} disabled={!colorValid}>
            Save changes
          </Button>
          {saved && <span className="text-xs text-emerald-700">Saved.</span>}
        </div>
        {error && (
          <div className="mt-3">
            <ErrorNote message={error.message} issues={error.issues} />
          </div>
        )}
      </Card>

      <Card title="Preview" description="Rendered from local state. The shipped widget adds its own launcher and panel chrome.">
        {/* Previewed locally because /api/v1/public/widget-config/{key} needs the
            plaintext project key, which the dashboard never holds: the server
            stores only a hash and returns the plaintext once, at creation or
            rotation. The Install screen is where a fresh key can be checked
            against the public endpoint for real. */}
        <div className="flex h-56 items-end justify-end rounded-lg bg-slate-100 p-4">
          <div
            className="rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-lg"
            style={{backgroundColor: colorValid ? settings.theme_color : '#2563eb'}}
          >
            {settings.launcher_label || 'Chat'}
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-900">
            {settings.bot_name || project.data.name}
          </p>
          <p className="text-xs text-slate-500">{settings.subtitle}</p>
          {settings.greeting && (
            <p className="mt-2 text-sm text-slate-700">{settings.greeting}</p>
          )}
        </div>
      </Card>
    </>
  );
}