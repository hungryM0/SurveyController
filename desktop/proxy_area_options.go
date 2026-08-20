package main

import (
	"sort"

	"github.com/SurveyController/SurveyCore/pkg/proxycore"
)

type ProxyAreaCity struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type ProxyAreaProvince struct {
	Code   string          `json:"code"`
	Name   string          `json:"name"`
	Cities []ProxyAreaCity `json:"cities"`
}

type ProxyAreaOptionsState struct {
	Source    string              `json:"source"`
	HasAll    bool                `json:"hasAll"`
	Provinces []ProxyAreaProvince `json:"provinces"`
}

func proxyAreaOptionsForSource(source string) ProxyAreaOptionsState {
	switch normalizeDesktopProxySource(source) {
	case proxycore.OfficialSourceBenefit:
		return ProxyAreaOptionsState{
			Source:    proxycore.OfficialSourceBenefit,
			HasAll:    true,
			Provinces: buildBenefitProxyAreaOptions(),
		}
	case proxycore.DefaultCustomProxySource:
		return ProxyAreaOptionsState{
			Source:    proxycore.DefaultCustomProxySource,
			HasAll:    false,
			Provinces: nil,
		}
	default:
		return ProxyAreaOptionsState{
			Source:    proxycore.OfficialSourceDefault,
			HasAll:    true,
			Provinces: cloneProxyAreaOptions(defaultProxyAreaOptions),
		}
	}
}

func buildBenefitProxyAreaOptions() []ProxyAreaProvince {
	provinceNames := map[string]string{}
	provinceCities := map[string][]ProxyAreaCity{}
	for _, province := range defaultProxyAreaOptions {
		provinceNames[province.Code] = province.Name
		for _, city := range province.Cities {
			if _, ok := benefitProxyAreaNames[city.Code]; !ok {
				continue
			}
			provinceCities[province.Code] = append(provinceCities[province.Code], city)
		}
	}
	codes := make([]string, 0, len(provinceCities))
	for code := range provinceCities {
		codes = append(codes, code)
	}
	sort.Strings(codes)
	result := make([]ProxyAreaProvince, 0, len(codes))
	for _, code := range codes {
		cities := append([]ProxyAreaCity(nil), provinceCities[code]...)
		sort.Slice(cities, func(i, j int) bool { return cities[i].Code < cities[j].Code })
		result = append(result, ProxyAreaProvince{
			Code:   code,
			Name:   provinceNames[code],
			Cities: cities,
		})
	}
	return result
}

func cloneProxyAreaOptions(src []ProxyAreaProvince) []ProxyAreaProvince {
	out := make([]ProxyAreaProvince, len(src))
	for i, province := range src {
		out[i] = ProxyAreaProvince{
			Code:   province.Code,
			Name:   province.Name,
			Cities: append([]ProxyAreaCity(nil), province.Cities...),
		}
	}
	return out
}
