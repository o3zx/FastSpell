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
import { addCustomCorrection, getCustomCorrections, loadCustomCorrections, removeCustomCorrection } from "./customCorrections";
import { settings } from "./settings";
import { correct, getCustomCorrection, isKnown, isLoaded, parseDictionary } from "./spellcheck";
import { MicIcon, SpeechChatBarButton } from "./SpeechButton";

const logger = new Logger("FastSpell");
const DICT_KEY = "FastSpell_dictionary";

// keys that mark the end of a word while typing
const TRIGGER_KEYS = new Set([" ", ".", ",", "!", "?", ";", ":"]);

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
    if (getUserDict().has(word.toLowerCase())) return false;
    return true;
}

/*
 * Corrections are applied through the slate editor instance itself
 * (deleteBackward + insertText), which is fully synchronous — no timing races,
 * no duplicated words when typing fast. Never mutate the slate DOM directly
 * (execCommand, Selection.modify): it desyncs slate and the chat box stops
 * responding to backspace/typing. Dispatching INSERT_TEXT after setting a DOM
 * selection is racy too: slate picks the selection up asynchronously, so under
 * fast typing the insert lands at the old caret and duplicates the word.
 */

function isSlateEditor(x: any): boolean {
    return !!x
        && typeof x.insertText === "function"
        && typeof x.deleteBackward === "function"
        && typeof x.apply === "function"
        && Array.isArray(x.children);
}

const slateCache = new WeakMap<HTMLElement, any>();

/** Digs the slate editor instance out of the chat box's React fiber tree. */
function findSlateEditor(el: HTMLElement): any {
    const cached = slateCache.get(el);
    if (cached) return cached;

    const fiberKey = Object.keys(el).find(k => k.startsWith("__reactFiber$"));
    if (!fiberKey) return null;

    let fiber: any = (el as any)[fiberKey];
    for (let i = 0; fiber && i < 40; i++) {
        for (const props of [fiber.memoizedProps, fiber.pendingProps]) {
            if (!props) continue;
            if (isSlateEditor(props.editor)) return slateCache.set(el, props.editor), props.editor;
            const v = props.value;
            if (isSlateEditor(v)) return slateCache.set(el, v), v;
            if (Array.isArray(v)) {
                const hit = v.find(isSlateEditor);
                if (hit) return slateCache.set(el, hit), hit;
            }
        }
        fiber = fiber.return;
    }
    return null;
}

/** True if nothing (text, mentions, emojis...) comes before this text node on its chat line. */
function isLineStart(node: Node): boolean {
    let n: Node | null = node;
    while (n) {
        if (n instanceof HTMLElement && n.getAttribute("data-slate-node") === "element") return true;
        if (n.previousSibling) return false;
        n = n.parentNode;
    }
    return true;
}

// Sentence-ending punctuation, optionally followed by closing quotes/brackets.
// The lookbehind keeps "..." (and …) from capitalizing the next word — trailing
// dots in chat are a pause, not a sentence end.
const SENTENCE_END = /(?<![.…])[.!?]["')\]]*$/;

function isSentenceStart(preceding: string, node: Node): boolean {
    const t = preceding.trimEnd();
    if (t === "") return isLineStart(node);
    return SENTENCE_END.test(t);
}

/** Applies phone-style capitalization to a word that is about to be committed. */
function autoCapitalize(word: string, preceding: string, node: Node): string {
    if (!/^[a-z]/.test(word)) return word;
    if (word === "i") return "I";
    if (isSentenceStart(preceding, node)) return word[0].toUpperCase() + word.slice(1);
    return word;
}

function onKeyDown(e: KeyboardEvent) {
    const correcting = settings.store.autocorrect && isLoaded();
    const capitalizing = settings.store.autoCapitalize;
    if (!correcting && !capitalizing) return;

    if (!TRIGGER_KEYS.has(e.key)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const editor = (e.target as HTMLElement)?.closest?.('[data-slate-editor="true"]');
    if (!editor) return;

    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return;
    const node = selection.focusNode;
    if (!node || node.nodeType !== Node.TEXT_NODE) return;

    const beforeCaret = node.textContent!.slice(0, selection.focusOffset);

    // caret must be at the end of the word, not inside one (e.g. after
    // deleting back into the middle of a word)
    const charAfterCaret = node.textContent!.slice(selection.focusOffset, selection.focusOffset + 1);
    if (/[A-Za-z]/.test(charAfterCaret)) return;

    const match = /([A-Za-z]+)$/.exec(beforeCaret);
    if (!match) return;
    const word = match[1];
    const preceding = beforeCaret.slice(0, -word.length);

    let result = word;
    if (correcting && isEligible(word, preceding))
        result = correct(word) ?? word;
    if (capitalizing)
        result = autoCapitalize(result, preceding, node);
    if (result === word) return;

    const slateEditor = findSlateEditor(editor as HTMLElement);
    if (!slateEditor) return;

    e.preventDefault();
    e.stopPropagation();
    try {
        for (let i = 0; i < word.length; i++) slateEditor.deleteBackward("character");
        slateEditor.insertText(result + e.key);
    } catch (err) {
        logger.error("Failed to apply correction", err);
    }
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

/** Capitalizes sentence starts and lone "i" across the message, skipping code segments. */
function capitalizeSentences(text: string) {
    return text
        .split(/(```[\s\S]*?```|`[^`\n]*`)/)
        .map((part, i) => {
            if (i % 2 === 1) return part; // code segment
            return part
                .replace(/(^\s*|\n\s*|(?<![.…])[.!?]["')\]]*\s+)([a-z])/g, (_, pre, c) => pre + c.toUpperCase())
                .replace(/(^|[\s("'[])i(?=[\s,.!?;:')\]]|'|$)/g, (_, pre) => pre + "I");
        })
        .join("");
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
    return Promise.race([promise, new Promise<undefined>(r => setTimeout(() => r(undefined), ms))]);
}

async function loadDictionary() {
    try {
        // the cache read can hang when Discord is still booting, hence the timeout
        let text = await withTimeout(DataStore.get<string>(DICT_KEY).catch(() => undefined), 5000);

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
        }
    } catch (e) {
        logger.error("Failed to load dictionary", e);
    }
}

let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retriesLeft = 10;

/** Keeps retrying until the dictionary is up — a load attempt during Discord's boot can fail transiently. */
async function loadDictionaryWithRetry() {
    await loadDictionary();
    if (!isLoaded() && retriesLeft-- > 0) {
        logger.warn(`Dictionary not loaded yet, retrying in 10s (${retriesLeft} attempts left)`);
        retryTimer = setTimeout(loadDictionaryWithRetry, 10_000);
    }
}

let ccRetryTimer: ReturnType<typeof setTimeout> | undefined;
let ccRetriesLeft = 5;

/** Loads custom corrections from DataStore, migrating any pairs still stored in settings. */
async function loadCorrectionsWithRetry() {
    // older versions kept the pairs in settings.json, which every Discord branch
    // shares and rewrites wholesale — migrate them out so they stop getting lost
    const legacy = { ...(settings.store.customCorrections ?? {}) };
    try {
        await loadCustomCorrections(legacy);
        if (Object.keys(legacy).length > 0) delete settings.store.customCorrections;
    } catch (e) {
        if (ccRetriesLeft-- > 0) {
            logger.warn("Custom corrections not loaded yet, retrying in 10s");
            ccRetryTimer = setTimeout(loadCorrectionsWithRetry, 10_000);
        } else {
            logger.error("Failed to load custom corrections", e);
        }
    }
}

export default definePlugin({
    name: "FastSpell",
    description: "Fast autocorrect + auto-capitalization while you type, and a voice typing button that can also translate your speech",
    authors: [{ name: "suhail", id: 0n }],

    settings,

    chatBarButton: {
        icon: MicIcon,
        render: SpeechChatBarButton
    },

    start() {
        retriesLeft = 10;
        ccRetriesLeft = 5;
        loadDictionaryWithRetry();
        loadCorrectionsWithRetry();
        document.addEventListener("keydown", onKeyDown, true);
        addChatBarButton("FastSpellAutocorrect", AutocorrectChatBarButton, SpellIcon);
    },

    stop() {
        clearTimeout(retryTimer);
        clearTimeout(ccRetryTimer);
        document.removeEventListener("keydown", onKeyDown, true);
        removeChatBarButton("FastSpellAutocorrect");
    },

    onBeforeMessageSend(_channelId, message) {
        if (!message.content) return;

        if (isLoaded()) {
            if (settings.store.correctOnSend)
                message.content = correctWholeMessage(message.content);
            else if (settings.store.autocorrect)
                message.content = correctTrailingWord(message.content);
        }
        if (settings.store.autoCapitalize)
            message.content = capitalizeSentences(message.content);
    },

    // handy for debugging from the console
    correct,
    isKnown,
    getCustomCorrections,
    addCustomCorrection,
    removeCustomCorrection
});
