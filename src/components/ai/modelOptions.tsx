import type { AiModel } from "../../lib/aiProviderApi";

/**
 * Render every model a workspace could pick, grouped by provider and then by whether a turn
 * could actually run on it.
 *
 * Two things are going on, and both are traps if flattened.
 *
 * A workspace may connect SEVERAL providers, so the same dropdown offers Groq's models beside
 * Anthropic's — grouping by provider is what makes "combine and use" legible rather than a wall
 * of unrelated names.
 *
 * And a provider lists every model the account can reach across ALL modalities: Groq returns
 * Whisper (speech-to-text) and Orpheus (text-to-speech) beside its chat models; OpenAI returns
 * embeddings and image models. Offered as equal choices they fail every turn.
 *
 * **Grouped, never filtered.** Capability is partly inferred from names the provider owns, and
 * treating such a guess as authoritative has already cost us once — a real Google key refused
 * for not starting with "AIza". A wrong guess here demotes a model within its provider, where it
 * is still one click away; it never makes one disappear.
 */
export function ModelOptions({
  models,
  selected,
  providerLabels = {},
}: {
  models: AiModel[];
  selected?: string | null;
  providerLabels?: Record<string, string>;
}) {
  const providers = [...new Set(models.map((m) => m.provider))];
  // A stored choice stays selectable even if the provider just returned a list without it, so
  // the control never looks like it silently reset while loading.
  const missing = selected && !models.some((m) => m.id === selected) ? selected : null;

  const label = (p: string) => providerLabels[p] ?? p;

  return (
    <>
      {missing ? <option value={missing}>{missing}</option> : null}
      {providers.flatMap((p) => {
        const mine = models.filter((m) => m.provider === p);
        const chat = mine.filter((m) => m.chat);
        const other = mine.filter((m) => !m.chat);
        return [
          chat.length > 0 ? (
            <optgroup key={`${p}-chat`} label={label(p)}>
              {chat.map((m) => (
                <option key={`${p}:${m.id}`} value={m.id}>
                  {m.id}
                </option>
              ))}
            </optgroup>
          ) : null,
          other.length > 0 ? (
            <optgroup key={`${p}-other`} label={`${label(p)} — may not work for building`}>
              {other.map((m) => (
                <option key={`${p}:${m.id}`} value={m.id}>
                  {m.id}
                </option>
              ))}
            </optgroup>
          ) : null,
        ];
      })}
    </>
  );
}
