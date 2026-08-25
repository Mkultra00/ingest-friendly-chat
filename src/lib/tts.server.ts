/**
 * ElevenLabs narration. Server-only: the API key never reaches the browser.
 * Called from tts.functions.ts, never imported by a component.
 */

const VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // George — steady, briefing-room delivery
const MODEL_ID = "eleven_multilingual_v2";

export async function synthesize(text: string): Promise<string> {
  const apiKey = process.env["ELEVENLABS_API_KEY"];
  if (!apiKey) {
    throw new Error("ElevenLabs is not connected to this project.");
  }

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
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.75,
          style: 0.25,
          use_speaker_boost: true,
          speed: 1.0,
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
