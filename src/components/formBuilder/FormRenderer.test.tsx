import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormRenderer from "./FormRenderer";

type Ent = { type: string; attributes: Record<string, unknown>; children?: string[] };

const schemaOf = (entities: Record<string, Ent>, root: string[]) =>
  JSON.stringify({ entities, root });

/** A one-field form (plus the implicit Submit button). */
const single = (type: string, attributes: Record<string, unknown>, id = "f1") =>
  schemaOf({ [id]: { type, attributes } }, [id]);

const submitBtn = () => screen.getByRole("button", { name: /submit/i });

describe("FormRenderer — display parity", () => {
  it("renders prefix and suffix add-ons for a text field", () => {
    render(<FormRenderer schema={single("textField", { label: "Amount", prefix: "$", suffix: ".00" })} />);
    expect(screen.getByText("$")).toBeInTheDocument();
    expect(screen.getByText(".00")).toBeInTheDocument();
  });

  it("applies customClass to the field wrapper", () => {
    const { container } = render(<FormRenderer schema={single("textField", { label: "X", customClass: "qa-custom" })} />);
    expect(container.querySelector(".qa-custom")).toBeTruthy();
  });

  it("keeps the label associated when labelPosition is left", () => {
    render(<FormRenderer schema={single("textField", { label: "Name", labelPosition: "left" })} />);
    // getByLabelText resolves htmlFor↔id, proving the association survives the side layout.
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("uses the semantic autocomplete token on the input", () => {
    render(<FormRenderer schema={single("email", { label: "Email", autocompleteToken: "email" })} />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
  });

  it("falls back to the legacy on/off boolean when no token is set", () => {
    render(<FormRenderer schema={single("textField", { label: "X", autocomplete: true })} />);
    expect(screen.getByLabelText("X")).toHaveAttribute("autocomplete", "on");
  });
});

describe("FormRenderer — validateOn live validation", () => {
  it("validates a required field on blur", async () => {
    const user = userEvent.setup();
    render(<FormRenderer schema={single("textField", { label: "Name", required: true, validateOn: "blur" })} />);
    const input = screen.getByLabelText(/Name/); // required adds a " *" to the accessible name
    await user.click(input);
    await user.tab();
    expect(await screen.findByRole("alert")).toHaveTextContent(/required/i);
  });

  it("validates minLength on change and clears the error once satisfied", async () => {
    const user = userEvent.setup();
    render(<FormRenderer schema={single("textField", { label: "Code", minLength: 3, validateOn: "change" })} />);
    const input = screen.getByLabelText("Code");
    await user.type(input, "ab");
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 3/i);
    await user.type(input, "c");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does NOT validate live without validateOn (only clears on edit)", async () => {
    const user = userEvent.setup();
    render(<FormRenderer schema={single("textField", { label: "Code", minLength: 3 })} />);
    await user.type(screen.getByLabelText("Code"), "ab");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("FormRenderer — submit validation", () => {
  it("blocks submit and shows an error for an invalid email", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={single("email", { label: "Email", key: "email" })} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText("Email"), "notanemail");
    await user.click(submitBtn());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/valid email/i);
  });

  it("submits keyed data when valid", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={single("textField", { label: "Name", key: "name" })} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.click(submitBtn());
    expect(onSubmit).toHaveBeenCalledWith({ name: "Ada" });
  });

  it("enforces required on submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={single("textField", { label: "Name", required: true })} onSubmit={onSubmit} />);
    await user.click(submitBtn());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/required/i);
  });
});

describe("FormRenderer — text transforms & counters", () => {
  it("uppercases input when textCase is uppercase", async () => {
    const user = userEvent.setup();
    render(<FormRenderer schema={single("textField", { label: "Code", textCase: "uppercase" })} />);
    const input = screen.getByLabelText("Code");
    await user.type(input, "abc");
    expect(input).toHaveValue("ABC");
  });

  it("shows a character counter when enabled", async () => {
    const user = userEvent.setup();
    render(<FormRenderer schema={single("textField", { label: "Bio", showCharCount: true })} />);
    await user.type(screen.getByLabelText("Bio"), "hi");
    expect(screen.getByText(/2 characters/)).toBeInTheDocument();
  });
});

describe("FormRenderer — multi-value", () => {
  it("adds/removes entries and submits an array", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={single("textField", { label: "Alias", key: "alias", multiple: true })} onSubmit={onSubmit} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    await user.type(screen.getAllByRole("textbox")[0], "first");
    await user.click(screen.getByRole("button", { name: /add another/i }));
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(2);
    await user.type(inputs[1], "second");
    await user.click(submitBtn());
    expect(onSubmit).toHaveBeenCalledWith({ alias: ["first", "second"] });
  });

  it("validates each entry in a multi-value email field", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={single("email", { label: "Emails", key: "emails", multiple: true })} onSubmit={onSubmit} />);
    await user.type(screen.getAllByRole("textbox")[0], "not-an-email");
    await user.click(submitBtn());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/valid email/i);
  });

  it("removes an entry with its ✕ button", async () => {
    const user = userEvent.setup();
    render(<FormRenderer schema={single("textField", { label: "Alias", multiple: true })} />);
    await user.click(screen.getByRole("button", { name: /add another/i }));
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: /remove value/i })[0]);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });
});

describe("FormRenderer — clearable", () => {
  it("clears the field when ✕ is clicked", async () => {
    const user = userEvent.setup();
    render(<FormRenderer schema={single("textField", { label: "Search", clearable: true })} />);
    const input = screen.getByLabelText("Search");
    await user.type(input, "hello");
    expect(input).toHaveValue("hello");
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(input).toHaveValue("");
  });

  it("hides the clear button while the field is empty", () => {
    render(<FormRenderer schema={single("textField", { label: "Search", clearable: true })} />);
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  });
});

describe("FormRenderer — validateOn:blur on custom controls", () => {
  it("validates a Number field on blur (NumberField has no native blur hook)", async () => {
    const user = userEvent.setup();
    render(<FormRenderer schema={single("number", { label: "Qty", required: true, validateOn: "blur" })} />);
    await user.click(screen.getByLabelText(/Qty/));
    await user.tab();
    expect(await screen.findByRole("alert")).toHaveTextContent(/required/i);
  });
});

describe("FormRenderer — multi-value Number", () => {
  it("adds entries and submits an array; validates each numerically", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={single("number", { label: "Score", key: "score", multiple: true, max: 10 })} onSubmit={onSubmit} />);
    await user.type(screen.getAllByRole("textbox")[0], "5");
    await user.click(screen.getByRole("button", { name: /add another/i }));
    await user.type(screen.getAllByRole("textbox")[1], "20");
    await user.click(submitBtn());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/≤ 10/);
  });
});

describe("FormRenderer — multi-select", () => {
  const opts = [
    { label: "JavaScript", value: "js" },
    { label: "TypeScript", value: "ts" },
  ];
  it("renders a checkbox group and submits an array", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={single("select", { label: "Langs", key: "langs", multiple: true, options: opts })} onSubmit={onSubmit} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    await user.click(boxes[0]);
    await user.click(boxes[1]);
    await user.click(submitBtn());
    expect(onSubmit).toHaveBeenCalledWith({ langs: ["js", "ts"] });
  });

  it("enforces required on an empty multi-select", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={single("select", { label: "Langs", multiple: true, required: true, options: opts })} onSubmit={onSubmit} />);
    await user.click(submitBtn());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/required/i);
  });
});

describe("FormRenderer — Text Area & Password parity", () => {
  it("renders prefix/suffix on a Text Area", () => {
    render(<FormRenderer schema={single("textarea", { label: "Notes", prefix: "«", suffix: "»" })} />);
    expect(screen.getByText("«")).toBeInTheDocument();
    expect(screen.getByText("»")).toBeInTheDocument();
  });

  it("applies an autocomplete token to a Password field", () => {
    render(<FormRenderer schema={single("password", { label: "Password", autocompleteToken: "current-password" })} />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  });
});

describe("FormRenderer — Checkbox", () => {
  it("a required checkbox must be checked (false is not 'provided')", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={single("checkbox", { label: "I agree", key: "agree", required: true })} onSubmit={onSubmit} />);
    await user.click(submitBtn());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/required/i);
    await user.click(screen.getByRole("checkbox"));
    await user.click(submitBtn());
    expect(onSubmit).toHaveBeenCalledWith({ agree: true });
  });
});

describe("FormRenderer — Time", () => {
  it("enforces minTime / maxTime", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={single("time", { label: "Start", key: "start", minTime: "09:00", maxTime: "17:00" })} initialValues={{ start: "08:00" }} onSubmit={onSubmit} />);
    await user.click(submitBtn());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/at or after 09:00/);
  });

  it("accepts an in-range time", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={single("time", { label: "Start", key: "start", minTime: "09:00", maxTime: "17:00" })} initialValues={{ start: "10:30" }} onSubmit={onSubmit} />);
    await user.click(submitBtn());
    expect(onSubmit).toHaveBeenCalledWith({ start: "10:30" });
  });
});

describe("FormRenderer — Tags", () => {
  it("enforces minTags", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={single("tagsField", { label: "Skills", key: "skills", minTags: 2 })} initialValues={{ skills: ["react"] }} onSubmit={onSubmit} />);
    await user.click(submitBtn());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/at least 2 tags/i);
  });

  it("enforces maxTags", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={single("tagsField", { label: "Skills", key: "skills", maxTags: 2 })} initialValues={{ skills: ["a", "b", "c"] }} onSubmit={onSubmit} />);
    await user.click(submitBtn());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/at most 2 tags/i);
  });
});

describe("FormRenderer — File", () => {
  it("sets the accept attribute on the input", () => {
    const { container } = render(<FormRenderer schema={single("file", { label: "Doc", accept: "image/*,.pdf" })} />);
    expect(container.querySelector('input[type="file"]')).toHaveAttribute("accept", "image/*,.pdf");
  });

  it("enforces maxFiles on submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const files = [{ name: "a", url: "x" }, { name: "b", url: "y" }, { name: "c", url: "z" }];
    render(<FormRenderer schema={single("file", { label: "Docs", key: "docs", multiple: true, maxFiles: 2 })} initialValues={{ docs: files }} onSubmit={onSubmit} />);
    await user.click(submitBtn());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/at most 2 files/i);
  });

  it("enforces maxSize (MB) per file", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const files = [{ name: "big", url: "x", size: 2 * 1024 * 1024 }];
    render(<FormRenderer schema={single("file", { label: "Doc", key: "doc", maxSize: 1 })} initialValues={{ doc: files }} onSubmit={onSubmit} />);
    await user.click(submitBtn());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/≤ 1 MB/);
  });
});

describe("FormRenderer — Signature", () => {
  it("required signature blocks an empty submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={single("signature", { label: "Sign", key: "sig", required: true })} onSubmit={onSubmit} />);
    await user.click(submitBtn());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/required/i);
  });

  it("submits when a signature is present", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={single("signature", { label: "Sign", key: "sig", required: true })} initialValues={{ sig: "data:image/png;base64,AAAA" }} onSubmit={onSubmit} />);
    await user.click(submitBtn());
    expect(onSubmit).toHaveBeenCalledWith({ sig: "data:image/png;base64,AAAA" });
  });
});

describe("FormRenderer — Content (HTML)", () => {
  it("renders Content as rich HTML", () => {
    const { container } = render(<FormRenderer schema={single("content", { content: "<b>Bold</b> and <a href=\"https://x.com\">link</a>" })} />);
    expect(container.querySelector("b")).toHaveTextContent("Bold");
    expect(container.querySelector("a")).toHaveAttribute("href", "https://x.com");
  });

  it("sanitizes dangerous markup in Content (XSS)", () => {
    const { container } = render(<FormRenderer schema={single("content", { content: "<img src=x onerror=alert(1)><script>alert(2)</script><b>ok</b>" })} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("onerror") ?? null).toBeNull();
    expect(container.querySelector("b")).toHaveTextContent("ok");
  });
});

describe("FormRenderer — Data Grid min/max rows", () => {
  const gridSchema = (gridAttrs: Record<string, unknown>) =>
    JSON.stringify({
      entities: {
        g1: { type: "dataGrid", attributes: { label: "Rows", key: "rows", ...gridAttrs }, children: ["c1"] },
        c1: { type: "textField", attributes: { label: "Name", key: "name" }, parentId: "g1" },
      },
      root: ["g1"],
    });

  it("enforces minRows on submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<FormRenderer schema={gridSchema({ minRows: 2 })} initialValues={{ rows: [{ name: "a" }] }} onSubmit={onSubmit} />);
    await user.click(submitBtn());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/at least 2 rows/i);
  });

  it("disables Add when maxRows is reached", () => {
    render(<FormRenderer schema={gridSchema({ maxRows: 2 })} initialValues={{ rows: [{ name: "a" }, { name: "b" }] }} />);
    expect(screen.getByRole("button", { name: /add row/i })).toBeDisabled();
  });
});

describe("FormRenderer — Button", () => {
  it("honors the disabled attribute", () => {
    render(<FormRenderer schema={single("button", { label: "Go", disabled: true })} />);
    expect(screen.getByRole("button", { name: /go/i })).toBeDisabled();
  });

  it("a reset button restores initial values", async () => {
    const user = userEvent.setup();
    const schema = JSON.stringify({
      entities: {
        t1: { type: "textField", attributes: { label: "Name", key: "name" } },
        b1: { type: "button", attributes: { label: "Clear", buttonAction: "reset" } },
      },
      root: ["t1", "b1"],
    });
    render(<FormRenderer schema={schema} />);
    const input = screen.getByLabelText("Name");
    await user.type(input, "typed");
    expect(input).toHaveValue("typed");
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(input).toHaveValue("");
  });
});

describe("FormRenderer — auto-validate (Test the form)", () => {
  it("reports ok when autofilled valid data passes", () => {
    const onResult = vi.fn();
    render(<FormRenderer schema={single("textField", { label: "Name", key: "name", required: true })} initialValues={{ name: "Ada" }} autoSubmitSignal={1} onResult={onResult} />);
    expect(onResult).toHaveBeenCalledWith({ ok: true, errorCount: 0 });
  });

  it("reports failure with an error count when invalid", () => {
    const onResult = vi.fn();
    render(<FormRenderer schema={single("textField", { label: "Name", key: "name", required: true })} autoSubmitSignal={1} onResult={onResult} />);
    expect(onResult).toHaveBeenCalledWith({ ok: false, errorCount: 1 });
  });
});

describe("FormRenderer — read-only & empty", () => {
  it("shows an empty-state message for a form with no fields", () => {
    render(<FormRenderer schema={schemaOf({}, [])} />);
    expect(screen.getByText(/no fields yet/i)).toBeInTheDocument();
  });

  it("disables inputs and hides submit in read-only mode", () => {
    render(<FormRenderer schema={single("textField", { label: "Name" })} readOnly />);
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
  });
});
