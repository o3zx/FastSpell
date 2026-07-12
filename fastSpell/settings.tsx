/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { OptionType } from "@utils/types";

import { openFastSpellModal } from "./FastSpellModal";

export const settings = definePluginSettings({
    openPanel: {
        type: OptionType.COMPONENT,
        component: () => (
            <Button onClick={openFastSpellModal}>
                Open FastSpell panel (toggles, ignored words, custom corrections)
            </Button>
        )
    },
    autocorrect: {
        type: OptionType.BOOLEAN,
        description: "Autocorrect misspelled words as you type (applies when you hit space or punctuation)",
        default: true
    },
    correctOnSend: {
        type: OptionType.BOOLEAN,
        description: "Also autocorrect the whole message right before it is sent",
        default: false
    },
    autoCapitalize: {
        type: OptionType.BOOLEAN,
        description: "Capitalize the first word of every sentence and the word \"i\" (phone keyboard style)",
        default: true
    },
    minWordLength: {
        type: OptionType.NUMBER,
        description: "Don't autocorrect words shorter than this many letters",
        default: 3
    },
    ignoreCapitalized: {
        type: OptionType.BOOLEAN,
        description: "Never autocorrect words that start with a capital letter (names, etc.)",
        default: false
    },
    userDictionary: {
        type: OptionType.STRING,
        description: "Your own words that should never be corrected (separated by commas or spaces)",
        default: ""
    },
    sttProvider: {
        type: OptionType.SELECT,
        description: "Speech-to-text provider. Groq is free (get a key at console.groq.com) and very fast.",
        options: [
            { label: "Groq (Whisper large v3 turbo) — free API key", value: "groq", default: true },
            { label: "OpenAI (Whisper)", value: "openai" },
            { label: "Custom (any OpenAI-compatible API)", value: "custom" }
        ] as const
    },
    sttApiKey: {
        type: OptionType.STRING,
        description: "API key for the speech-to-text provider",
        default: ""
    },
    sttModel: {
        type: OptionType.STRING,
        description: "Speech-to-text model (leave empty for the provider default)",
        default: ""
    },
    sttCustomUrl: {
        type: OptionType.STRING,
        description: "Base url for the custom provider (e.g. https://my-api.example.com/v1)",
        default: ""
    },
    sttLanguage: {
        type: OptionType.STRING,
        description: "Spoken language as a 2-letter code (e.g. en, ar). Leave empty to auto-detect.",
        default: ""
    },
    sttTranslateTo: {
        type: OptionType.STRING,
        description: "Translate your speech into this language before inserting it (e.g. English, Arabic). Leave empty to keep the language you spoke.",
        default: ""
    },
    sttTranslateModel: {
        type: OptionType.STRING,
        description: "Model used for the speech translation (leave empty for the provider default)",
        default: ""
    }
}, {
    sttCustomUrl: {
        hidden() { return this.store.sttProvider !== "custom"; }
    }
}).withPrivateSettings<{
    customCorrections?: Record<string, string>;
}>();

/** Adds a word to the "never correct" list (persisted). */
export function addToUserDictionary(word: string) {
    const existing = settings.store.userDictionary.toLowerCase().split(/[\s,]+/).filter(Boolean);
    const lower = word.toLowerCase();
    if (existing.includes(lower)) return;
    settings.store.userDictionary = [...existing, lower].join(", ");
}

export function removeFromUserDictionary(word: string) {
    const lower = word.toLowerCase();
    settings.store.userDictionary = settings.store.userDictionary
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(w => w && w !== lower)
        .join(", ");
}
