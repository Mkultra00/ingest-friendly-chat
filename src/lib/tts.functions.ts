import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  // ElevenLabs handles long text, but a hard cap keeps a runaway briefing from
  // burning credits on one click.
  text: z.string().min(1).max(4000),
  /** Theatrical comedy rewrite before speaking. Default on. */
  comedy: z.boolean().optional().default(true),
});

export const narrate = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const { synthesize } = await import("./tts.server");
    const audioBase64 = await synthesize(data.text, data.comedy);
    return { audioBase64 };
  });

