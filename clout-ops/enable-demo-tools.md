# Enabling the toolsets I need (Clout demo video build)

The Hermes agent cannot edit its own `config.yaml` — the file tools refuse it by
design, and the hub skill says never hand-edit it anyway. So this is your step.

Current state, verified from `/opt/hermes/.hermes/config.yaml` (lines 201-213):
`platform_toolsets.telegram` is a hand-restricted list of nine entries
(bfl, clarify, file, kanban, memory, skills, todo, vision, web). That is why I
have no shell, no browser, and no scheduler in this chat.

## Option A — what I actually need (recommended)

Adds: browser, cronjob, tts, video, video_gen, image_gen, session_search.
No terminal, no code execution, so no shell ever appears in a chat turn.

    hermes tools enable browser cronjob tts video video_gen image_gen session_search --platform telegram

Why this is enough for the video:

| Toolset | Gives me |
|---|---|
| `browser` | drive the live Clout app, screenshot it, run JS in the page, raw CDP |
| `cronjob` | run my build script **on the box** (no_agent script job) — TTS, Playwright, ffmpeg |
| `tts` | voice generation from chat |
| `video` / `video_gen` | inspect the rendered MP4, generate b-roll if needed |
| `image_gen` | stills / title cards |
| `session_search` | recover context from earlier sessions |

`stt` needs nothing: it is already on (`stt.enabled: true`, local model `base`).

The build itself runs as a scheduled `no_agent` script, so the pipeline
(kokoro TTS, Playwright recording of the live product, whisper captions, ffmpeg
burn-in, ambient pad) never needs a shell command in the chat.

## Option B — full hands, one caveat

    hermes tools enable terminal code_execution --platform telegram

This is the fast path (I run and verify every stage myself, live). The caveat is
yours from the standing rule: AgentRouter blocks turns containing command lines,
so a terminal tool call in a Telegram turn is exactly the shape that has wedged
this chat before. Option A avoids that entirely.

## Then: rebuild the gateway

Config is read at startup, and on this box a plain restart does not reliably
clear a wedged session. Use the standard full rebuild you always use for a
config change (pm2 delete, then start from `ecosystem.config.js`, then pm2 save).

Confirm it took:

    hermes tools list --platform telegram

## Verify from Telegram

Send me anything after the rebuild. If `cronjob` and `browser` show up in my
tool list, I can build the five minute cut without you running anything else.

## Reverting

`hermes tools disable <name> --platform telegram` for any of them, or restore the
nine-entry list above.
