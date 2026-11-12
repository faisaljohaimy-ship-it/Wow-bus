# Explainer narration (AI-generated)

Source files of the AI voice-over mixed into the explainer by `scripts/voice-mux.mjs`
(see the main README, section 7 "AI narration").

| File | Language | Voice | Provider / model |
|---|---|---|---|
| `explainer-ar.mp3` | Arabic | Saadoun (Saudi narrator) | ElevenLabs · eleven_multilingual_v2 |
| `explainer-en.mp3` | English | Ryan (documentary narrator) | ElevenLabs · eleven_multilingual_v2 |

The narration text is exactly the captions (`src/storyboard.ts` CAPTIONS, `{sources}` spoken as 13).
Re-apply with:

```
npm run voice -- --ar narration/explainer-ar.mp3 --en narration/explainer-en.mp3 \
  --ar-voice "Saadoun" --en-voice "Ryan" --provider ElevenLabs --model eleven_multilingual_v2
```
