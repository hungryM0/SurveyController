package main

import (
	"time"

	"surveycontroller/proxycore"
	"surveycontroller/surveycore"
	"surveycontroller/surveycore/configio"
)

type ParseSurveyRequest struct {
	URL string `json:"url"`
}

type LoadConfigRequest struct {
	Path string `json:"path"`
}

type SaveConfigRequest struct {
	Path   string                  `json:"path"`
	Config configio.ConfigDocument `json:"config"`
}

type AICredentialOperation string

const (
	AICredentialKeep    AICredentialOperation = "keep"
	AICredentialReplace AICredentialOperation = "replace"
	AICredentialClear   AICredentialOperation = "clear"
)

type AICredentialUpdate struct {
	Operation AICredentialOperation `json:"operation"`
	APIKey    string                `json:"apiKey,omitempty"`
}

type SaveSettingsRequest struct {
	Settings     AppSettings        `json:"settings"`
	AICredential AICredentialUpdate `json:"aiCredential"`
}

type ConfigFileState struct {
	Path   string                   `json:"path"`
	Exists bool                     `json:"exists"`
	Config *configio.ConfigDocument `json:"config,omitempty"`
}

type RunSurveyRequest struct {
	Config configio.ConfigDocument `json:"config"`
}

type RunTaskStatus string

const (
	RunTaskStatusIdle      RunTaskStatus = "idle"
	RunTaskStatusRunning   RunTaskStatus = "running"
	RunTaskStatusPaused    RunTaskStatus = "paused"
	RunTaskStatusCanceling RunTaskStatus = "canceling"
	RunTaskStatusSucceeded RunTaskStatus = "succeeded"
	RunTaskStatusFailed    RunTaskStatus = "failed"
	RunTaskStatusStopped   RunTaskStatus = "stopped"
)

type RunTaskStateRequest struct {
	RunID         string `json:"runId,omitempty"`
	AfterSequence uint64 `json:"afterSequence,omitempty"`
}

type RunTaskEvent struct {
	Sequence uint64           `json:"sequence"`
	Event    surveycore.Event `json:"event"`
}

type RunTaskState struct {
	RunID         string                `json:"runId,omitempty"`
	Status        RunTaskStatus         `json:"status"`
	PauseReason   string                `json:"pauseReason,omitempty"`
	Result        *surveycore.RunResult `json:"result,omitempty"`
	Events        []RunTaskEvent        `json:"events,omitempty"`
	NextSequence  uint64                `json:"nextSequence"`
	DroppedEvents uint64                `json:"droppedEvents"`
	Error         string                `json:"error,omitempty"`
	StartedAt     time.Time             `json:"startedAt,omitempty"`
	EndedAt       time.Time             `json:"endedAt,omitempty"`
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
	AIProfile AIProfileSettings `json:"aiProfile"`
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
