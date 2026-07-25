package main

import (
	"errors"
	"strings"

	"surveycontroller/proxycore"
)

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

func isOfficialProxySource(source string) bool {
	normalized := normalizeDesktopProxySource(source)
	return normalized == proxycore.OfficialSourceDefault || normalized == proxycore.OfficialSourceBenefit
}

func resolveDesktopProxyArea(source string, areaCode string) string {
	code := normalizeDesktopProxyAreaCode(areaCode)
	if code == "" {
		return ""
	}
	if normalizeDesktopProxySource(source) == proxycore.OfficialSourceBenefit {
		return benefitProxyAreaNames[code]
	}
	return code
}

func normalizeDesktopProxyAreaCode(areaCode string) string {
	code := strings.TrimSpace(areaCode)
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

func cloneIntMap(values map[string]int) map[string]int {
	if len(values) == 0 {
		return nil
	}
	cloned := make(map[string]int, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}
