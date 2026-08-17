package main

import (
	"context"
	"errors"
	"strings"

	"github.com/SurveyController/SurveyController/packages/proxycore"
)

func testCustomProxyAPI(ctx context.Context, endpoint string) CustomProxyAPITestState {
	url := strings.TrimSpace(endpoint)
	if url == "" {
		return CustomProxyAPITestState{Success: false, Message: "API地址不能为空"}
	}
	if !strings.HasPrefix(strings.ToLower(url), "http://") && !strings.HasPrefix(strings.ToLower(url), "https://") {
		return CustomProxyAPITestState{Success: false, Message: "API地址必须以 http:// 或 https:// 开头"}
	}
	fetcher, err := proxycore.NewHTTPFetcher(proxycore.HTTPFetcherOptions{
		Endpoint: url,
		Source:   proxycore.DefaultCustomProxySource,
	})
	if err != nil {
		return CustomProxyAPITestState{Success: false, Message: customProxyAPIErrorMessage(err)}
	}
	leases, err := fetcher.Fetch(ctx, 1)
	if err != nil {
		return CustomProxyAPITestState{Success: false, Message: customProxyAPIErrorMessage(err)}
	}
	proxies := make([]string, 0, len(leases))
	for _, lease := range leases {
		proxies = append(proxies, proxycore.MaskProxyForLog(lease.Address))
	}
	return CustomProxyAPITestState{
		Success: true,
		Message: "检测通过",
		Proxies: proxies,
	}
}

func customProxyAPIErrorMessage(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, proxycore.ErrNoProxyAddress) {
		return "返回数据中无有效代理地址"
	}
	if errors.Is(err, proxycore.ErrProxyUnavailable) {
		return err.Error()
	}
	return "请求失败: " + err.Error()
}
