# FastSpell

Autocorrect and voice typing for Discord, built as a [Vencord](https://vencord.dev) plugin.

Discord's spellchecker just underlines words in red and honestly it's slow half the time. FastSpell actually fixes the word the moment you finish typing it, like a phone keyboard does. It also adds a mic button to the chat bar so you can talk instead of type.

## What it does

**Autocorrect**
- Fixes typos instantly when you hit space or punctuation: `teh` → `the`, `becuase` → `because`, `definately` → `definitely`
- Auto-capitalization like a phone keyboard: sentence starts get a capital letter, `i` becomes `I` (can be turned off)
- Keeps your capitalization (`Wrold` → `World`)
- Knows internet slang — it won't "fix" lol, bruh, ngl, rizz and friends
- Leaves mentions, emojis, links, code blocks and ALL-CAPS words alone
- Runs fully offline after the first start (it downloads an 82k word dictionary once and caches it)

**Voice typing**
- Click the mic button, talk, click again — your words show up in the chat box
- Uses Whisper through Groq's API (free key, takes a minute to make) so it's fast and accurate, and it auto-detects the language you speak
- Optional translation: pick an output language in the panel and whatever you say gets typed out in that language — speak Arabic, send English

**The panel**
- Click the spellcheck button (Aa✓) in the chat bar to open the panel
- Toggle autocorrect on/off (or right-click the button for a quick toggle)
- Add words it should never touch
- Add your own corrections, like `im` → `I'm` or `alot` → `a lot`
- Pick the language voice typing should translate into (leave it empty to keep the language you spoke)
- Your word list and corrections are saved in Discord's own storage, not the plugin settings file, so they survive plugin updates and reinstalls

## Install (Windows)

1. Download `FastSpell-windows.zip` from the [latest release](../../releases/latest) and extract it somewhere
2. Close Discord completely (right-click the tray icon → Quit Discord)
3. Right-click `install.ps1` → **Run with PowerShell**
4. Start Discord, go to Settings → Vencord → Plugins, and turn on **FastSpell**

That's it for autocorrect. For voice typing, grab a free API key at [console.groq.com/keys](https://console.groq.com/keys) and paste it into the FastSpell plugin settings (`sttApiKey`).

A couple of notes:
- This installs a full Vencord build with FastSpell included. If you already use Vencord, this replaces your install (all your plugins and settings stay, you just get FastSpell on top). Don't use Vencord's built-in updater afterwards — it would remove FastSpell. Update by installing a newer release from here instead.
- When Discord updates itself it sometimes wipes the patch. If the plugin disappears, just run `install.ps1` again.
- To go back to plain Discord run `uninstall.ps1`.

## Build from source

FastSpell is a Vencord userplugin, so you build it as part of Vencord:

```
git clone https://github.com/Vendicated/Vencord
cd Vencord
pnpm install --frozen-lockfile
```

Copy the `fastSpell` folder from this repo into `src/userplugins/`, then:

```
pnpm build
pnpm inject
```

Restart Discord and enable the plugin. See the [Vencord docs](https://docs.vencord.dev/installing/custom-plugins/) if you get stuck.

## How the autocorrect works

Nothing fancy: a frequency-ranked edit-distance search (the classic Norvig approach) over the [SymSpell English frequency dictionary](https://github.com/wolfgarbe/SymSpell). A word you typed is looked up in the dictionary; if it's unknown, every spelling within edit distance 1 (then 2) is generated and the most common real word wins. Worst case is about 2–3 ms, correctly spelled words cost basically nothing, and everything runs locally.

Voice recording uses Discord's own voice module, and the audio only goes to the speech-to-text provider you configured, nowhere else.

## Credits

- [Vencord](https://github.com/Vendicated/Vencord) — the client mod this runs on. The release zip is a Vencord build, unmodified except for this plugin.
- [SymSpell](https://github.com/wolfgarbe/SymSpell) — the word frequency dictionary
- Whisper (via [Groq](https://groq.com)) — speech to text

## License

[GPL-3.0](LICENSE), same as Vencord.
