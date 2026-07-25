import ProxyQuotaCard from './dashboard/ProxyQuotaCard'
import QuestionWorkerPanel from './dashboard/QuestionWorkerPanel'
import RunFooter from './dashboard/RunFooter'
import RunParametersCard from './dashboard/RunParametersCard'
import SurveyEntryCard from './dashboard/SurveyEntryCard'
import type { DashboardViewProps } from './dashboard/types'

function DashboardView(props: DashboardViewProps) {
  return (
    <section className="page dashboard-page">
      <div className="dashboard-scroll dashboard-shell">
        <SurveyEntryCard
          dashboard={props.dashboard}
          busy={props.busy}
          onUpdateUrl={props.onUpdateUrl}
          onAutoConfig={props.onAutoConfig}
          onLoadQRCode={props.onLoadQRCode}
          onDecodeQRCodeImage={props.onDecodeQRCodeImage}
          onLoadConfig={props.onLoadConfig}
          onSaveConfig={props.onSaveConfig}
          onOpenSetupWizard={props.onOpenSetupWizard}
        />

        <div className="dashboard-work-grid dashboard-task-grid">
          <RunParametersCard
            dashboard={props.dashboard}
            customProxyAPI={props.customProxyAPI}
            onOpenRuntime={props.onOpenRuntime}
            onTargetChange={props.onTargetChange}
            onThreadsChange={props.onThreadsChange}
            onRandomIpChange={props.onRandomIpChange}
            onProxySourceChange={props.onProxySourceChange}
            onCustomProxyAPIChange={props.onCustomProxyAPIChange}
          />
          <div className="dashboard-side-stack dashboard-quota-stack">
            <ProxyQuotaCard
              dashboard={props.dashboard}
              busy={props.busy}
              onSyncProxyStatus={props.onSyncProxyStatus}
              onRedeemProxyCard={props.onRedeemProxyCard}
            />
          </div>
        </div>

        <QuestionWorkerPanel dashboard={props.dashboard} />
      </div>

      <RunFooter
        dashboard={props.dashboard}
        busy={props.busy}
        runPhase={props.runPhase}
        canRun={props.canRun}
        runBlockedReason={props.runBlockedReason}
        onRun={props.onRun}
        onCancelRun={props.onCancelRun}
        onPauseRun={props.onPauseRun}
        onResumeRun={props.onResumeRun}
      />
    </section>
  )
}

export { firstSupportedQRImageFile, isSupportedQRImage } from './dashboard/qrImage'
export type { DashboardViewProps } from './dashboard/types'
export default DashboardView
