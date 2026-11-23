import { useId, useRef, useState } from "react";
import { Check, Palette, X } from "lucide-react";
import { charmToneColors } from "../charmTone";
import "./ColorSwatchPicker.css";

interface Props {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (hex: string) => void;
}

export function ColorSwatchPicker({ label, value, disabled, onChange }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const current = value.toUpperCase();
  const search = query.trim().toLowerCase();
  const colors = charmToneColors.filter(({ name, hex }) =>
    name.toLowerCase().includes(search) || hex.toLowerCase().includes(search)
  );
  const validHex = /^#[0-9a-f]{6}$/i;

  function choose(hex: string) {
    if (!disabled && validHex.test(hex)) onChange(hex.toUpperCase());
    dialog.current?.close();
  }

  return (
    <>
      <button
        type="button"
        className="cs-swatch-trigger"
        style={{ backgroundColor: validHex.test(value) ? value : undefined }}
        aria-label={`Choose ${label} color`}
        title={`Choose ${label} color from CharmTone or enter a custom hex`}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => {
          setQuery("");
          setCustom(validHex.test(value) ? current : "");
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        <Palette size={14} aria-hidden="true" />
      </button>
      <dialog ref={dialog} className="cs-swatch-dialog" aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            dialog.current?.close();
          }
        }}>
        {open && (
          <>
            <header>
              <div><h3 id={titleId}>CharmTone palette</h3><span>{label}</span></div>
              <button type="button" aria-label="Close palette" onClick={() => dialog.current?.close()}><X size={18} /></button>
            </header>
            <input type="search" autoFocus aria-label="Search CharmTone colors" placeholder="Search by name or hex"
              value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="cs-swatch-results">
              {colors.map(({ name, hex }) => (
                <button type="button" key={name} aria-pressed={hex === current} title={hex} onClick={() => choose(hex)}>
                  <i style={{ backgroundColor: hex }} aria-hidden="true" />
                  <span>{name}</span>
                  {hex === current && <Check size={13} aria-hidden="true" />}
                </button>
              ))}
              {!colors.length && <p>No matching colors.</p>}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); choose(custom); }}>
              <label>Custom hex
                <input type="text" value={custom} placeholder="#6B50FF" maxLength={7}
                  onChange={(e) => setCustom(e.target.value)} />
              </label>
              <input type="color" aria-label="Pick custom color" value={validHex.test(custom) ? custom : "#000000"}
                onChange={(e) => setCustom(e.target.value.toUpperCase())} />
              <button type="submit" disabled={!validHex.test(custom)}>Apply</button>
            </form>
          </>
        )}
      </dialog>
    </>
  );
}
