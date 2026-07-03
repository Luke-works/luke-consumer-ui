/**
 * STAGED integration of the @lukeflow/form-* packages (luke-forms monorepo) into
 * luke-consumer-ui. Self-contained demo page — NOT yet wired into routing or used in
 * production. It proves the builder + renderer + secure data-source compose in this
 * app; the real cutover (replacing src/lib/formSchema.ts, src/lib/expression.ts and
 * src/components/formBuilder/*) is described in luke-forms/INTEGRATION.md and should
 * be done wave-by-wave with in-app verification.
 */
import { useState } from "react";
import { FormBuilder } from "@lukeflow/form-builder";
import { FormRenderer, MinionProvider } from "@lukeflow/form-react";
import type { FormSchema, MinionClient } from "@lukeflow/form-core";

const STARTER: FormSchema = {
  root: ["name", "qty", "price", "total"],
  entities: {
    name: { id: "name", type: "textField", attributes: { key: "name", label: "Name", required: true } },
    qty: { id: "qty", type: "number", attributes: { key: "qty", label: "Qty" } },
    price: { id: "price", type: "number", attributes: { key: "price", label: "Price" } },
    total: {
      id: "total",
      type: "number",
      // Form.io-style JavaScript field logic.
      attributes: { key: "total", label: "Total", calculateValueJs: "value = data.qty * data.price;" },
    },
  },
};

// The secure "minion" client: auth/authz live SERVER-SIDE; the browser only names
// the operation and never sees credentials or access rules.
const minionClient: MinionClient = {
  async request(minion, params, signal) {
    const res = await fetch(`/api/minions/${minion}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      credentials: "include",
      signal,
    });
    if (!res.ok) throw new Error(`minion ${minion} failed`);
    return res.json();
  },
};

export default function LukeFormsPlayground() {
  const [schema, setSchema] = useState<FormSchema>(STARTER);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: 16 }}>
      <section>
        <h3>Builder — @lukeflow/form-builder</h3>
        <FormBuilder initialSchema={schema} onChange={setSchema} />
      </section>
      <section>
        <h3>Live form — @lukeflow/form-react</h3>
        <MinionProvider client={minionClient}>
          <FormRenderer schema={schema} onSubmit={() => {}} />
        </MinionProvider>
      </section>
    </div>
  );
}
