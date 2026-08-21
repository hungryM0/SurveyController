package main

import (
	"context"
	"encoding/json"

	desktoprpc "github.com/SurveyController/SurveyController/desktop/internal/rpc"
)

const (
	rpcMethodGetAppSettings     = "GetAppSettings"
	rpcMethodSaveAppSettings    = "SaveAppSettings"
	rpcMethodResetAppSettings   = "ResetAppSettings"
	rpcMethodLoadConfig         = "LoadConfig"
	rpcMethodSaveConfig         = "SaveConfig"
	rpcMethodCreateSurvey       = "CreateSurveyDocument"
	rpcMethodDecodeQRCode       = "DecodeQRCode"
	rpcMethodDecodeQRCodeSurvey = "DecodeQRCodeSurvey"
	rpcMethodCheckTask          = "CheckTask"
	rpcMethodStartRun           = "StartRun"
	rpcMethodCheckAndStart      = "CheckAndStart"
	rpcMethodGetRunTaskState    = "GetRunTaskState"
	rpcMethodCancelRun          = "CancelRun"
	rpcMethodPauseRun           = "PauseRun"
	rpcMethodResumeRun          = "ResumeRun"
	rpcMethodGetProxyStatus     = "GetProxyStatus"
	rpcMethodGetProxyAreas      = "GetProxyAreaOptions"
	rpcMethodSyncProxyStatus    = "SyncProxyStatus"
	rpcMethodRedeemProxyCard    = "RedeemProxyCard"
	rpcMethodTestCustomProxyAPI = "TestCustomProxyAPI"
	rpcMethodTestFixedProxy     = "TestFixedProxy"
	rpcMethodTestAIConnection   = "TestAIConnection"
	rpcMethodPreviewReverseFill = "PreviewReverseFill"
	rpcMethodExportLogLines     = "ExportLogLines"
	rpcMethodCheckUpdate        = "CheckUpdate"
	rpcMethodGetIPUsageSummary  = "GetIPUsageSummary"
)

type rpcStringRequest struct {
	Value string `json:"value"`
}

type rpcExportLogLinesRequest struct {
	Path  string   `json:"path"`
	Lines []string `json:"lines"`
}

type rpcHandler struct {
	service *AppService
}

func newRPCHandler(service *AppService) *rpcHandler {
	return &rpcHandler{service: service}
}

func (h *rpcHandler) Handle(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case rpcMethodGetAppSettings:
		return h.service.GetAppSettings()
	case rpcMethodSaveAppSettings:
		var request SaveSettingsRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.SaveAppSettings(ctx, request)
	case rpcMethodResetAppSettings:
		return h.service.ResetAppSettings()
	case rpcMethodLoadConfig:
		var request LoadConfigRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.LoadConfig(ctx, request)
	case rpcMethodSaveConfig:
		var request SaveConfigRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.SaveConfig(ctx, request)
	case rpcMethodCreateSurvey:
		var request ParseSurveyRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.CreateSurveyDocument(ctx, request)
	case rpcMethodDecodeQRCode:
		var request DecodeQRCodeRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.DecodeQRCode(ctx, request)
	case rpcMethodDecodeQRCodeSurvey:
		var request DecodeQRCodeRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.DecodeQRCodeSurvey(ctx, request)
	case rpcMethodCheckTask:
		var request CheckTaskRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.CheckTask(ctx, request), nil
	case rpcMethodStartRun:
		var request RunSurveyRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.StartRun(ctx, request)
	case rpcMethodCheckAndStart:
		var request CheckAndStartRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.CheckAndStart(ctx, request)
	case rpcMethodGetRunTaskState:
		var request RunTaskStateRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.GetRunTaskState(request), nil
	case rpcMethodCancelRun:
		return h.service.CancelRun(ctx)
	case rpcMethodPauseRun:
		var request rpcStringRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.PauseRun(ctx, request.Value)
	case rpcMethodResumeRun:
		return h.service.ResumeRun(ctx)
	case rpcMethodGetProxyStatus:
		return h.service.GetProxyStatus(), nil
	case rpcMethodGetProxyAreas:
		var request rpcStringRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.GetProxyAreaOptions(request.Value), nil
	case rpcMethodSyncProxyStatus:
		var request rpcStringRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.SyncProxyStatus(ctx, request.Value)
	case rpcMethodRedeemProxyCard:
		var request RedeemProxyCardRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.RedeemProxyCard(ctx, request)
	case rpcMethodTestCustomProxyAPI:
		var request TestCustomProxyAPIRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.TestCustomProxyAPI(ctx, request), nil
	case rpcMethodTestFixedProxy:
		var request TestFixedProxyRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.TestFixedProxy(ctx, request), nil
	case rpcMethodTestAIConnection:
		var request TestAIConnectionRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.TestAIConnection(ctx, request), nil
	case rpcMethodPreviewReverseFill:
		var request ReverseFillPreviewRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.PreviewReverseFill(ctx, request)
	case rpcMethodExportLogLines:
		var request rpcExportLogLinesRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return h.service.ExportLogLines(request.Path, request.Lines)
	case rpcMethodCheckUpdate:
		var request checkUpdateRequest
		if err := unmarshalRPCParams(params, &request); err != nil {
			return nil, desktoprpc.InvalidParams(err)
		}
		return checkForUpdate(ctx, request)
	case rpcMethodGetIPUsageSummary:
		return h.service.GetIPUsageSummary(ctx)
	default:
		return nil, desktoprpc.MethodNotFound(method)
	}
}

func unmarshalRPCParams(params json.RawMessage, target any) error {
	if len(params) == 0 || string(params) == "null" {
		return nil
	}
	return json.Unmarshal(params, target)
}
