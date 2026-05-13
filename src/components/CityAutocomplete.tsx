import { useEffect, useRef, useState } from "react";
import { searchCities } from "../lib/api";
import type { CitySearchItem, UiLanguage } from "../types/astromap";

type Props = {
  value: string;
  language: UiLanguage;
  onChange: (value: string) => void;
  onSelect: (city: CitySearchItem) => void;
};

export function CityAutocomplete({ value, language, onChange, onSelect }: Props) {
  const [items, setItems] = useState<CitySearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }

    const id = window.setTimeout(async () => {
      try {
        const result = await searchCities(q, language);
        setItems(result);
        setOpen(result.length > 0);
      } catch {
        setItems([]);
        setOpen(false);
      }
    }, 180);

    return () => window.clearTimeout(id);
  }, [value, language]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="city-autocomplete" ref={boxRef}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => items.length > 0 && setOpen(true)}
        className="gm-input"
      />

      {open && (
        <div className="city-dropdown">
          {items.map((item) => (
            <button
              key={`${item.name}-${item.lat}-${item.lon}-${item.tz}`}
              type="button"
              className="city-option"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item);
                setOpen(false);
              }}
            >
              {item.display}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}