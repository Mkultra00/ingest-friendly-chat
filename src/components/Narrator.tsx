import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pause, Play, Volume2 } from "lucide-react";

import { narrate } from "@/lib/tts.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  /** Stable key: changing it invalidates cached audio. */
  cacheKey: string;
  text: string;
  label?: string;
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
};

/**
 * Speaks a script through ElevenLabs. Audio is cached per cacheKey because
 * identical text is billed on every request.
 */
export function Narrator({
  cacheKey,
  text,
  label = "Read out loud",
  variant = "default",
  size = "default",
}: Props) {
  const speak = useServerFn(narrate);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cache = useRef(new Map<string, string>());

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const play = useCallback(async () => {
    if (playing) {
      stop();
      return;
    }
    try {
      let src = cache.current.get(cacheKey);
      if (!src) {
        setLoading(true);
        const { audioBase64 } = await speak({ data: { text: text.slice(0, 4000) } });
        src = `data:audio/mpeg;base64,${audioBase64}`;
        cache.current.set(cacheKey, src);
      }
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = src;
      audio.onended = () => setPlaying(false);
      audio.onpause = () => setPlaying(false);
      await audio.play();
      setPlaying(true);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Narration failed");
    } finally {
      setLoading(false);
    }
  }, [cacheKey, playing, speak, stop, text]);

  const Icon = loading ? Loader2 : playing ? Pause : size === "icon" ? Volume2 : Play;

  return (
    <Button onClick={play} disabled={loading} variant={variant} size={size}>
      <Icon className={loading ? "animate-spin" : undefined} />
      {size === "icon" ? <span className="sr-only">{label}</span> : label}
    </Button>
  );
}
