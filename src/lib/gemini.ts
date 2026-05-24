function getGeminiApiKey() {
  const value = process.env.GEMINI_API_KEY?.trim();

  if (!value) {
    throw new Error("Missing required environment variable: GEMINI_API_KEY");
  }

  return value;
}

function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash-lite";
}

type GeminiGenerateTextInput = {
  prompt: string;
  temperature?: number;
};

type GeminiCandidate = {
  content?: {
    parts?: Array<{
      text?: string;
    }>;
  };
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
};

function extractText(payload: GeminiResponse) {
  const text = payload.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
}

export async function generateGeminiText(input: GeminiGenerateTextInput) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${getGeminiModel()}:generateContent?key=${encodeURIComponent(getGeminiApiKey())}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: input.prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: input.temperature ?? 0.4,
          topP: 0.8,
          topK: 20,
          maxOutputTokens: 300,
        },
      }),
    },
  );

  const payload = (await response.json()) as GeminiResponse & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || "Gemini request failed.");
  }

  return extractText(payload);
}
