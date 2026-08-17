package main

import (
	"testing"

	"github.com/SurveyController/SurveyController/packages/proxycore"
)

func TestResolveDesktopProxyArea(t *testing.T) {
	if got := resolveDesktopProxyArea(proxycore.OfficialSourceDefault, "110100"); got != "110100" {
		t.Fatalf("default area = %q", got)
	}

	if got := resolveDesktopProxyArea(proxycore.OfficialSourceBenefit, "110100"); got != "北京" {
		t.Fatalf("benefit area = %q", got)
	}

	if got := resolveDesktopProxyArea(proxycore.OfficialSourceBenefit, "999999"); got != "" {
		t.Fatalf("unknown benefit area = %q", got)
	}

	if got := resolveDesktopProxyArea(proxycore.OfficialSourceDefault, "11010x"); got != "" {
		t.Fatalf("invalid area = %q", got)
	}

	if got := resolveDesktopProxyArea(proxycore.OfficialSourceDefault, ""); got != "" {
		t.Fatalf("empty area = %q", got)
	}
}

func TestProxyAreaOptionsForSource(t *testing.T) {
	defaults := proxyAreaOptionsForSource(proxycore.OfficialSourceDefault)
	if defaults.Source != proxycore.OfficialSourceDefault || !defaults.HasAll || len(defaults.Provinces) == 0 {
		t.Fatalf("default options = %#v", defaults)
	}
	if defaults.Provinces[0].Code != "110000" || defaults.Provinces[0].Cities[0].Code != "110100" {
		t.Fatalf("first default province = %#v", defaults.Provinces[0])
	}

	benefit := proxyAreaOptionsForSource(proxycore.OfficialSourceBenefit)
	if benefit.Source != proxycore.OfficialSourceBenefit || !benefit.HasAll || len(benefit.Provinces) == 0 {
		t.Fatalf("benefit options = %#v", benefit)
	}
	for _, province := range benefit.Provinces {
		for _, city := range province.Cities {
			if benefitProxyAreaNames[city.Code] == "" {
				t.Fatalf("unsupported benefit city = %#v", city)
			}
		}
	}

	custom := proxyAreaOptionsForSource(proxycore.DefaultCustomProxySource)
	if custom.Source != proxycore.DefaultCustomProxySource || custom.HasAll || len(custom.Provinces) != 0 {
		t.Fatalf("custom options = %#v", custom)
	}
}
