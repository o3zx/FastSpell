/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Norvig-style spelling corrector backed by the SymSpell 82k English frequency dictionary.
// correct() only runs for words that are NOT in the dictionary, so the hot path
// (typing correctly spelled words) is a single Map lookup.

import { getCustomCorrections } from "./customCorrections";

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

// Internet/Discord slang the 2008-corpus dictionary doesn't know. Never "corrected".
const EXTRA_WORDS = new Set([
    "lol", "lmao", "lmfao", "rofl", "xd", "bruh", "bro", "sis", "yeet", "pog", "poggers",
    "sus", "sussy", "brb", "btw", "tbh", "imo", "imho", "idk", "idc", "irl", "afk", "gtg",
    "omg", "omfg", "wtf", "smh", "fyi", "dm", "dms", "np", "ty", "tysm", "tyvm", "yw",
    "nvm", "ikr", "ffs", "gg", "ggs", "ez", "wp", "glhf", "afaik", "iirc", "tldr", "ngl",
    "fr", "ong", "rn", "wyd", "wya", "hbu", "wbu", "ily", "ily2", "bff", "fam", "lowkey",
    "highkey", "based", "cringe", "simp", "vibe", "vibes", "vibing", "bet", "cap", "sheesh",
    "bussin", "rizz", "gyat", "skibidi", "sigma", "npc", "ratio", "copium", "hopium",
    "kekw", "pepe", "monka", "sadge", "widepeepo", "pepega", "malding", "poggies",
    "discord", "vencord", "nitro", "emoji", "emojis", "gif", "gifs", "meme", "memes",
    "mod", "mods", "admin", "admins", "bot", "bots", "ping", "pinged", "pings", "vc",
    "server", "servers", "channel", "channels", "spam", "spamming", "noob", "noobs",
    "nerf", "nerfed", "buff", "buffed", "op", "meta", "grind", "grinding", "loot",
    "respawn", "spawn", "spawned", "lag", "laggy", "lagging", "fps", "dps", "hp", "xp",
    "minecraft", "fortnite", "valorant", "roblox", "osu", "overwatch", "chatgpt", "ai",
    "ok", "okay", "yea", "yeah", "yep", "yup", "nah", "nope", "hmm", "hmmm", "uh", "uhh",
    "umm", "ummm", "ooh", "oof", "ouch", "yay", "woo", "wooo", "hehe", "haha", "hahaha",
    "gonna", "wanna", "gotta", "kinda", "sorta", "dunno", "lemme", "gimme", "cuz", "coz",
    "pls", "plz", "thx", "ur", "u", "r", "y", "k", "kk", "rly", "srsly", "prolly", "def",
    "tho", "ppl", "msg", "msgs", "sec", "min", "mins", "hr", "hrs", "tmr", "tmrw",
    "bc", "abt", "w", "wo", "rip", "goat", "goated", "mid", "fire", "slay", "stan", "salty",
    "toxic", "sweaty", "tryhard", "smurf", "clutch", "ace", "whiff", "throw", "int", "inting"
]);

let words = new Map<string, number>(); // word -> corpus frequency
let loaded = false;

const cache = new Map<string, string | null>();

export function getCustomCorrection(word: string): string | null {
    const custom = getCustomCorrections()[word.toLowerCase()];
    return custom ?? null;
}

export function isLoaded() {
    return loaded;
}

export function parseDictionary(text: string) {
    const map = new Map<string, number>();
    for (const line of text.split("\n")) {
        const sep = line.indexOf(" ");
        if (sep === -1) continue;
        const word = line.slice(0, sep);
        const freq = Number(line.slice(sep + 1));
        if (word && freq > 0) map.set(word, freq);
    }
    if (map.size > 0) {
        words = map;
        loaded = true;
        cache.clear();
    }
    return map.size;
}

export function isKnown(word: string) {
    const lower = word.toLowerCase();
    return words.has(lower) || EXTRA_WORDS.has(lower);
}

function edits1(word: string): string[] {
    const res: string[] = [];
    const n = word.length;
    for (let i = 0; i <= n; i++) {
        const left = word.slice(0, i);
        const right = word.slice(i);
        if (right) res.push(left + right.slice(1)); // deletion
        if (right.length > 1) res.push(left + right[1] + right[0] + right.slice(2)); // transposition
        for (const c of LETTERS) {
            if (right) res.push(left + c + right.slice(1)); // replacement
            res.push(left + c + right); // insertion
        }
    }
    return res;
}

function bestOf(candidates: string[]): string | null {
    let best: string | null = null;
    let bestFreq = 0;
    for (const c of candidates) {
        const f = words.get(c);
        if (f !== undefined && f > bestFreq) {
            bestFreq = f;
            best = c;
        }
    }
    return best;
}

function matchCase(original: string, fixed: string) {
    if (original[0] >= "A" && original[0] <= "Z")
        return fixed[0].toUpperCase() + fixed.slice(1);
    return fixed;
}

/**
 * Returns the corrected word, or null if the word is already correct
 * (or unknown with no good candidate).
 */
export function correct(word: string): string | null {
    const lower = word.toLowerCase();

    // user-defined replacements win over everything, even correctly spelled words
    const custom = getCustomCorrections()[lower];
    if (custom !== undefined) {
        if (custom.toLowerCase() === lower) return null;
        return /^[a-z]/.test(custom) ? matchCase(word, custom) : custom;
    }

    if (!loaded) return null;
    if (lower.length < 2 || lower.length > 20) return null;
    if (words.has(lower) || EXTRA_WORDS.has(lower)) return null;

    const cached = cache.get(lower);
    if (cached !== undefined) return cached === null ? null : matchCase(word, cached);

    const e1 = edits1(lower);
    let best = bestOf(e1);

    // Edit distance 2, only when distance 1 found nothing and the word is short
    // enough that the candidate space stays cheap to scan.
    if (!best && lower.length <= 12) {
        let bestFreq = 0;
        for (const e of e1) {
            for (const e2 of edits1(e)) {
                const f = words.get(e2);
                if (f !== undefined && f > bestFreq) {
                    bestFreq = f;
                    best = e2;
                }
            }
        }
    }

    if (best === lower) best = null;

    if (cache.size > 2000) cache.clear();
    cache.set(lower, best);

    return best === null ? null : matchCase(word, best);
}
