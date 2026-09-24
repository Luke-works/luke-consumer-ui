import type { AiModel } from "../../lib/aiProviderApi";

/**
 * Render a provider's models as two groups: the ones an assistant turn could run on, and
 * everything else.
 *
 * A provider lists every model the account can reach across all modalities. Groq returns
 * Whisper (speech-to-text) and Orpheus (text-to-speech) beside its chat models; OpenAI returns
 * embeddings and image models. Presented as equal choices they are a trap — pick one and every
 * turn fails with a provider error the user cannot act on.
 *
 * **Grouped, never filtered.** Capability is partly inferred from names the provider owns, and
 * we have already been bitten once by treating such a guess as authoritative (a real Google key
 * refused for not starting with "AIza"). A wrong guess here demotes a model to the second group,
 * where it is still one click away — it never makes one disappear.
 */
export function ModelOptions({ models, selected }: { models: AiModel[]; selected?: string | null }) {
  const chat = models.filter((m) => m.chat);
  const other = models.filter((m) => !m.chat);
  // A stored choice stays selectable even if it is not in the list the provider just returned,
  // so the control never looks like it silently reset while loading.
  const missing = selected && !models.some((m) => m.id === selected) ? selected : null;

  return (
    <>
      {missing ? <option value={missing}>{missing}</option> : null}
      {chat.length > 0 ? (
        <optgroup label="Chat models">
          {chat.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
            </option>
          ))}
        </optgroup>
      ) : null}
      {other.length > 0 ? (
        <optgroup label="Other — may not work for building">
          {other.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
            </option>
          ))}
        </optgroup>
      ) : null}
    </>
  );
}
