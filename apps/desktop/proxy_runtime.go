package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"surveycontroller/proxycore"
	"surveycontroller/surveycore"
)

type proxyRuntime struct {
	mu             sync.Mutex
	key            string
	pool           *proxycore.Pool
	status         ProxyStatus
	officialClient *proxycore.OfficialClient
	usage          *ipUsageStore
}

func newProxyRuntime(store *ipUsageStore) *proxyRuntime {
	return &proxyRuntime{usage: store}
}

func (r *proxyRuntime) statusSnapshot() ProxyStatus {
	r.mu.Lock()
	defer r.mu.Unlock()
	status := r.status
	if status.Source == "" {
		status.Source = proxycore.OfficialSourceDefault
	}
	status.RemainingQuota = proxycore.FormatQuotaValue(status.Quota.RemainingQuota)
	status.TotalQuota = proxycore.FormatQuotaValue(status.Quota.TotalQuota)
	status.QuotaKnown = status.Quota.QuotaKnown
	if r.pool != nil {
		status.Available = r.pool.Len()
		status.InUse = r.pool.InUseLen()
	}
	return status
}

func (r *proxyRuntime) usageSummary() IPUsageSummary {
	status := r.statusSnapshot()
	summary := IPUsageSummary{
		RemainingQuota: status.RemainingQuota,
		TotalQuota:     status.TotalQuota,
		Available:      status.Available,
		InUse:          status.InUse,
		Source:         status.Source,
		Message:        status.Message,
		UpdatedAt:      time.Now().Format("2006-01-02 15:04:05"),
	}
	if r.usage != nil {
		summary.Records = r.usage.snapshot()
	}
	return summary
}

func (r *proxyRuntime) executionOptions(ctx context.Context, cfg surveycore.RuntimeConfig) (surveycore.ExecutionOptions, error) {
	options := surveycore.ExecutionOptionsFromConfig(&cfg)
	source := normalizeDesktopProxySource(cfg.ProxySource)
	if !cfg.RandomIPEnabled {
		r.updateStatus("", nil, ProxyStatus{
			RandomIPEnabled: false,
			Source:          source,
			Message:         "未启用",
		})
		return options, nil
	}

	switch source {
	case proxycore.DefaultCustomProxySource:
		manager, err := r.customLeaseManager(ctx, cfg, source, options)
		if err != nil {
			return options, err
		}
		options.LeaseManager = manager
		return options, nil
	case proxycore.OfficialSourceDefault, proxycore.OfficialSourceBenefit:
		manager, err := r.officialLeaseManager(ctx, cfg, source, options)
		if err != nil {
			return options, err
		}
		options.LeaseManager = manager
		return options, nil
	default:
		r.updateStatus(proxyRuntimeKey(source, ""), nil, ProxyStatus{
			RandomIPEnabled: true,
			Source:          source,
			Message:         "代理源不可用",
		})
		return options, fmt.Errorf("%w: 未知代理源 %q", surveycore.ErrInvalidConfig, source)
	}
}

func (r *proxyRuntime) customLeaseManager(_ context.Context, cfg surveycore.RuntimeConfig, source string, options surveycore.ExecutionOptions) (surveycore.LeaseManager, error) {
	endpoint := strings.TrimSpace(cfg.CustomProxyAPI)
	key := proxyRuntimeKey(source, endpoint)
	if endpoint == "" {
		r.updateStatus(key, nil, ProxyStatus{
			RandomIPEnabled: true,
			Source:          source,
			Message:         "自定义代理 API 为空",
		})
		return nil, fmt.Errorf("%w: 自定义代理 API 为空", surveycore.ErrInvalidConfig)
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	if r.pool == nil || r.key != key {
		fetcher, err := proxycore.NewHTTPFetcher(proxycore.HTTPFetcherOptions{
			Endpoint: endpoint,
			Source:   source,
		})
		if err != nil {
			r.key = key
			r.pool = nil
			r.status = ProxyStatus{
				RandomIPEnabled: true,
				Source:          source,
				Message:         "自定义代理 API 不可用",
			}
			return nil, err
		}
		r.pool = proxycore.NewPool(proxycore.PoolOptions{
			Fetcher:  fetcher,
			MaxFetch: maxInt(1, options.Threads),
		})
		r.key = key
	}
	r.status = ProxyStatus{
		RandomIPEnabled: true,
		Source:          source,
		Message:         "自定义代理已连接",
	}
	return proxyLeaseManager{pool: r.pool, usage: r.usage}, nil
}

func (r *proxyRuntime) officialLeaseManager(ctx context.Context, cfg surveycore.RuntimeConfig, source string, options surveycore.ExecutionOptions) (surveycore.LeaseManager, error) {
	client := r.officialProxyClient()
	session, err := r.ensureOfficialSession(ctx, client, source)
	if err != nil {
		return nil, err
	}
	if session.QuotaExhausted() {
		quota, _ := client.SessionManager().QuotaSnapshot(ctx)
		r.updateStatus(proxyRuntimeKey(source, ""), nil, ProxyStatus{
			RandomIPEnabled: true,
			Source:          source,
			Message:         "官方代理额度已用完",
			Quota:           quota,
		})
		return nil, fmt.Errorf("%w: 官方随机 IP 额度已用完", surveycore.ErrPrepareConfigFailed)
	}

	maxFetch := maxInt(1, options.Threads)
	area := resolveDesktopProxyArea(source, cfg.ProxyAreaCode)
	upstream := officialUpstreamFromSource(source)
	key := proxyRuntimeKey(source, fmt.Sprintf("%s|%s|%d", area, upstream, maxFetch))
	r.mu.Lock()
	if r.pool == nil || r.key != key {
		fetcher := proxycore.NewOfficialFetcher(proxycore.OfficialFetcherOptions{
			Client:   client,
			Minute:   1,
			Pool:     proxycore.OfficialPoolQuality,
			Area:     area,
			Upstream: upstream,
			Source:   source,
			MaxFetch: maxFetch,
		})
		r.pool = proxycore.NewPool(proxycore.PoolOptions{
			Fetcher:  fetcher,
			MaxFetch: maxFetch,
		})
		r.key = key
	}
	pool := r.pool
	r.mu.Unlock()

	r.refreshOfficialStatus(ctx, key, pool, source, "官方代理已连接")
	return proxyLeaseManager{
		pool:  pool,
		usage: r.usage,
		afterAcquire: func(acquireCtx context.Context) {
			r.refreshOfficialStatus(acquireCtx, key, pool, source, "官方代理已连接")
		},
	}, nil
}

func (r *proxyRuntime) ensureOfficialSession(ctx context.Context, client *proxycore.OfficialClient, source string) (proxycore.RandomIPSession, error) {
	session, err := client.SessionManager().Snapshot(ctx)
	if err != nil {
		r.updateStatus(proxyRuntimeKey(source, ""), nil, ProxyStatus{
			RandomIPEnabled: true,
			Source:          source,
			Message:         "官方代理会话读取失败",
		})
		return proxycore.RandomIPSession{}, err
	}
	if !session.Authenticated() {
		session, err = client.ActivateTrial(ctx)
		if err != nil {
			r.updateStatus(proxyRuntimeKey(source, ""), nil, ProxyStatus{
				RandomIPEnabled: true,
				Source:          source,
				Message:         "官方代理试用领取失败",
			})
			return proxycore.RandomIPSession{}, fmt.Errorf("%w: 官方随机 IP 试用领取失败: %v", surveycore.ErrPrepareConfigFailed, err)
		}
		return session, nil
	}
	session, err = r.syncOfficialSession(ctx, client, source)
	if err != nil {
		return proxycore.RandomIPSession{}, err
	}
	return session, nil
}

func (r *proxyRuntime) syncOfficialSession(ctx context.Context, client *proxycore.OfficialClient, source string) (proxycore.RandomIPSession, error) {
	if _, err := client.SyncQuota(ctx); err != nil {
		quota, _ := client.SessionManager().QuotaSnapshot(ctx)
		r.updateStatus(proxyRuntimeKey(source, ""), nil, ProxyStatus{
			RandomIPEnabled: true,
			Source:          source,
			Message:         "官方代理额度同步失败",
			Quota:           quota,
		})
		return proxycore.RandomIPSession{}, fmt.Errorf("%w: 官方随机 IP 额度同步失败: %v", surveycore.ErrPrepareConfigFailed, err)
	}
	session, err := client.SessionManager().Snapshot(ctx)
	if err != nil {
		return proxycore.RandomIPSession{}, err
	}
	return session, nil
}

func (r *proxyRuntime) officialProxyClient() *proxycore.OfficialClient {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.officialClient == nil {
		manager := proxycore.NewOfficialSessionManager(proxycore.OfficialSessionManagerOptions{
			Store: newOfficialSessionFileStore(),
		})
		r.officialClient = proxycore.NewOfficialClient(proxycore.OfficialClientOptions{
			SessionManager: manager,
		})
	}
	return r.officialClient
}

func (r *proxyRuntime) FreeAIIdentity(ctx context.Context) (int, string, error) {
	client := r.officialProxyClient()
	session, err := client.SessionManager().Snapshot(ctx)
	if err != nil {
		return 0, "", err
	}
	if !session.Authenticated() {
		session, err = client.ActivateTrial(ctx)
		if err != nil {
			return 0, "", err
		}
	}
	return session.UserID, session.DeviceID, nil
}

func (r *proxyRuntime) SyncOfficialStatus(ctx context.Context, source string) (ProxyStatus, error) {
	source = normalizeDesktopProxySource(source)
	if source != proxycore.OfficialSourceDefault && source != proxycore.OfficialSourceBenefit {
		source = proxycore.OfficialSourceDefault
	}
	client := r.officialProxyClient()
	session, err := client.SessionManager().Snapshot(ctx)
	if err != nil {
		r.updateStatus(proxyRuntimeKey(source, ""), nil, ProxyStatus{
			RandomIPEnabled: true,
			Source:          source,
			Message:         "官方代理会话读取失败",
		})
		return r.statusSnapshot(), err
	}
	if !session.Authenticated() {
		session, err = client.ActivateTrial(ctx)
		if err != nil {
			r.updateStatus(proxyRuntimeKey(source, ""), nil, ProxyStatus{
				RandomIPEnabled: true,
				Source:          source,
				Message:         "官方代理试用领取失败",
			})
			return r.statusSnapshot(), err
		}
	} else {
		session, err = r.syncOfficialSession(ctx, client, source)
		if err != nil {
			return r.statusSnapshot(), err
		}
	}
	key, pool := r.currentPoolStateForSource(source)
	r.updateStatus(key, pool, ProxyStatus{
		RandomIPEnabled: true,
		Source:          source,
		Message:         "官方代理额度已同步",
		Quota:           proxycore.QuotaSnapshot{RemainingQuota: session.RemainingQuota, TotalQuota: session.TotalQuota, UsedQuota: session.UsedQuota, QuotaKnown: session.QuotaKnown},
	})
	return r.statusSnapshot(), nil
}

func (r *proxyRuntime) RedeemOfficialCard(ctx context.Context, source string, cardCode string) (ProxyRedeemState, error) {
	source = normalizeDesktopProxySource(source)
	if source != proxycore.OfficialSourceDefault && source != proxycore.OfficialSourceBenefit {
		source = proxycore.OfficialSourceDefault
	}
	cardCode = strings.TrimSpace(cardCode)
	if cardCode == "" {
		status := r.statusSnapshot()
		status.Source = source
		return ProxyRedeemState{Status: status}, fmt.Errorf("卡密不能为空")
	}
	client := r.officialProxyClient()
	session, err := client.SessionManager().Snapshot(ctx)
	if err != nil {
		r.updateStatus(proxyRuntimeKey(source, ""), nil, ProxyStatus{
			RandomIPEnabled: true,
			Source:          source,
			Message:         "官方代理会话读取失败",
		})
		return ProxyRedeemState{Status: r.statusSnapshot()}, err
	}
	if !session.Authenticated() {
		session, err = client.ActivateTrial(ctx)
		if err != nil {
			r.updateStatus(proxyRuntimeKey(source, ""), nil, ProxyStatus{
				RandomIPEnabled: true,
				Source:          source,
				Message:         "官方代理试用领取失败",
			})
			return ProxyRedeemState{Status: r.statusSnapshot()}, err
		}
	}
	result, err := client.RedeemCard(ctx, cardCode)
	if err != nil {
		status := r.statusSnapshot()
		status.Source = source
		return ProxyRedeemState{Status: status}, fmt.Errorf("额度兑换失败: %s", randomIPUserMessage(err))
	}
	key, pool := r.currentPoolStateForSource(source)
	r.updateStatus(key, pool, ProxyStatus{
		RandomIPEnabled: true,
		Source:          source,
		Message:         "额度兑换成功",
		Quota:           result.Quota,
	})
	return ProxyRedeemState{
		Redeemed:       result.Redeemed,
		CardQuota:      result.CardQuota,
		CardQuotaLabel: proxycore.FormatQuotaValue(result.CardQuota),
		Detail:         result.Detail,
		Status:         r.statusSnapshot(),
	}, nil
}

func (r *proxyRuntime) refreshOfficialStatus(ctx context.Context, key string, pool *proxycore.Pool, source string, message string) {
	quota, err := r.officialProxyClient().SessionManager().QuotaSnapshot(ctx)
	if err != nil {
		quota = proxycore.QuotaSnapshot{}
	}
	r.updateStatus(key, pool, ProxyStatus{
		RandomIPEnabled: true,
		Source:          source,
		Message:         message,
		Quota:           quota,
	})
}

func (r *proxyRuntime) currentPoolStateForSource(source string) (string, *proxycore.Pool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if strings.HasPrefix(r.key, source+"\n") {
		return r.key, r.pool
	}
	return proxyRuntimeKey(source, ""), nil
}

func (r *proxyRuntime) updateStatus(key string, pool *proxycore.Pool, status ProxyStatus) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.key = key
	r.pool = pool
	r.status = status
}

type proxyLeaseManager struct {
	pool         *proxycore.Pool
	usage        *ipUsageStore
	afterAcquire func(context.Context)
}

func (m proxyLeaseManager) Acquire(ctx context.Context, owner string) (surveycore.ExecutionLease, error) {
	if m.pool == nil {
		return surveycore.ExecutionLease{}, proxycore.ErrProxyUnavailable
	}
	lease, err := m.pool.Acquire(ctx, owner)
	if err != nil {
		return surveycore.ExecutionLease{}, err
	}
	if m.afterAcquire != nil {
		m.afterAcquire(ctx)
	}
	if m.usage != nil {
		m.usage.add(time.Now(), 1)
	}
	return surveycore.ExecutionLease{Address: lease.Address, Source: lease.Source}, nil
}

func (m proxyLeaseManager) Release(owner string) (surveycore.ExecutionLease, bool) {
	if m.pool == nil {
		return surveycore.ExecutionLease{}, false
	}
	lease, ok := m.pool.Release(owner)
	return surveycore.ExecutionLease{Address: lease.Address, Source: lease.Source}, ok
}

func (m proxyLeaseManager) MarkSuccess(proxyAddress string) bool {
	if m.pool == nil {
		return false
	}
	return m.pool.MarkSuccess(proxyAddress)
}

func (m proxyLeaseManager) MarkCooldown(proxyAddress string, cooldownFor time.Duration) {
	if m.pool == nil {
		return
	}
	m.pool.MarkCooldown(proxyAddress, cooldownFor)
}

func normalizeDesktopProxySource(source string) string {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "", proxycore.OfficialSourceDefault:
		return proxycore.OfficialSourceDefault
	case proxycore.OfficialSourceBenefit, "福利", "限时福利":
		return proxycore.OfficialSourceBenefit
	case proxycore.DefaultCustomProxySource, "自定义":
		return proxycore.DefaultCustomProxySource
	default:
		return strings.ToLower(strings.TrimSpace(source))
	}
}

func officialUpstreamFromSource(source string) string {
	if source == proxycore.OfficialSourceBenefit {
		return proxycore.OfficialUpstreamBenefit
	}
	return proxycore.OfficialUpstreamDefault
}

func resolveDesktopProxyArea(source string, areaCode *string) string {
	code := normalizeDesktopProxyAreaCode(areaCode)
	if code == "" {
		return ""
	}
	if normalizeDesktopProxySource(source) == proxycore.OfficialSourceBenefit {
		return benefitProxyAreaNames[code]
	}
	return code
}

func normalizeDesktopProxyAreaCode(areaCode *string) string {
	if areaCode == nil {
		return ""
	}
	code := strings.TrimSpace(*areaCode)
	if len(code) != 6 {
		return ""
	}
	for _, char := range code {
		if char < '0' || char > '9' {
			return ""
		}
	}
	return code
}

func proxyRuntimeKey(source string, endpoint string) string {
	return source + "\n" + strings.TrimSpace(endpoint)
}

func randomIPUserMessage(err error) string {
	var apiErr proxycore.RandomIPError
	if !errors.As(err, &apiErr) {
		return err.Error()
	}
	switch strings.TrimSpace(apiErr.Detail) {
	case "redeem_card_code_required":
		return "卡密不能为空"
	case "invalid_redeem_card_code":
		return "卡密格式错误"
	case "redeem_card_not_found":
		return "该卡密不存在"
	case "redeem_card_already_redeemed":
		return "这张卡密已经被兑换过"
	default:
		return apiErr.Error()
	}
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
