package main

import (
	"context"
	"fmt"
	"strings"

	"github.com/SurveyController/SurveyController/packages/proxycore"
	"github.com/SurveyController/SurveyController/packages/surveycore"
)

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
	return r.syncOfficialSession(ctx, client, source)
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
	status := ProxyStatus{
		RandomIPEnabled: true,
		Source:          source,
		Message:         "官方代理额度已同步",
		UserID:          session.UserID,
		UserKnown:       session.UserID > 0,
		Quota:           proxycore.QuotaSnapshot{RemainingQuota: session.RemainingQuota, TotalQuota: session.TotalQuota, UsedQuota: session.UsedQuota, QuotaKnown: session.QuotaKnown},
	}
	if usage, usageErr := client.Usage(ctx); usageErr == nil {
		status.PoolRemainingIP = usage.RemainingIP
		status.PoolRemainingKnown = true
	}
	r.updateStatus(key, pool, status)
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
		UserID:          session.UserID,
		UserKnown:       session.UserID > 0,
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
	manager := r.officialProxyClient().SessionManager()
	quota, err := manager.QuotaSnapshot(ctx)
	if err != nil {
		quota = proxycore.QuotaSnapshot{}
	}
	session, sessionErr := manager.Snapshot(ctx)
	r.updateStatus(key, pool, ProxyStatus{
		RandomIPEnabled: true,
		Source:          source,
		Message:         message,
		UserID:          session.UserID,
		UserKnown:       sessionErr == nil && session.UserID > 0,
		Quota:           quota,
	})
}
