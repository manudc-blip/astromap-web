import type { MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { getTooltipText } from "../lib/tooltips";
import type { Lang, TooltipKey } from "../lib/tooltips";

type TooltipProps = {
    tipKey: TooltipKey;
    lang: Lang;
    children: ReactNode;
    variant?: "default" | "tab";
};

export default function Tooltip({
    tipKey,
    lang,
    children,
    variant = "default",
}: TooltipProps) {
    const wrapperRef = useRef<HTMLSpanElement | null>(null);
    const timerRef = useRef<number | null>(null);

    const [visible, setVisible] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });

    const text = getTooltipText(tipKey, lang);

    const hide = () => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        setVisible(false);
    };

    const show = (x: number, y: number) => {
        if (!text) {
            return;
        }

        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
        }

        timerRef.current = window.setTimeout(() => {
            setPosition({ x, y });
            setVisible(true);
        }, variant === "tab" ? 250 : 350);
    };

    const handleMouseEnter = (event: MouseEvent<HTMLSpanElement>) => {
        show(event.clientX + 14, event.clientY + 16);
    };

    const handleMouseMove = (event: MouseEvent<HTMLSpanElement>) => {
        if (visible) {
            setPosition({ x: event.clientX + 14, y: event.clientY + 16 });
        }
    };

    const handleFocus = () => {
        const rect = wrapperRef.current?.getBoundingClientRect();

        if (!rect) {
            return;
        }

        show(rect.left + rect.width / 2, rect.bottom + 8);
    };

    useEffect(() => {
        return () => hide();
    }, []);

    return (
        <span
            ref={wrapperRef}
            className="tooltip-wrapper"
            onMouseEnter={handleMouseEnter}
            onMouseMove={handleMouseMove}
            onMouseLeave={hide}
            onFocus={handleFocus}
            onBlur={hide}
        >
            {children}

            {visible && (
                <span
                    className={`tooltip-card tooltip-card--${variant}`}
                    style={{
                        left: position.x,
                        top: position.y,
                    }}
                    role="tooltip"
                >
                    {text}
                </span>
            )}
        </span>
    );
}