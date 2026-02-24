const AI_ENDPOINT = "https://my.living-apps.de/litellm/v1/chat/completions";
const AI_MODEL = "default";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; [key: string]: unknown }>;
};

type CompletionOptions = {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string[];
  response_format?: { type: string };
};

export async function chatCompletion(
  messages: ChatMessage[],
  options: CompletionOptions = {}
): Promise<string> {
  const res = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ model: AI_MODEL, messages, ...options }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI API ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

export async function safeJsonCompletion<T = unknown>(
  messages: ChatMessage[],
  options: CompletionOptions = {}
): Promise<T> {
  const raw = await chatCompletion(messages, options);
  const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error(`Expected JSON but got: ${raw.slice(0, 200)}`);
  return JSON.parse(match[0]);
}

export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error("unreachable");
}

// --- File encoding helpers ---

export function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export async function urlToDataUri(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to encode file"));
    reader.readAsDataURL(blob);
  });
}

// --- High-level AI features ---

export async function classify(
  text: string,
  categories: string[]
): Promise<{ category: string; confidence: number }> {
  return safeJsonCompletion([
    {
      role: "system",
      content: [
        "You are a classifier. Respond ONLY with valid JSON, nothing else.",
        'Output format: {"category": "<one of the allowed categories>", "confidence": <0-1>}',
        `Allowed categories: ${JSON.stringify(categories)}`,
      ].join("\n"),
    },
    { role: "user", content: text },
  ], { temperature: 0 });
}

export async function extract<T = Record<string, unknown>>(
  text: string,
  schemaDescription: string
): Promise<T> {
  return safeJsonCompletion([
    {
      role: "system",
      content: [
        "You are a data extraction engine. Respond ONLY with valid JSON matching the requested schema.",
        "If a field cannot be determined from the input, use null.",
        `Schema:\n${schemaDescription}`,
      ].join("\n"),
    },
    { role: "user", content: text },
  ], { temperature: 0 });
}

export async function summarize(
  text: string,
  options: { maxSentences?: number; language?: string } = {}
): Promise<string> {
  const { maxSentences = 3, language } = options;
  const instructions = [
    `Summarize the following text in at most ${maxSentences} sentences.`,
    "Be concise and preserve key facts.",
  ];
  if (language) instructions.push(`Write the summary in ${language}.`);
  return chatCompletion([
    { role: "system", content: instructions.join(" ") },
    { role: "user", content: text },
  ]);
}

export async function translate(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string
): Promise<string> {
  const from = sourceLanguage ? ` from ${sourceLanguage}` : "";
  return chatCompletion([
    {
      role: "system",
      content: `Translate the following text${from} to ${targetLanguage}. Output ONLY the translation, nothing else.`,
    },
    { role: "user", content: text },
  ]);
}

export async function analyzeImage(imageDataUri: string, prompt: string): Promise<string> {
  return chatCompletion([
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageDataUri } },
      ],
    },
  ]);
}

export async function analyzeDocument(fileDataUri: string, prompt: string): Promise<string> {
  return chatCompletion([
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "file", file: { file_data: fileDataUri } },
      ],
    },
  ]);
}

export async function extractFromPhoto<T = Record<string, unknown>>(
  dataUri: string,
  schemaDescription: string
): Promise<T> {
  const isImage = dataUri.startsWith("data:image/");
  const fileContent = isImage
    ? { type: "image_url" as const, image_url: { url: dataUri } }
    : { type: "file" as const, file: { file_data: dataUri } };
  return safeJsonCompletion([
    {
      role: "system",
      content: [
        "Extract structured data from the provided " + (isImage ? "image" : "document") + ".",
        "Respond ONLY with valid JSON matching the schema.",
        "Use null for any field that cannot be determined.",
        `Schema:\n${schemaDescription}`,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        { type: "text", text: "Extract the data from this " + (isImage ? "image" : "document") + "." },
        fileContent,
      ],
    },
  ]);
}
