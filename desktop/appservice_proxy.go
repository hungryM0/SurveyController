package main

import (
	"context"
	"strings"

	"github.com/SurveyController/SurveyCore/pkg/proxycore"
)

func (s *AppService) GetProxyStatus() ProxyStatus {
	return s.proxy.statusSnapshot()
}

func (s *AppService) GetProxyAreaOptions(source string) ProxyAreaOptionsState {
	return proxyAreaOptionsForSource(source)
}

func (s *AppService) SyncProxyStatus(ctx context.Context, source string) (ProxyStatus, error) {
	return s.proxy.SyncOfficialStatus(ctx, source)
}

func (s *AppService) RedeemProxyCard(ctx context.Context, request RedeemProxyCardRequest) (ProxyRedeemState, error) {
	return s.proxy.RedeemOfficialCard(ctx, request.Source, request.CardCode)
}

func (s *AppService) TestCustomProxyAPI(ctx context.Context, request TestCustomProxyAPIRequest) CustomProxyAPITestState {
	state := testCustomProxyAPI(ctx, request.URL)
	if s.proxy != nil {
		status := ProxyStatus{
			RandomIPEnabled: true,
			Source:          proxycore.DefaultCustomProxySource,
			Message:         state.Message,
		}
		if state.Success {
			status.Available = len(state.Proxies)
			status.Message = "自定义代理已连接"
		}
		s.proxy.updateStatus(proxyRuntimeKey(proxycore.DefaultCustomProxySource, strings.TrimSpace(request.URL)), nil, status)
	}
	return state
}

func (s *AppService) TestFixedProxy(ctx context.Context, request TestFixedProxyRequest) FixedProxyTestState {
	return testFixedProxy(ctx, request.Address, request.TargetURL)
}

func (s *AppService) TestAIConnection(ctx context.Context, request TestAIConnectionRequest) AIConnectionTestState {
	profile, configured, err := aiProfileForSettings(ctx, s.credentials, request.AIProfile)
	if err != nil {
		return AIConnectionTestState{Success: false, Message: "凭据读取失败: " + err.Error()}
	}
	if profile.Mode == "provider" && !configured {
		return AIConnectionTestState{Success: false, Message: "未配置 AI API Key"}
	}
	message, err := s.runs.survey.TestAIConnection(ctx, profile)
	if err != nil {
		return AIConnectionTestState{Success: false, Message: "连接失败: " + err.Error()}
	}
	return AIConnectionTestState{Success: true, Message: message}
}

func (s *AppService) DecodeQRCode(_ context.Context, request DecodeQRCodeRequest) (QRCodeDecodeState, error) {
	if strings.TrimSpace(request.DataURL) != "" {
		return decodeQRCodeDataURL(request.DataURL, request.Name)
	}
	return decodeQRCodeImage(request.Path)
}
