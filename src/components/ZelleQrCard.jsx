import { getBrand } from "../lib/brand.js";
import { formatMoney } from "../lib/format.js";

// The business's Zelle QR code, for a customer to scan in their bank's app.
// Always on white so bank apps can read it on every theme. The demo brand
// has no Zelle details, so this shows nothing in demo mode.
//   amount: shown large above the code (left out when not a positive number)
export default function ZelleQrCard({ amount, className = "" }) {
  const { zelle } = getBrand();
  if (!zelle) return null;
  const showAmount = Number.isFinite(amount) && amount > 0;
  return (
    <div className={`rounded-2xl bg-white text-neutral-900 p-4 flex flex-col items-center gap-2 text-center shadow-lg ${className}`.trim()}>
      <p className="text-sm font-semibold">Scan in your bank&apos;s app to pay</p>
      {showAmount && <p className="text-3xl font-bold">{formatMoney(amount)}</p>}
      <img src={zelle.qr} alt={`Zelle QR code to pay ${zelle.payee}`} className="w-full max-w-[280px] aspect-square" />
      <p className="text-sm">
        Zelle to <span className="font-semibold">{zelle.payee}</span> at {zelle.phoneHint}
      </p>
    </div>
  );
}
