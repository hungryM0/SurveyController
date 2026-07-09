package main

import (
	"time"

	"surveycontroller/proxycore"
	"surveycontroller/surveycore"
)

type ParseSurveyRequest struct {
	URL string `json:"url"`
}

type RunSurveyRequest struct {
	Config surveycore.RuntimeConfig `json:"config"`
}

type RunTaskState struct {
	Running     bool                      `json:"running"`
	Canceling   bool                      `json:"canceling"`
	Paused      bool                      `json:"paused"`
	PauseReason string                    `json:"pauseReason,omitempty"`
	Result      *surveycore.RunResult     `json:"result,omitempty"`
	Events      []surveycore.Event        `json:"events,omitempty"`
	Error       string                    `json:"error,omitempty"`
	StartedAt   time.Time                 `json:"startedAt,omitempty"`
	EndedAt     time.Time                 `json:"endedAt,omitempty"`
	Config      *surveycore.RuntimeConfig `json:"config,omitempty"`
}

type ReverseFillPreviewRequest struct {
	Path      string                    `json:"path"`
	Format    string                    `json:"format"`
	StartRow  int                       `json:"startRow"`
	Questions []surveycore.QuestionMeta `json:"questions"`
}

type RedeemProxyCardRequest struct {
	CardCode string `json:"cardCode"`
	Source   string `json:"source,omitempty"`
}

type TestCustomProxyAPIRequest struct {
	URL string `json:"url"`
}

type TestAIConnectionRequest struct {
	Config surveycore.RuntimeConfig `json:"config"`
}

type CustomProxyAPITestState struct {
	Success bool     `json:"success"`
	Message string   `json:"message"`
	Proxies []string `json:"proxies"`
}

type AIConnectionTestState struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type DecodeQRCodeRequest struct {
	Path    string `json:"path"`
	DataURL string `json:"dataUrl,omitempty"`
	Name    string `json:"name,omitempty"`
}

type QRCodeDecodeState struct {
	Path string `json:"path"`
	Text string `json:"text"`
}

type ProxyRedeemState struct {
	Redeemed       bool        `json:"redeemed"`
	CardQuota      float64     `json:"cardQuota"`
	CardQuotaLabel string      `json:"cardQuotaLabel"`
	Detail         string      `json:"detail,omitempty"`
	Status         ProxyStatus `json:"status"`
}

type SurveyCoreState struct {
	Definition *surveycore.SurveyDefinition `json:"definition,omitempty"`
	Config     *surveycore.RuntimeConfig    `json:"config,omitempty"`
	Result     *surveycore.RunResult        `json:"result,omitempty"`
	Events     []surveycore.Event           `json:"events,omitempty"`
}

type ProxyStatus struct {
	Available          int                     `json:"available"`
	InUse              int                     `json:"inUse"`
	UserID             int                     `json:"userId"`
	UserKnown          bool                    `json:"userKnown"`
	PoolRemainingIP    int                     `json:"poolRemainingIp"`
	PoolRemainingKnown bool                    `json:"poolRemainingKnown"`
	RemainingQuota     string                  `json:"remainingQuota"`
	TotalQuota         string                  `json:"totalQuota"`
	QuotaKnown         bool                    `json:"quotaKnown"`
	RandomIPEnabled    bool                    `json:"randomIpEnabled"`
	Source             string                  `json:"source"`
	Message            string                  `json:"message"`
	Quota              proxycore.QuotaSnapshot `json:"quota"`
}
