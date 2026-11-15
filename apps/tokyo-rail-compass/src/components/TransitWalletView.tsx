import { Check, Coins, CreditCard, Info } from 'lucide-react';
import type { PaymentMethod, WalletPass, WalletState } from '@rail-kit/engine';
import { formatMessage, locale } from '../locales/i18n';

interface TransitWalletViewProps {
  passes: WalletPass[];
  wallet: WalletState;
  onChangePaymentMethod: (method: PaymentMethod) => void;
  onTogglePass: (passId: string) => void;
}

/**
 * Multi-select transit wallet view for configuring payment method and active passes.
 */
export function TransitWalletView({
  passes,
  wallet,
  onChangePaymentMethod,
  onTogglePass,
}: TransitWalletViewProps) {
  const methodLabel =
    wallet.paymentMethod === 'ic' ? locale.routes.paidByIc : locale.routes.paidByCash;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-bold text-slate-900">{locale.wallet.title}</h2>
        <p className="text-xs text-slate-600 leading-relaxed">{locale.wallet.subtitle}</p>
      </div>

      {/* Section 1: Base payment method radio group */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {locale.wallet.baseMethodHeading}
        </h3>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onChangePaymentMethod('ic')}
            className={`w-full text-left p-3 rounded-xl border transition flex items-start gap-3 min-h-[56px] ${
              wallet.paymentMethod === 'ic'
                ? 'bg-emerald-50/70 border-emerald-500 ring-1 ring-emerald-500/25'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
              <CreditCard className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">
                  {locale.wallet.icTitle}
                </span>
                {wallet.paymentMethod === 'ic' && (
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">{locale.wallet.icDesc}</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChangePaymentMethod('cash')}
            className={`w-full text-left p-3 rounded-xl border transition flex items-start gap-3 min-h-[56px] ${
              wallet.paymentMethod === 'cash'
                ? 'bg-slate-100 border-slate-700 ring-1 ring-slate-700/20'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-slate-700 text-white flex items-center justify-center shrink-0 mt-0.5">
              <Coins className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">
                  {locale.wallet.cashTitle}
                </span>
                {wallet.paymentMethod === 'cash' && (
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">{locale.wallet.cashDesc}</p>
            </div>
          </button>
        </div>
      </div>

      {/* Section 2: Multi-select passes */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {locale.wallet.passesHeading}
        </h3>
        <div className="space-y-2">
          {passes.map((pass) => {
            const enabled = wallet.enabledPassIds.includes(pass.id);
            return (
              <label
                key={pass.id}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition min-h-[56px] ${
                  enabled
                    ? 'bg-sky-50/75 border-sky-500 ring-1 ring-sky-500/20'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => onTogglePass(pass.id)}
                  className="sr-only"
                />
                <span
                  className="w-3 h-9 rounded-full shrink-0 mt-0.5"
                  style={{ backgroundColor: pass.badgeColor }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900 leading-snug">
                      {pass.name}
                    </span>
                    <span
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${
                        enabled
                          ? 'bg-sky-600 border-sky-600 text-white'
                          : 'bg-white border-slate-300 text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">{pass.subtitle}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Summary banner */}
      <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 flex items-start gap-2 text-xs text-sky-900 leading-relaxed">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-600" />
        <span>
          {wallet.enabledPassIds.length === 0
            ? formatMessage(locale.wallet.activeSummaryNone, { method: methodLabel })
            : formatMessage(locale.wallet.activeSummaryWithPasses, {
                method: methodLabel,
                count: wallet.enabledPassIds.length,
              })}
        </span>
      </div>
    </div>
  );
}

