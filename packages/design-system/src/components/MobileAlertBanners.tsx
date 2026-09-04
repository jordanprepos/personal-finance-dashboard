import type { JSX } from 'react';
import type { SpendAlert } from '@expense-tracker/shared';

/**
 * The alert stack, above the tab content on every tab.
 *
 * Same two levels as the desktop banners and the same surfaces: a breach on
 * the dark ink card, a warning on the pale accent. The whole banner is the
 * button here rather than a link inside it — on a phone the target should be
 * the thing you can see, and it clears 44px on its own.
 */
export function MobileAlertBanners({
  alerts,
  onOpenSettings,
}: {
  alerts: readonly SpendAlert[];
  onOpenSettings: () => void;
}): JSX.Element | null {
  if (alerts.length === 0) return null;

  return (
    <div className="phone__alerts">
      {alerts.map((alert) => (
        <button
          key={alert.id}
          type="button"
          className={`phone__alert phone__alert--${alert.level}`}
          onClick={onOpenSettings}
        >
          <span className="phone__alerttitle">{alert.title}</span>
          <span className="phone__alertsub">{alert.body}</span>
          <span className="phone__alertlink">Alert settings ›</span>
        </button>
      ))}
    </div>
  );
}
