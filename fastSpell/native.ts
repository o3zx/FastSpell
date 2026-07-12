/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { readFile, rm } from "fs/promises";
import { basename, normalize } from "path";

const DICT_URLS = [
    "https://raw.githubusercontent.com/wolfgarbe/SymSpell/master/SymSpell/frequency_dictionary_en_82_765.txt",
    "https://cdn.jsdelivr.net/gh/wolfgarbe/SymSpell@master/SymSpell/frequency_dictionary_en_82_765.txt"
];

export async function fetchDictionary(_: IpcMainInvokeEvent): Promise<{ ok: boolean; data?: string; error?: string; }> {
    for (const url of DICT_URLS) {
        try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const text = await res.text();
            // sanity check: the real file is ~1.2MB of "word frequency" lines
            if (text.length > 100_000) return { ok: true, data: text };
        } catch { }
    }
    return { ok: false, error: "Failed to download the dictionary from all mirrors" };
}

export interface TranscribeOptions {
    filePath: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    language: string;
}

export async function transcribeRecording(_: IpcMainInvokeEvent, opts: TranscribeOptions): Promise<{ ok: boolean; text?: string; error?: string; }> {
    const filePath = normalize(opts.filePath);
    const filename = basename(filePath);
    const discordBaseDirWithTrailingSlash = normalize(app.getPath("userData") + "/");
    if (!/^\d*recording\.ogg$/.test(filename) || !filePath.startsWith(discordBaseDirWithTrailingSlash))
        return { ok: false, error: "Invalid recording path" };

    let buf: Buffer;
    try {
        buf = await readFile(filePath);
    } catch (e) {
        return { ok: false, error: "Failed to read the recording: " + String(e) };
    } finally {
        rm(filePath).catch(() => { });
    }

    let base: URL;
    try {
        base = new URL(opts.baseUrl);
    } catch {
        return { ok: false, error: "Invalid API base url" };
    }
    if (base.protocol !== "https:") return { ok: false, error: "API base url must be https" };

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buf)], { type: "audio/ogg" }), "audio.ogg");
    form.append("model", opts.model);
    form.append("response_format", "json");
    form.append("temperature", "0");
    if (opts.language) form.append("language", opts.language);

    try {
        const res = await fetch(base.toString().replace(/\/$/, "") + "/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${opts.apiKey}` },
            body: form
        });

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            return { ok: false, error: `API error ${res.status}: ${body.slice(0, 300)}` };
        }

        const data = await res.json() as { text?: string; };
        if (typeof data.text !== "string") return { ok: false, error: "API returned no transcript" };
        return { ok: true, text: data.text.trim() };
    } catch (e) {
        return { ok: false, error: "Request failed: " + String(e) };
    }
}

export interface TranslateOptions {
    apiKey: string;
    baseUrl: string;
    model: string;
    text: string;
    targetLanguage: string;
}

export async function translateText(_: IpcMainInvokeEvent, opts: TranslateOptions): Promise<{ ok: boolean; text?: string; error?: string; }> {
    let base: URL;
    try {
        base = new URL(opts.baseUrl);
    } catch {
        return { ok: false, error: "Invalid API base url" };
    }
    if (base.protocol !== "https:") return { ok: false, error: "API base url must be https" };

    try {
        const res = await fetch(base.toString().replace(/\/$/, "") + "/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${opts.apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: opts.model,
                temperature: 0,
                messages: [
                    {
                        role: "system",
                        content: `You are a translator. Translate the user's message into ${opts.targetLanguage}. Reply with ONLY the translation — no explanations, no notes, no quotation marks around it.`
                    },
                    { role: "user", content: opts.text }
                ]
            })
        });

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            return { ok: false, error: `Translation API error ${res.status}: ${body.slice(0, 300)}` };
        }

        const data = await res.json() as { choices?: { message?: { content?: string; }; }[]; };
        const text = data.choices?.[0]?.message?.content;
        if (typeof text !== "string" || !text.trim()) return { ok: false, error: "API returned no translation" };
        return { ok: true, text: text.trim() };
    } catch (e) {
        return { ok: false, error: "Request failed: " + String(e) };
    }
}
