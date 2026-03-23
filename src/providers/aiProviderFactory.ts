import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIModelProvider } from "./interfaces";
import { MockAiModelProvider } from "./mockAiProvider";

const DEFAULT_PROVIDER_TIMEOUT_MS = 12_000;

export class AiProviderFactory implements AIModelProvider {
  constructor(private readonly defaultMode: string = "gemini") {}

  get mode() {
    return this.defaultMode;
  }

  async generateNarrative(input: {
    systemPrompt: string;
    userPrompt: string;
    facts: string[];
    model?: string;
    apiKey?: string;
    provider?: string;
  }) {
    const provider = input.provider || this.defaultMode;

    if (provider === "gemini") {
      return this.callGemini(input);
    }
    if (provider === "openai") {
      return this.callOpenAi(input);
    }
    if (provider === "anthropic") {
      return this.callAnthropic(input);
    }

    return new MockAiModelProvider().generateNarrative(input);
  }

  async generateJSON<T>(input: {
    systemPrompt: string;
    userPrompt: string;
    facts: string[];
    schema?: Record<string, unknown>;
    model?: string;
    apiKey?: string;
    provider?: string;
  }): Promise<T> {
    const provider = input.provider || this.defaultMode;

    if (provider === "openai") {
      return this.callOpenAiJson<T>(input);
    }
    if (provider === "anthropic") {
      return this.callAnthropicJson<T>(input);
    }
    if (provider !== "gemini") {
      return new MockAiModelProvider().generateJSON<T>(input);
    }

    const apiKey = input.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new MockAiModelProvider().generateJSON<T>(input);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: input.model || "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const prompt = `
System: ${input.systemPrompt}
${input.schema ? `\nSTRICT JSON SCHEMA REQUIRED:\n${JSON.stringify(input.schema, null, 2)}\n` : ""}

Facts:
${input.facts.map((f) => `- ${f}`).join("\n")}

User: ${input.userPrompt}
`;

    const result = await withTimeout(
      model.generateContent(prompt),
      DEFAULT_PROVIDER_TIMEOUT_MS,
      "Gemini JSON request timed out.",
    );
    const text = result.response.text();
    return JSON.parse(text) as T;
  }

  private async callGemini(input: { systemPrompt: string; userPrompt: string; facts: string[]; model?: string; apiKey?: string; provider?: string; }) {
    const apiKey = input.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new MockAiModelProvider().generateNarrative(input);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: input.model || "gemini-2.5-flash" });
    const prompt = buildPrompt(input);

    const result = await withTimeout(
      model.generateContent(prompt),
      DEFAULT_PROVIDER_TIMEOUT_MS,
      "Gemini request timed out.",
    );
    return result.response.text();
  }

  private async callOpenAi(input: {
    systemPrompt: string;
    userPrompt: string;
    facts: string[];
    model?: string;
    apiKey?: string;
  }) {
    const apiKey = input.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new MockAiModelProvider().generateNarrative(input);
    }

    const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: input.model || "gpt-4o-mini",
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: buildUserPrompt(input) },
        ],
      }),
    });

    const payload = (await response.json()) as OpenAiChatResponse;
    if (!response.ok) {
      throw new Error(readApiError(payload.error?.message, "OpenAI request failed."));
    }

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenAI response was empty.");
    }
    return content;
  }

  private async callAnthropic(input: {
    systemPrompt: string;
    userPrompt: string;
    facts: string[];
    model?: string;
    apiKey?: string;
  }) {
    const apiKey = input.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new MockAiModelProvider().generateNarrative(input);
    }

    const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: input.model || "claude-3-5-sonnet-latest",
        max_tokens: 1024,
        system: input.systemPrompt,
        messages: [{ role: "user", content: buildUserPrompt(input) }],
      }),
    });

    const payload = (await response.json()) as AnthropicMessageResponse;
    if (!response.ok) {
      throw new Error(readApiError(payload.error?.message, "Anthropic request failed."));
    }

    const content = payload.content?.find((item) => item.type === "text")?.text?.trim();
    if (!content) {
      throw new Error("Anthropic response was empty.");
    }
    return content;
  }

  private async callOpenAiJson<T>(input: {
    systemPrompt: string;
    userPrompt: string;
    facts: string[];
    schema?: Record<string, unknown>;
    model?: string;
    apiKey?: string;
  }): Promise<T> {
    const apiKey = input.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new MockAiModelProvider().generateJSON<T>(input);
    }

    const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: input.model || "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: buildUserPrompt(input, true) },
        ],
      }),
    });

    const payload = (await response.json()) as OpenAiChatResponse;
    if (!response.ok) {
      throw new Error(readApiError(payload.error?.message, "OpenAI JSON request failed."));
    }

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenAI JSON response was empty.");
    }
    return JSON.parse(content) as T;
  }

  private async callAnthropicJson<T>(input: {
    systemPrompt: string;
    userPrompt: string;
    facts: string[];
    schema?: Record<string, unknown>;
    model?: string;
    apiKey?: string;
  }): Promise<T> {
    const apiKey = input.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new MockAiModelProvider().generateJSON<T>(input);
    }

    const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: input.model || "claude-3-5-sonnet-latest",
        max_tokens: 2048,
        system: `${input.systemPrompt}\n\nReturn valid JSON only.`,
        messages: [{ role: "user", content: buildUserPrompt(input, true) }],
      }),
    });

    const payload = (await response.json()) as AnthropicMessageResponse;
    if (!response.ok) {
      throw new Error(readApiError(payload.error?.message, "Anthropic JSON request failed."));
    }

    const content = payload.content?.find((item) => item.type === "text")?.text?.trim();
    if (!content) {
      throw new Error("Anthropic JSON response was empty.");
    }
    return JSON.parse(extractJson(content)) as T;
  }
}

function buildPrompt(input: {
  systemPrompt: string;
  userPrompt: string;
  facts: string[];
  schema?: Record<string, unknown>;
}) {
  return `System: ${input.systemPrompt}
${input.schema ? `\nSTRICT JSON SCHEMA REQUIRED:\n${JSON.stringify(input.schema, null, 2)}\n` : ""}

Facts:
${input.facts.map((fact) => `- ${fact}`).join("\n")}

User: ${input.userPrompt}`;
}

function buildUserPrompt(
  input: {
    userPrompt: string;
    facts: string[];
    schema?: Record<string, unknown>;
  },
  jsonOnly = false,
) {
  const jsonDirective = jsonOnly && input.schema
    ? `\n\nReturn JSON that matches this schema:\n${JSON.stringify(input.schema, null, 2)}`
    : jsonOnly
      ? "\n\nReturn valid JSON only."
      : "";
  return `${input.userPrompt}

Facts:
${input.facts.map((fact) => `- ${fact}`).join("\n")}${jsonDirective}`;
}

function extractJson(input: string) {
  const fenced = input.match(/```json\s*([\s\S]*?)```/i) ?? input.match(/```\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() || input;
}

function readApiError(message: string | undefined, fallback: string) {
  return message?.trim() || fallback;
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Provider request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error instanceof Error ? error : new Error("AI provider request failed."));
      },
    );
  });
}

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type AnthropicMessageResponse = {
  content?: Array<{
    type: string;
    text?: string;
  }>;
  error?: {
    message?: string;
  };
};
