package main

import (
	"testing"

	"surveycontroller/proxycore"
)

func TestResolveDesktopProxyArea(t *testing.T) {
	defaultCode := "110100"
	if got := resolveDesktopProxyArea(proxycore.OfficialSourceDefault, &defaultCode); got != "110100" {
		t.Fatalf("default area = %q", got)
	}

	benefitCode := "110100"
	if got := resolveDesktopProxyArea(proxycore.OfficialSourceBenefit, &benefitCode); got != "北京" {
		t.Fatalf("benefit area = %q", got)
	}

	unknownBenefitCode := "999999"
	if got := resolveDesktopProxyArea(proxycore.OfficialSourceBenefit, &unknownBenefitCode); got != "" {
		t.Fatalf("unknown benefit area = %q", got)
	}

	invalidCode := "11010x"
	if got := resolveDesktopProxyArea(proxycore.OfficialSourceDefault, &invalidCode); got != "" {
		t.Fatalf("invalid area = %q", got)
	}

	if got := resolveDesktopProxyArea(proxycore.OfficialSourceDefault, nil); got != "" {
		t.Fatalf("nil area = %q", got)
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
