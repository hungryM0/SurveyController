package main

import (
	"context"
	"strings"
)

func (s *AppService) GetProxyStatus() ProxyStatus {
	return s.proxyRuntime().statusSnapshot()
}

func (s *AppService) GetProxyAreaOptions(source string) ProxyAreaOptionsState {
	return proxyAreaOptionsForSource(source)
}

func (s *AppService) SyncProxyStatus(ctx context.Context, source string) (ProxyStatus, error) {
	return s.proxyRuntime().SyncOfficialStatus(ctx, source)
}

func (s *AppService) RedeemProxyCard(ctx context.Context, request RedeemProxyCardRequest) (ProxyRedeemState, error) {
	return s.proxyRuntime().RedeemOfficialCard(ctx, request.Source, request.CardCode)
}

func (s *AppService) TestCustomProxyAPI(ctx context.Context, request TestCustomProxyAPIRequest) CustomProxyAPITestState {
	return testCustomProxyAPI(ctx, request.URL)
}

func (s *AppService) TestAIConnection(ctx context.Context, request TestAIConnectionRequest) AIConnectionTestState {
	message, err := s.surveyClient().TestAIConnection(ctx, request.Config)
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
