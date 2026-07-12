/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Divider } from "@components/Divider";
import { FormSwitch } from "@components/FormSwitch";
import { Margins } from "@utils/margins";
import { RenderModalProps } from "@vencord/discord-types";
import { Button, Forms, Modal, openModal, TextInput, useState } from "@webpack/common";

import { addCustomCorrection, removeCustomCorrection, useCustomCorrections } from "./customCorrections";
import { addToUserDictionary, removeFromUserDictionary, settings } from "./settings";

function Toggles() {
    const { autocorrect, correctOnSend, autoCapitalize, ignoreCapitalized } = settings.use(["autocorrect", "correctOnSend", "autoCapitalize", "ignoreCapitalized"]);

    return (
        <>
            <FormSwitch
                title="Autocorrect while typing"
                description="Fix the word you just typed when you hit space or punctuation"
                value={autocorrect}
                onChange={v => settings.store.autocorrect = v}
                hideBorder
            />
            <FormSwitch
                title="Fix whole message when sending"
                description="Go over the full message one more time right before it is sent"
                value={correctOnSend}
                onChange={v => settings.store.correctOnSend = v}
                hideBorder
            />
            <FormSwitch
                title="Auto-capitalization"
                description={'Capitalize the first word of every sentence and the word "i", like a phone keyboard'}
                value={autoCapitalize}
                onChange={v => settings.store.autoCapitalize = v}
                hideBorder
            />
            <FormSwitch
                title="Leave capitalized words alone"
                description="Don't touch words starting with a capital letter (names etc.)"
                value={ignoreCapitalized}
                onChange={v => settings.store.ignoreCapitalized = v}
                hideBorder
            />
        </>
    );
}

function IgnoredWords() {
    const { userDictionary } = settings.use(["userDictionary"]);
    const [input, setInput] = useState("");

    const words = userDictionary.split(/[\s,]+/).filter(Boolean);

    const add = () => {
        const w = input.trim().replace(/[^a-zA-Z']/g, "");
        if (!w) return;
        addToUserDictionary(w);
        setInput("");
    };

    return (
        <section className={Margins.top16}>
            <Forms.FormTitle tag="h3">Never correct these words</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8}>
                Slang, names, other languages — anything the autocorrect keeps getting wrong.
            </Forms.FormText>

            <div className="vc-fastspell-row">
                <TextInput
                    placeholder="Add a word..."
                    value={input}
                    onChange={setInput}
                    onKeyDown={e => e.key === "Enter" && add()}
                />
                <Button onClick={add}>Add</Button>
            </div>

            <div className="vc-fastspell-chips">
                {words.length === 0 && <Forms.FormText>Nothing here yet.</Forms.FormText>}
                {words.map(w => (
                    <span key={w} className="vc-fastspell-chip" title="Click to remove" onClick={() => removeFromUserDictionary(w)}>
                        {w} ✕
                    </span>
                ))}
            </div>
        </section>
    );
}

function CustomCorrections() {
    const corrections = useCustomCorrections();
    const [wrong, setWrong] = useState("");
    const [right, setRight] = useState("");

    const add = () => {
        const from = wrong.trim().toLowerCase().replace(/[^a-z']/g, "");
        const to = right.trim();
        if (!from || !to) return;
        addCustomCorrection(from, to);
        setWrong("");
        setRight("");
    };

    const entries = Object.entries(corrections);

    return (
        <section className={Margins.top16}>
            <Forms.FormTitle tag="h3">Custom corrections</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8}>
                Always replace a word with another one, e.g. "alot" → "a lot" or "im" → "I'm".
            </Forms.FormText>

            <div className="vc-fastspell-row">
                <TextInput placeholder="When I type..." value={wrong} onChange={setWrong} />
                <TextInput placeholder="Replace it with..." value={right} onChange={setRight} onKeyDown={e => e.key === "Enter" && add()} />
                <Button onClick={add}>Add</Button>
            </div>

            <div className="vc-fastspell-chips">
                {entries.length === 0 && <Forms.FormText>Nothing here yet.</Forms.FormText>}
                {entries.map(([from, to]) => (
                    <span key={from} className="vc-fastspell-chip" title="Click to remove" onClick={() => removeCustomCorrection(from)}>
                        {from} → {to} ✕
                    </span>
                ))}
            </div>
        </section>
    );
}

function VoiceTranslation() {
    const { sttTranslateTo } = settings.use(["sttTranslateTo"]);

    return (
        <section className={Margins.top16}>
            <Forms.FormTitle tag="h3">Voice typing translation</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8}>
                Speak in any language and the mic button will type it out in this one. Leave empty to keep the language you spoke.
            </Forms.FormText>
            <TextInput
                placeholder="Translate my speech into... (e.g. English)"
                value={sttTranslateTo}
                onChange={v => settings.store.sttTranslateTo = v}
            />
        </section>
    );
}

function FastSpellModal({ rootProps }: { rootProps: RenderModalProps; }) {
    return (
        <Modal {...rootProps} title="FastSpell">
            <Toggles />
            <Divider className={Margins.bottom16} />
            <IgnoredWords />
            <CustomCorrections />
            <VoiceTranslation />
        </Modal>
    );
}

export function openFastSpellModal() {
    openModal(props => <FastSpellModal rootProps={props} />);
}
