/**
 * ElevenLabs narration. Server-only: the API key never reaches the browser.
 * Called from tts.functions.ts, never imported by a component.
 *
 * Two stages:
 *   1. punchUp()   — Lovable AI rewrites the dry finding into a theatrical,
 *                    stand-up-roast script (numbers preserved verbatim).
 *   2. synthesize() — ElevenLabs speaks it with expressive voice settings.
 */

const VOICE_ID = "cjVigY5qzO86Huf0OWal"; // Eric — warm, animated, comic timing
const MODEL_ID = "eleven_multilingual_v2";

const COMEDY_SYSTEM = `You are the narrator of a construction-document review show: half courtroom drama, half stand-up roast.

Rewrite the user's dry technical text as a spoken script that is VERY emotional and VERY funny.

Hard rules:
- Keep every number, mark, code reference and unit EXACTLY as written. Never invent or change a value. Accuracy is the joke's setup; the numbers are the punchline.
- Be gleefully theatrical: gasps, mock heartbreak, dramatic pauses (use "..." and em dashes), disbelief, sudden whispers, triumphant declarations.
- Roast the drawings, never the people. No profanity, no slurs, no insults toward the user.
- Punch up with construction-nerd humor: doors that lie, schedules with commitment issues, slopes that skipped math class.
- Written for the ear: short sentences, plain punctuation, no markdown, no headings, no emoji, no stage directions in brackets.
- Length: at most 1.4x the input, and never more than 250 words.

Return only the script.`;

async function punchUp(text: string): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return text;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.95,
        messages: [
          { role: "system", content: COMEDY_SYSTEM },
          { role: "user", content: text },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`Comedy rewrite failed [${response.status}]: ${detail.slice(0, 300)}`);
      return text;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const script = payload.choices?.[0]?.message?.content?.trim();
    return script && script.length > 20 ? script : text;
  } catch (err) {
    console.error("Comedy rewrite threw, falling back to the dry script", err);
    return text;
  }
}

export async function synthesize(text: string, comedy = true): Promise<string> {
  const apiKey = process.env["ELEVENLABS_API_KEY"];
  if (!apiKey) {
    throw new Error("ElevenLabs is not connected to this project.");
  }

  const script = comedy ? await punchUp(text) : text;

  // output_format is a query parameter, not a body field.
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: script,
        model_id: MODEL_ID,
        voice_settings: {
          // Low stability + high style = wildly expressive, character-actor delivery.
          stability: 0.22,
          similarity_boost: 0.7,
          style: 0.85,
          use_speaker_boost: true,
          speed: 1.05,
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`ElevenLabs TTS failed [${response.status}]: ${detail}`);
    throw new Error(`Narration failed [${response.status}]: ${detail.slice(0, 400)}`);
  }

  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}
