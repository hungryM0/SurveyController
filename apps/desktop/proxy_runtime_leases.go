package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"surveycontroller/proxycore"
	"surveycontroller/surveycore"
	"surveycontroller/surveycore/configio"
)

func (r *proxyRuntime) customLeaseManager(_ context.Context, network configio.NetworkSettings, source string, options surveycore.ExecutionOptions) (surveycore.LeaseManager, error) {
	endpoint := strings.TrimSpace(network.CustomProxyAPI)
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
	return proxyLeaseManager{pool: r.pool}, nil
}

func fixedProxyLeaseManager(address string) (surveycore.LeaseManager, error) {
	normalized, ok := proxycore.NormalizeHTTPProxyAddress(address)
	if !ok {
		if strings.TrimSpace(address) == "" {
			return nil, fmt.Errorf("%w: 固定代理地址不能为空", surveycore.ErrInvalidConfig)
		}
		return nil, fmt.Errorf("%w: 固定代理地址必须是有效的 HTTP 或 HTTPS 地址", surveycore.ErrInvalidConfig)
	}
	return fixedProxyLease{lease: surveycore.ExecutionLease{Address: normalized, Source: "fixed"}}, nil
}

func (r *proxyRuntime) officialLeaseManager(ctx context.Context, network configio.NetworkSettings, source string, options surveycore.ExecutionOptions) (surveycore.LeaseManager, error) {
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
	area := resolveDesktopProxyArea(source, network.ProxyAreaCode)
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
		pool: pool,
		afterAcquire: func(acquireCtx context.Context) {
			r.refreshOfficialStatus(acquireCtx, key, pool, source, "官方代理已连接")
		},
	}, nil
}

type proxyLeaseManager struct {
	pool         *proxycore.Pool
	afterAcquire func(context.Context)
}

type fixedProxyLease struct {
	lease surveycore.ExecutionLease
}

func (m fixedProxyLease) Acquire(ctx context.Context, _ string) (surveycore.ExecutionLease, error) {
	if err := ctx.Err(); err != nil {
		return surveycore.ExecutionLease{}, err
	}
	return m.lease, nil
}

func (m fixedProxyLease) Release(_ string) (surveycore.ExecutionLease, bool) {
	return m.lease, true
}

func (m fixedProxyLease) MarkSuccess(_ string) bool {
	return false
}

func (m fixedProxyLease) MarkCooldown(_ string, _ time.Duration) {}

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
	if m.pool != nil {
		m.pool.MarkCooldown(proxyAddress, cooldownFor)
	}
}
