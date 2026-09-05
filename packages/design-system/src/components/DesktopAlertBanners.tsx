import type { JSX } from 'react';
import type { SpendAlert } from '@expense-tracker/shared';

/**
 * The alert stack that sits above the dashboard on every tab.
 *
 * One banner per alert, in the order `evaluateAlerts` returned them — breaches
 * first. A breach takes the design's dark ink surface and a warning the pale
 * accent, which is the same pairing `cf-darkcard` and `cf-banner` already use;
 * no colour is introduced here that the tokens didn't already define.
 *
 * Every banner is itself the way into the settings, so an alert is never a
 * dead end — the thing it is telling you about is one click away.
 */
export function DesktopAlertBanners({
  alerts,
  onOpenSettings,
}: {
  alerts: readonly SpendAlert[];
  onOpenSettings: () => void;
}): JSX.Element | null {
  if (alerts.length === 0) return null;

  return (
    <div className="dash__alerts">
      {alerts.map((alert) => (
        <div key={alert.id} className={`dash__alert dash__alert--${alert.level}`}>
          <div className="dash__alertbody">
            <div className="dash__alerttitle">{alert.title}</div>
            <div className="dash__alertsub">{alert.body}</div>
          </div>
          <button type="button" className="dash__alertlink" onClick={onOpenSettings}>
            Alert settings
          </button>
        </div>
      ))}
    </div>
  );
}
