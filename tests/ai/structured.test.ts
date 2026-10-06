import { FakeLLMClient, OpenAICompatibleClient, generateValidated, parseJson, type AICallLog } from "@nova/ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const schema = z.object({ answer: z.number().int().min(1).max(10) });
const request = { task: "demo", promptVersion: "demo@1", system: "Answer.", user: "Pick a number.", schema };

describe("generateValidated", () => {
  it("returns a valid reply after one attempt", async () => {
    const llm = new FakeLLMClient().on("demo", { answer: 7 });
    expect(await generateValidated(request, { llm })).toEqual({ ok: true, value: { answer: 7 } });
    expect(llm.calls).toHaveLength(1);
  });

  it("retries once when the reply breaks the schema, telling the model what was wrong", async () => {
    const llm = new FakeLLMClient().on("demo", { answer: 99 }, { answer: 3 });
    const result = await generateValidated(request, { llm });
    expect(result).toEqual({ ok: true, value: { answer: 3 } });
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1]?.user).toContain("Your previous reply was rejected");
    expect(llm.calls[1]?.user).toContain("answer");
  });

  it("gives up with INVALID_OUTPUT after a second bad reply", async () => {
    const llm = new FakeLLMClient().on("demo", { answer: 99 }, { wrong: true });
    const result = await generateValidated(request, { llm });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("INVALID_OUTPUT");
    expect(llm.calls).toHaveLength(2);
  });

  it("retries a reply that was not JSON", async () => {
    const llm = new FakeLLMClient().on("demo", { error: { kind: "MALFORMED", message: "not JSON" } }, { answer: 2 });
    expect((await generateValidated(request, { llm })).ok).toBe(true);
    expect(llm.calls[1]?.user).toContain("not JSON");
  });

  it("does not retry when the model is unreachable or refuses", async () => {
    for (const kind of ["UNAVAILABLE", "REFUSED"] as const) {
      const llm = new FakeLLMClient().on("demo", { error: { kind, message: "no" } });
      const result = await generateValidated(request, { llm });
      expect(result).toEqual({ ok: false, error: { kind, message: "no" } });
      expect(llm.calls).toHaveLength(1);
    }
  });

  it("retries when the reply fits the schema but fails the semantic check", async () => {
    const llm = new FakeLLMClient().on("demo", { answer: 4 }, { answer: 5 });
    const semantic = (value: { answer: number }) => (value.answer % 2 === 0 ? ["answer must be odd"] : []);
    expect(await generateValidated({ ...request, semantic }, { llm })).toEqual({ ok: true, value: { answer: 5 } });
    expect(llm.calls[1]?.user).toContain("answer must be odd");
  });

  it("writes one log line per call with timing and outcome, and no prompt text", async () => {
    const logs: AICallLog[] = [];
    let clock = 1000;
    const llm = new FakeLLMClient().on("demo", { answer: 99 }, { answer: 3 });
    await generateValidated(request, { llm, log: (entry) => logs.push(entry), now: () => (clock += 250) });
    expect(logs).toEqual([
      { event: "llm_call", task: "demo", promptVersion: "demo@1", adapter: "fake", model: "fake", attempts: 2, latencyMs: 250, outcome: "ok" },
    ]);
  });
});

describe("parseJson", () => {
  it("accepts bare JSON, fenced JSON and JSON inside a sentence", () => {
    expect(parseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJson('Here you go: {"a":{"b":2}} Hope that helps!')).toEqual({ ok: true, value: { a: { b: 2 } } });
  });

  it("reports text with no JSON, or broken JSON, as malformed", () => {
    for (const text of ["I cannot help with that.", '{"a": 1,}', "}{"]) {
      const result = parseJson(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("MALFORMED");
    }
  });
});

describe("OpenAICompatibleClient", () => {
  const reply = (content: unknown, status = 200) =>
    new Response(JSON.stringify(status === 200 ? { choices: [{ message: { content } }] } : { error: "x" }), { status });

  function client(respond: (url: string, init: RequestInit) => Response | Promise<Response>, options = {}) {
    const calls: { url: string; init: RequestInit; body: any }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init, body: JSON.parse(String(init.body)) });
      return respond(url, init);
    }) as unknown as typeof fetch;
    return { calls, llm: new OpenAICompatibleClient({ baseUrl: "http://model.test/v1/", model: "small", fetch: fake, ...options }) };
  }

  it("posts the prompt and the JSON schema, and returns the parsed reply", async () => {
    const { llm, calls } = client(() => reply('{"answer": 7}'), { apiKey: "test-key" });
    expect(await llm.generate(request)).toEqual({ ok: true, value: { answer: 7 } });
    const call = calls[0]!;
    expect(call.url).toBe("http://model.test/v1/chat/completions");
    expect((call.init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(call.body.model).toBe("small");
    expect(call.body.response_format.type).toBe("json_schema");
    expect(call.body.response_format.json_schema.schema.properties.answer).toBeDefined();
    expect(call.body.messages[0].content).toContain("JSON Schema");
    expect(call.body.messages[1].content).toBe("Pick a number.");
  });

  it("sends no Authorization header without a key, and asks for a plain JSON object in object mode", async () => {
    const { llm, calls } = client(() => reply('{"answer": 1}'), { jsonMode: "object" });
    await llm.generate(request);
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(calls[0]!.body.response_format).toEqual({ type: "json_object" });
  });

  it("reports rate limits, server errors and network failures as unavailable", async () => {
    const cases = [() => reply(null, 429), () => reply(null, 500), () => Promise.reject(new Error("ECONNREFUSED"))];
    for (const respond of cases) {
      const result = await client(respond).llm.generate(request);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("UNAVAILABLE");
    }
  });

  it("reports an empty reply or an unexpected response body as malformed", async () => {
    for (const respond of [() => reply(null), () => new Response("<html>", { status: 200 }), () => reply("no json here")]) {
      const result = await client(respond).llm.generate(request);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("MALFORMED");
    }
  });

  it("reports a refusal", async () => {
    const respond = () => new Response(JSON.stringify({ choices: [{ message: { content: null, refusal: "I can't do that." } }] }));
    expect(await client(respond).llm.generate(request)).toEqual({ ok: false, error: { kind: "REFUSED", message: "I can't do that." } });
  });
});
