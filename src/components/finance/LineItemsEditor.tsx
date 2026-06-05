import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/ui";
import { lineTotal, zar, type LineItem } from "@/lib/finance";

/**
 * Editable list of line items (description / qty / unit price → auto line total).
 * Stateless: parent owns the array.
 */
export default function LineItemsEditor({
  items,
  onChange,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
}) {
  function update(idx: number, patch: Partial<LineItem>) {
    const next = items.map((it, i) => {
      if (i !== idx) return it;
      const merged = { ...it, ...patch };
      merged.line_total = lineTotal(merged.qty, merged.unit_price);
      return merged;
    });
    onChange(next);
  }
  function addRow() {
    onChange([
      ...items,
      { description: "", qty: 1, unit_price: 0, line_total: 0, sort_order: items.length },
    ]);
  }
  function removeRow(idx: number) {
    onChange(items.filter((_, i) => i !== idx).map((it, i) => ({ ...it, sort_order: i })));
  }

  const ctrl =
    "rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-faint outline-none focus:border-brand";

  return (
    <div className="space-y-2">
      {items.map((it, idx) => (
        <div key={idx} className="rounded-xl border border-line bg-base/40 p-3">
          <div className="flex items-start gap-2">
            <input
              value={it.description}
              onChange={(e) => update(idx, { description: e.target.value })}
              placeholder="Description"
              className={`${ctrl} min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={() => removeRow(idx)}
              className="mt-1 shrink-0 text-ink-faint active:scale-90"
              aria-label="Remove line"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 items-center gap-2">
            <label className="text-[11px] text-ink-faint">
              Qty
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={it.qty}
                onChange={(e) => update(idx, { qty: Number(e.target.value) })}
                className={`${ctrl} mt-0.5 w-full py-2`}
              />
            </label>
            <label className="text-[11px] text-ink-faint">
              Unit price (R)
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={it.unit_price}
                onChange={(e) => update(idx, { unit_price: Number(e.target.value) })}
                className={`${ctrl} mt-0.5 w-full py-2`}
              />
            </label>
            <div className="text-right text-[11px] text-ink-faint">
              Line total
              <div className="mt-1.5 font-mono text-sm font-bold tabular-nums text-ink">
                {zar(it.line_total)}
              </div>
            </div>
          </div>
        </div>
      ))}
      <Button variant="secondary" size="md" block onClick={addRow} type="button">
        <Plus className="h-4 w-4" /> Add line item
      </Button>
    </div>
  );
}
