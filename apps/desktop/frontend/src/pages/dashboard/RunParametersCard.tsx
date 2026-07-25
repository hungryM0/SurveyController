import type { ChangeEvent } from 'react'
import { Activity, Globe, Settings, ShieldCheck, SlidersHorizontal, Target, Zap } from 'lucide-react'
import CustomProxyAPIField from '../../components/CustomProxyAPIField'
import { Button, InputText, SelectNative, SliderBar, Switch } from '../../components/ui'
import type { DashboardViewProps } from './types'

type RunParametersCardProps = Pick<
  DashboardViewProps,
  | 'dashboard'
  | 'customProxyAPI'
  | 'onOpenRuntime'
  | 'onTargetChange'
  | 'onThreadsChange'
  | 'onRandomIpChange'
  | 'onProxySourceChange'
  | 'onCustomProxyAPIChange'
>

function RunParametersCard({
  dashboard,
  customProxyAPI,
  onOpenRuntime,
  onTargetChange,
  onThreadsChange,
  onRandomIpChange,
  onProxySourceChange,
  onCustomProxyAPIChange,
}: RunParametersCardProps) {
  const normalizedThreads = Math.max(1, Math.min(dashboard.threadCount, 32))

  return (
    <section className="surface control-panel">
      <div className="panel-header">
        <div className="panel-title-group">
          <Settings size={18} />
          <h4>任务设置</h4>
        </div>
        <Button value="高级参数" icon={<SlidersHorizontal size={15} />} onClick={onOpenRuntime} />
      </div>

      <div className="control-items-list">
        <div className="control-item primary-control-item">
          <div className="item-label-group">
            <Target size={15} />
            <span>目标份数</span>
          </div>
          <div className="item-input-area">
            <InputText
              value={String(dashboard.targetCount)}
              width="7rem"
              onChange={(event: ChangeEvent<HTMLInputElement>) => onTargetChange(Number(event.target.value))}
            />
          </div>
        </div>

        <div className="control-item">
          <div className="item-label-group">
            <Zap size={15} />
            <span>并发数</span>
          </div>
          <div className="item-slider-area">
            <SliderBar
              min={1}
              max={32}
              value={normalizedThreads}
              width="9rem"
              onChange={(event: ChangeEvent<HTMLInputElement>) => onThreadsChange(Number(event.target.value))}
            />
            <strong className="slider-value">{normalizedThreads}</strong>
          </div>
        </div>

        <div className="control-item switch-control-item">
          <div className="item-label-group">
            <ShieldCheck size={15} />
            <span>随机 IP</span>
          </div>
          <div className="item-switch-area">
            <Switch
              label
              labelOn="已开启"
              labelOff="已关闭"
              checked={dashboard.randomIpEnabled}
              onChange={onRandomIpChange}
            />
          </div>
        </div>

        <div className="control-item proxy-source-item">
          <div className="item-label-group">
            <Globe size={15} />
            <span>代理源</span>
          </div>
          <div className="item-select-area">
            <SelectNative
              data={[
                { label: '默认代理源', value: '默认' },
                { label: '限时福利源', value: '限时福利' },
                { label: '自定义代理', value: '自定义' },
              ]}
              value={dashboard.proxySource}
              onChange={(event) => onProxySourceChange(event.target.value)}
            />
          </div>
        </div>

        {dashboard.proxySource === '自定义' || dashboard.proxySource === 'custom' ? (
          <div className="control-item custom-proxy-reveal">
            <div className="item-label-group">
              <Activity size={15} />
              <span>代理 API</span>
            </div>
            <CustomProxyAPIField
              value={customProxyAPI}
              actionLabel="验活"
              width="min(22rem, 48vw)"
              onChange={onCustomProxyAPIChange}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default RunParametersCard
