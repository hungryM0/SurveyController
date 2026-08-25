package main

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/SurveyController/SurveyCore/pkg/surveycore"
	configio "github.com/SurveyController/SurveyCore/pkg/surveycore/config"
	"github.com/SurveyController/SurveyCore/pkg/surveycore/model"
	proxycore "github.com/SurveyController/SurveyCore/pkg/surveycore/proxy"
	surveyRuntime "github.com/SurveyController/SurveyCore/pkg/surveycore/runtime"
)

type proxyRuntime struct {
	mu             sync.Mutex
	key            string
	pool           *proxycore.Pool
	status         ProxyStatus
	officialClient *proxycore.OfficialClient
}

func newProxyRuntime() *proxyRuntime {
	return &proxyRuntime{}
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

func (r *proxyRuntime) executionOptions(ctx context.Context, document configio.ConfigDocument) (surveyRuntime.ExecutionOptions, error) {
	cfg, err := coreRunRequest(document)
	if err != nil {
		return surveyRuntime.ExecutionOptions{}, err
	}
	options := surveyRuntime.ExecutionOptionsFromConfig(&cfg)
	network := document.Network
	options.UserAgent = model.UserAgentSettings{Enabled: network.RandomUAEnabled, Ratios: cloneIntMap(network.RandomUARatios)}
	mode := normalizeDesktopNetworkMode(network)
	if mode == "fixed" {
		fixedAddress := strings.TrimSpace(network.FixedProxyAddress)
		manager, err := fixedProxyLeaseManager(fixedAddress)
		if err != nil {
			r.updateStatus(proxyRuntimeKey("fixed", fixedAddress), nil, ProxyStatus{
				Source:  "fixed",
				Message: "固定代理地址无效",
			})
			return options, err
		}
		options.UseRandomIP = true
		options.LeaseManager = manager
		r.updateStatus(proxyRuntimeKey("fixed", fixedAddress), nil, ProxyStatus{
			Available: 1,
			Source:    "fixed",
			Message:   "固定代理已配置，请测试连接",
		})
		return options, nil
	}

	options.UseRandomIP = mode == "random"
	source := normalizeDesktopProxySource(network.ProxySource)
	if mode != "random" {
		r.updateStatus("", nil, ProxyStatus{
			RandomIPEnabled: false,
			Source:          source,
			Message:         "未启用",
		})
		return options, nil
	}

	switch source {
	case proxycore.DefaultCustomProxySource:
		manager, err := r.customLeaseManager(ctx, network, source, options)
		if err != nil {
			return options, err
		}
		options.LeaseManager = manager
		return options, nil
	case proxycore.OfficialSourceDefault, proxycore.OfficialSourceBenefit:
		manager, err := r.officialLeaseManager(ctx, network, source, options)
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
	if isOfficialProxySource(status.Source) && !status.PoolRemainingKnown && r.status.PoolRemainingKnown {
		status.PoolRemainingIP = r.status.PoolRemainingIP
		status.PoolRemainingKnown = true
	}
	if isOfficialProxySource(status.Source) && !status.UserKnown && r.status.UserKnown {
		status.UserID = r.status.UserID
		status.UserKnown = true
	}
	r.key = key
	r.pool = pool
	r.status = status
}
