package proxycore

import (
	"net"
	"net/url"
	"strings"
	"time"
)

const defaultProxySource = "custom"

type ProxyLease struct {
	Address  string
	ExpireAt string
	ExpireTS float64
	Poolable bool
	Source   string
}

func NormalizeProxyAddress(proxyAddress string) (string, bool) {
	normalized := strings.TrimSpace(proxyAddress)
	if normalized == "" {
		return "", false
	}
	if !strings.Contains(normalized, "://") {
		normalized = "http://" + normalized
	}
	if !isValidHTTPProxyURL(normalized) {
		return "", false
	}
	return normalized, true
}

func NormalizeHTTPProxyAddress(proxyAddress string) (string, bool) {
	return NormalizeProxyAddress(proxyAddress)
}

func isValidHTTPProxyURL(raw string) bool {
	parsed, err := url.ParseRequestURI(raw)
	if err != nil || parsed == nil || !strings.EqualFold(parsed.Scheme, "http") && !strings.EqualFold(parsed.Scheme, "https") {
		return false
	}
	if parsed.Opaque != "" || parsed.Host == "" || (parsed.Path != "" && parsed.Path != "/") || (parsed.RawPath != "" && parsed.RawPath != "/") || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.ForceQuery {
		return false
	}
	if parsed.User != nil && parsed.User.Username() == "" {
		return false
	}
	host, port, ok := splitProxyHostPort(parsed.Host)
	return ok && isValidProxyHost(host) && (port == "" || isValidProxyPort(port))
}

func splitProxyHostPort(rawHost string) (string, string, bool) {
	if rawHost == "" {
		return "", "", false
	}
	if strings.HasPrefix(rawHost, "[") {
		closing := strings.IndexByte(rawHost, ']')
		if closing <= 1 {
			return "", "", false
		}
		host := rawHost[1:closing]
		rest := rawHost[closing+1:]
		if rest == "" {
			return host, "", true
		}
		if !strings.HasPrefix(rest, ":") || len(rest) == 1 {
			return "", "", false
		}
		return host, rest[1:], true
	}
	if strings.Count(rawHost, ":") == 0 {
		return rawHost, "", true
	}
	if strings.Count(rawHost, ":") != 1 {
		return "", "", false
	}
	host, port, err := net.SplitHostPort(rawHost)
	if err != nil {
		return "", "", false
	}
	return host, port, port != ""
}

func isValidProxyHost(host string) bool {
	if host == "" || strings.ContainsAny(host, " \t\r\n") {
		return false
	}
	if net.ParseIP(host) != nil {
		return true
	}
	if strings.HasSuffix(host, ".") {
		host = strings.TrimSuffix(host, ".")
	}
	if host == "" || len(host) > 253 {
		return false
	}
	for _, label := range strings.Split(host, ".") {
		if label == "" || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, char := range label {
			if (char < 'a' || char > 'z') && (char < 'A' || char > 'Z') && (char < '0' || char > '9') && char != '-' {
				return false
			}
		}
	}
	return true
}

func isValidProxyPort(port string) bool {
	if port == "" || len(port) > 5 {
		return false
	}
	value := 0
	for _, char := range port {
		if char < '0' || char > '9' {
			return false
		}
		value = value*10 + int(char-'0')
	}
	return value > 0 && value <= 65535
}

func BuildProxyLease(proxyAddress string, expireAt string, poolable bool, source string) (ProxyLease, bool) {
	normalized, ok := NormalizeProxyAddress(proxyAddress)
	if !ok {
		return ProxyLease{}, false
	}
	cleanSource := strings.TrimSpace(source)
	if cleanSource == "" {
		cleanSource = defaultProxySource
	}
	cleanExpireAt := strings.TrimSpace(expireAt)
	return ProxyLease{
		Address:  normalized,
		ExpireAt: cleanExpireAt,
		ExpireTS: ParseExpireAtToUnix(cleanExpireAt),
		Poolable: poolable,
		Source:   cleanSource,
	}, true
}

func ParseExpireAtToUnix(expireAt string) float64 {
	text := strings.TrimSpace(expireAt)
	if text == "" {
		return 0
	}
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
	}
	for _, layout := range layouts {
		parsed, err := time.Parse(layout, text)
		if err == nil {
			return float64(parsed.UTC().Unix())
		}
	}
	return 0
}

func ProxyLeaseHasSufficientTTL(lease ProxyLease, requiredTTL time.Duration, now time.Time) bool {
	if strings.TrimSpace(lease.Address) == "" {
		return false
	}
	if lease.ExpireTS <= 0 {
		return true
	}
	remaining := time.Unix(int64(lease.ExpireTS), 0).Sub(now)
	return remaining >= requiredTTL
}

func MaskProxyForLog(proxyAddress string) string {
	text := strings.TrimSpace(proxyAddress)
	if text == "" {
		return ""
	}
	candidate := text
	if !strings.Contains(candidate, "://") {
		candidate = "http://" + candidate
	}
	if parsed, err := url.Parse(candidate); err == nil {
		host := parsed.Hostname()
		port := parsed.Port()
		if host != "" {
			return formatHostPort(host, port)
		}
	}
	raw := text
	if idx := strings.Index(raw, "://"); idx >= 0 {
		raw = raw[idx+3:]
	}
	if idx := strings.Index(raw, "/"); idx >= 0 {
		raw = raw[:idx]
	}
	if idx := strings.LastIndex(raw, "@"); idx >= 0 {
		raw = raw[idx+1:]
	}
	return raw
}

func formatHostPort(host string, port string) string {
	if port == "" {
		return host
	}
	if strings.Contains(host, ":") && !strings.HasPrefix(host, "[") {
		return net.JoinHostPort(host, port)
	}
	return host + ":" + port
}
