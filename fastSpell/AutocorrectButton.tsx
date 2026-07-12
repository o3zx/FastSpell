/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { classes } from "@utils/misc";
import { IconComponent } from "@utils/types";
import { showToast, Toasts } from "@webpack/common";

import { openFastSpellModal } from "./FastSpellModal";
import { settings } from "./settings";

export const SpellIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg viewBox="0 0 24 24" height={height} width={width} className={className}>
        <path fill="currentColor" d="M12.45 16h2.09L9.43 3H7.57L2.46 16h2.09l1.12-3h5.64l1.14 3zm-6.02-5L8.5 5.48 10.57 11H6.43zm15.16.59-8.09 8.09L9.83 16l-1.41 1.41 5.09 5.09L23 13l-1.41-1.41z" />
    </svg>
);

export const AutocorrectChatBarButton: ChatBarButtonFactory = ({ isMainChat }) => {
    const { autocorrect } = settings.use(["autocorrect"]);

    if (!isMainChat) return null;

    const toggle = () => {
        const next = !settings.store.autocorrect;
        settings.store.autocorrect = next;
        showToast(next ? "Autocorrect on" : "Autocorrect off", Toasts.Type.SUCCESS);
    };

    return (
        <ChatBarButton
            tooltip={autocorrect ? "Autocorrect: on — click for options, right-click to turn off" : "Autocorrect: off — click for options, right-click to turn on"}
            onClick={e => {
                if (e.shiftKey) return toggle();
                openFastSpellModal();
            }}
            onContextMenu={toggle}
            buttonProps={{ "aria-haspopup": "dialog" }}
        >
            <SpellIcon className={classes("vc-fastspell-spell", autocorrect ? undefined : "vc-fastspell-spell-off")} />
        </ChatBarButton>
    );
};
