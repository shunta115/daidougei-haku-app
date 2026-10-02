import { MERCH_SYSTEM_FEE_PERCENT, TIP_SYSTEM_FEE_PERCENT, systemFeeYen, TIP_SYSTEM_FEE_BPS, MERCH_SYSTEM_FEE_BPS } from '../../../shared/fees'
import { formatYen } from '../lib/money'
import { useLang } from '../../i18n/LangProvider'

export function SystemFeeExplain({ compact = false }: { compact?: boolean }) {
  const { t } = useLang()
  const tipFee = systemFeeYen(1000, TIP_SYSTEM_FEE_BPS)
  const merchFee = systemFeeYen(1000, MERCH_SYSTEM_FEE_BPS)
  return (
    <section className="pl-registration__section" aria-labelledby="fee-explain-heading">
      <h2 id="fee-explain-heading" className="pl-h2">{t('feeExplainTitle')}</h2>
      <p className="pl-muted">{t('feeExplainLead')}</p>
      <ul className="pl-registration__checks">
        <li>{t('feeTipLine', { n: TIP_SYSTEM_FEE_PERCENT })}</li>
        <li>{t('feeMerchLine', { n: MERCH_SYSTEM_FEE_PERCENT })}</li>
        <li>{t('feeStripeLine')}</li>
      </ul>
      {!compact ? (
        <>
          <div className="pl-registration__money-flow">
            <span>{t('salesExample')}<strong>{formatYen(1000)}</strong></span>
            <span>{t('salesFeeLine', { tip: TIP_SYSTEM_FEE_PERCENT })}<strong>−{formatYen(tipFee)}</strong></span>
            <span>{t('salesBeforeStripe')}<strong>{formatYen(1000 - tipFee)}</strong></span>
            <span>{t('feeStripeAfter')}<strong>—</strong></span>
            <span>{t('feeFinalBank')}<strong>—</strong></span>
          </div>
          <div className="pl-registration__money-flow">
            <span>Goods ¥1,000<strong>{formatYen(1000)}</strong></span>
            <span>{t('salesFeeLine', { tip: MERCH_SYSTEM_FEE_PERCENT })}<strong>−{formatYen(merchFee)}</strong></span>
            <span>{t('salesBeforeStripe')}<strong>{formatYen(1000 - merchFee)}</strong></span>
          </div>
        </>
      ) : null}
    </section>
  )
}
