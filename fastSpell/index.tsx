/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addChatBarButton, removeChatBarButton } from "@api/ChatButtons";
import * as DataStore from "@api/DataStore";
import { Logger } from "@utils/Logger";
import definePlugin, { PluginNative } from "@utils/types";

import { AutocorrectChatBarButton, SpellIcon } from "./AutocorrectButton";
import { settings } from "./settings";
import { configureCustomCorrections, correct, getCustomCorrection, isKnown, isLoaded, parseDictionary } from "./spellcheck";
import { MicIcon, SpeechChatBarButton } from "./SpeechButton";

const logger = new Logger("FastSpell");
const DICT_KEY = "FastSpell_dictionary";

// keys that mark the end of a word while typing
const TRIGGER_KEYS = new Set([" ", ".", ",", "!", "?", ";", ":"]);

// words the user "un-corrected" with backspace this session; never touch them again
const sessionIgnore = new Set<string>();

let lastCorrection: { original: string; fixed: string; suffix: string; } | null = null;

let userDictRaw = "";
let userDict = new Set<string>();
function getUserDict() {
    const raw = settings.store.userDictionary;
    if (raw !== userDictRaw) {
        userDictRaw = raw;
        userDict = new Set(raw.toLowerCase().split(/[\s,]+/).filter(Boolean));
    }
    return userDict;
}

function isEligible(word: string, preceding: string) {
    // custom corrections bypass the length limit ("im" -> "I'm" etc.)
    if (word.length < settings.store.minWordLength && !getCustomCorrection(word)) return false;
    // ALL-CAPS words are usually intentional
    if (word.length > 1 && word === word.toUpperCase()) return false;
    if (settings.store.ignoreCapitalized && /^[A-Z]/.test(word)) return false;
    // part of a mention, channel, emoji name, command, url, hyphenated word, contraction...
    if (/[@#:/\\'’\-&_.\d]$/.test(preceding)) return false;
    const lower = word.toLowerCase();
    if (sessionIgnore.has(lower) || getUserDict().has(lower)) return false;
    return true;
}

function replaceBeforeCaret(selection: Selection, charCount: number, replacement: string) {
    for (let i = 0; i < charCount; i++)
        (selection as any).modify("extend", "backward", "character");
    document.execCommand("insertText", false, replacement);
}

function onKeyDown(e: KeyboardEvent) {
    if (!settings.store.autocorrect || !isLoaded()) return;

    const isTrigger = TRIGGER_KEYS.has(e.key);
    const isBackspace = e.key === "Backspace";
    if (!isTrigger && !isBackspace) {
        if (e.key.length === 1) lastCorrection = null;
        return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const editor = (e.target as HTMLElement)?.closest?.('[data-slate-editor="true"]');
    if (!editor) return;

    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return;
    const node = selection.focusNode;
    if (!node || node.nodeType !== Node.TEXT_NODE) return;

    const beforeCaret = node.textContent!.slice(0, selection.focusOffset);

    if (isBackspace) {
        // Deleting right after a correction means the user didn't want it.
        // Let the delete happen normally, but stop correcting that word for
        // the rest of the session so they can type it their way.
        if (lastCorrection) {
            const { original, fixed, suffix } = lastCorrection;
            lastCorrection = null;
            if (beforeCaret.endsWith(fixed + suffix) || beforeCaret.endsWith(fixed))
                sessionIgnore.add(original.toLowerCase());
        }
        return;
    }

    lastCorrection = null;

    const match = /([A-Za-z]+)$/.exec(beforeCaret);
    if (!match) return;
    const word = match[1];
    const preceding = beforeCaret.slice(0, -word.length);

    if (!isEligible(word, preceding)) return;

    const fixed = correct(word);
    if (!fixed) return;

    e.preventDefault();
    e.stopPropagation();
    replaceBeforeCaret(selection, word.length, fixed + e.key);
    lastCorrection = { original: word, fixed, suffix: e.key };
}

/** Corrects the final word of a message (as-you-type mode can't catch it: Enter sends immediately). */
function correctTrailingWord(text: string) {
    const match = /([A-Za-z]+)([.,!?;:]*)$/.exec(text);
    if (!match) return text;
    const [, word, tail] = match;
    const preceding = text.slice(0, match.index);
    if (!isEligible(word, preceding)) return text;
    // don't touch text inside an unclosed code block
    if ((text.match(/```/g)?.length ?? 0) % 2 === 1) return text;
    const fixed = correct(word);
    if (!fixed) return text;
    return preceding + fixed + tail;
}

/** Corrects every word of the message, skipping code, links, mentions and emojis. */
function correctWholeMessage(text: string) {
    return text
        .split(/(```[\s\S]*?```|`[^`\n]*`)/)
        .map((part, i) => {
            if (i % 2 === 1) return part; // code segment
            return part.replace(/(^|\s)([A-Za-z]+)([.,!?;:]*)(?=\s|$)/g, (full, pre, word, tail) => {
                if (!isEligible(word, pre)) return full;
                const fixed = correct(word);
                return fixed ? pre + fixed + tail : full;
            });
        })
        .join("");
}

async function loadDictionary() {
    try {
        let text = await DataStore.get<string>(DICT_KEY).catch(() => undefined);

        if (!text) {
            if (IS_WEB) {
                const res = await fetch("https://raw.githubusercontent.com/wolfgarbe/SymSpell/master/SymSpell/frequency_dictionary_en_82_765.txt");
                if (res.ok) text = await res.text();
            } else {
                const Native = VencordNative.pluginHelpers.FastSpell as PluginNative<typeof import("./native")>;
                const res = await Native.fetchDictionary();
                if (res.ok) text = res.data;
                else logger.error("Dictionary download failed:", res.error);
            }
            if (text) await DataStore.set(DICT_KEY, text).catch(() => { });
        }

        if (text) {
            const count = parseDictionary(text);
            logger.info(`Dictionary loaded: ${count} words`);
        } else {
            logger.error("No dictionary available; autocorrect is disabled until next restart");
        }
    } catch (e) {
        logger.error("Failed to load dictionary", e);
    }
}

export default definePlugin({
    name: "FastSpell",
    description: "Fast autocorrect while you type + voice typing (speech-to-text) button for the chat box",
    authors: [{ name: "suhail", id: 0n }],

    settings,

    chatBarButton: {
        icon: MicIcon,
        render: SpeechChatBarButton
    },

    start() {
        configureCustomCorrections(() => settings.store.customCorrections ?? {});
        loadDictionary();
        document.addEventListener("keydown", onKeyDown, true);
        addChatBarButton("FastSpellAutocorrect", AutocorrectChatBarButton, SpellIcon);
    },

    stop() {
        document.removeEventListener("keydown", onKeyDown, true);
        removeChatBarButton("FastSpellAutocorrect");
    },

    onBeforeMessageSend(_channelId, message) {
        if (!isLoaded() || !message.content) return;

        if (settings.store.correctOnSend)
            message.content = correctWholeMessage(message.content);
        else if (settings.store.autocorrect)
            message.content = correctTrailingWord(message.content);
    },

    // handy for debugging from the console
    correct,
    isKnown
});
