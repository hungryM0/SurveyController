package main

import (
	"context"
	"strings"

	"surveycontroller/proxycore"
)

func testFixedProxy(ctx context.Context, address string, targetURL string) FixedProxyTestState {
	normalized, ok := proxycore.NormalizeHTTPProxyAddress(address)
	if !ok {
		if strings.TrimSpace(address) == "" {
			return FixedProxyTestState{Success: false, Message: "固定代理地址不能为空"}
		}
		return FixedProxyTestState{Success: false, Message: "固定代理地址必须是有效的 HTTP 或 HTTPS 地址"}
	}

	result := proxycore.CheckProxyHealth(ctx, proxycore.ProxyLease{Address: normalized}, proxycore.HealthCheckOptions{
		TargetURL: strings.TrimSpace(targetURL),
	})
	state := FixedProxyTestState{
		Success:    result.OK,
		Address:    proxycore.MaskProxyForLog(result.Address),
		StatusCode: result.StatusCode,
		DurationMS: result.Duration.Milliseconds(),
	}
	if result.OK {
		state.Message = "检测通过"
	} else if strings.TrimSpace(result.Error) != "" {
		state.Message = "连接失败: " + result.Error
	} else {
		state.Message = "连接失败"
	}
	return state
}
