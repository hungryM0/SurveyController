package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"surveycontroller/proxycore"
	"surveycontroller/surveycore"
	"surveycontroller/surveycore/configio"
	"surveycontroller/surveycore/reversefill"
)

type NavItem struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Icon     string `json:"icon"`
	Section  string `json:"section"`
	Badge    string `json:"badge,omitempty"`
	Selected bool   `json:"selected,omitempty"`
}

type PageMetric struct {
	Label string `json:"label"`
	Value string `json:"value"`
	Tone  string `json:"tone,omitempty"`
}

type QuickAction struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Icon     string `json:"icon"`
	Emphasis string `json:"emphasis,omitempty"`
}

type QuestionRow struct {
	Index     int    `json:"index"`
	Type      string `json:"type"`
	Dimension string `json:"dimension"`
	Strategy  string `json:"strategy"`
}

type SessionRow struct {
	Thread   string `json:"thread"`
	Status   string `json:"status"`
	Progress int    `json:"progress"`
}

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
	Available       int                     `json:"available"`
	InUse           int                     `json:"inUse"`
	RemainingQuota  string                  `json:"remainingQuota"`
	TotalQuota      string                  `json:"totalQuota"`
	QuotaKnown      bool                    `json:"quotaKnown"`
	RandomIPEnabled bool                    `json:"randomIpEnabled"`
	Source          string                  `json:"source"`
	Message         string                  `json:"message"`
	Quota           proxycore.QuotaSnapshot `json:"quota"`
}

type IPUsageRecord struct {
	Label string `json:"label"`
	Total int    `json:"total"`
}

type IPUsageSummary struct {
	RemainingQuota string          `json:"remainingQuota"`
	TotalQuota     string          `json:"totalQuota"`
	Available      int             `json:"available"`
	InUse          int             `json:"inUse"`
	Source         string          `json:"source"`
	Message        string          `json:"message"`
	UpdatedAt      string          `json:"updatedAt"`
	Records        []IPUsageRecord `json:"records"`
}

type DashboardState struct {
	SurveyTitle        string        `json:"surveyTitle"`
	SurveyURL          string        `json:"surveyUrl"`
	TargetCount        int           `json:"targetCount"`
	ThreadCount        int           `json:"threadCount"`
	RandomIPEnabled    bool          `json:"randomIpEnabled"`
	RandomIPQuota      int           `json:"randomIpQuota"`
	RandomIPQuotaLabel string        `json:"randomIpQuotaLabel"`
	RandomIPStatus     string        `json:"randomIpStatus"`
	RandomIPStatusTone string        `json:"randomIpStatusTone"`
	ProxySource        string        `json:"proxySource"`
	QuestionCount      int           `json:"questionCount"`
	ProgressCurrent    int           `json:"progressCurrent"`
	ProgressTarget     int           `json:"progressTarget"`
	ProgressPercent    int           `json:"progressPercent"`
	StatusText         string        `json:"statusText"`
	PlatformLabel      string        `json:"platformLabel"`
	Metrics            []PageMetric  `json:"metrics"`
	QuickActions       []QuickAction `json:"quickActions"`
	QuestionRows       []QuestionRow `json:"questionRows"`
	SessionRows        []SessionRow  `json:"sessionRows"`
}

type SettingField struct {
	ID          string   `json:"id"`
	Label       string   `json:"label"`
	Description string   `json:"description"`
	Kind        string   `json:"kind"`
	Value       string   `json:"value"`
	Options     []string `json:"options,omitempty"`
}

type SettingsGroup struct {
	Title  string         `json:"title"`
	Fields []SettingField `json:"fields"`
}

type StrategyRule struct {
	Condition string `json:"condition"`
	Action    string `json:"action"`
	Target    string `json:"target"`
}

type ReverseFillRow struct {
	Question string `json:"question"`
	Column   string `json:"column"`
	State    string `json:"state"`
}

type ShellState struct {
	AppTitle        string           `json:"appTitle"`
	AppVersion      string           `json:"appVersion"`
	ThemeMode       string           `json:"themeMode"`
	CurrentPage     string           `json:"currentPage"`
	TopNav          []NavItem        `json:"topNav"`
	BottomNav       []NavItem        `json:"bottomNav"`
	Dashboard       DashboardState   `json:"dashboard"`
	RuntimeGroups   []SettingsGroup  `json:"runtimeGroups"`
	StrategyRules   []StrategyRule   `json:"strategyRules"`
	DimensionGroups []string         `json:"dimensionGroups"`
	ReverseFillPlan []ReverseFillRow `json:"reverseFillPlan"`
	LogLines        []string         `json:"logLines"`
	CommunityItems  []string         `json:"communityItems"`
	AboutItems      []PageMetric     `json:"aboutItems"`
	DonateItems     []PageMetric     `json:"donateItems"`
	IPUsageItems    []PageMetric     `json:"ipUsageItems"`
	SettingsGroups  []SettingsGroup  `json:"settingsGroups"`
}

type AppService struct {
	survey   *surveycore.Client
	reporter submissionReporter
	runMu    sync.Mutex
	closeMu  sync.Mutex

	proxyMu        sync.Mutex
	run            RunTaskState
	cancel         context.CancelFunc
	proxy          *proxyRuntime
	pause          *runPauseController
	sleep          sleepBlocker
	closeConfirmed bool
}

func NewAppService() *AppService {
	proxy := newProxyRuntime(newIPUsageStore())
	return &AppService{
		survey:   surveycore.New(surveycore.WithFreeAIIdentityProvider(proxy)),
		proxy:    proxy,
		sleep:    newSystemSleepBlocker(),
		reporter: newHTTPSubmissionReporter(),
	}
}

func (s *AppService) surveyClient() *surveycore.Client {
	if s.survey != nil {
		return s.survey
	}
	return surveycore.New(surveycore.WithFreeAIIdentityProvider(s.proxyRuntime()))
}

func (s *AppService) proxyRuntime() *proxyRuntime {
	s.proxyMu.Lock()
	defer s.proxyMu.Unlock()
	if s.proxy == nil {
		s.proxy = newProxyRuntime(newIPUsageStore())
	}
	return s.proxy
}

func (s *AppService) sleepBlocker() sleepBlocker {
	if s.sleep == nil {
		s.sleep = newSystemSleepBlocker()
	}
	return s.sleep
}

func (s *AppService) GetShellState() ShellState {
	return initialShellState(displayAppVersion())
}

func (s *AppService) GetProxyStatus() ProxyStatus {
	return s.proxyRuntime().statusSnapshot()
}

func (s *AppService) GetIPUsageSummary() IPUsageSummary {
	return s.proxyRuntime().usageSummary()
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

func (s *AppService) GetAppSettings() (AppSettings, error) {
	return loadAppSettings()
}

func (s *AppService) SaveAppSettings(_ context.Context, request SaveSettingsRequest) (AppSettings, error) {
	return saveAppSettings(request.Settings)
}

func (s *AppService) ResetAppSettings() (AppSettings, error) {
	return saveAppSettings(defaultAppSettings())
}

func (s *AppService) ShouldConfirmClose() bool {
	settings, err := loadAppSettings()
	if err != nil {
		return true
	}
	return settings.AskSaveOnClose
}

func (s *AppService) ConfirmClose() {
	s.closeMu.Lock()
	defer s.closeMu.Unlock()
	s.closeConfirmed = true
}

func (s *AppService) consumeCloseConfirmed() bool {
	s.closeMu.Lock()
	defer s.closeMu.Unlock()
	if !s.closeConfirmed {
		return false
	}
	s.closeConfirmed = false
	return true
}

func (s *AppService) ExportLogLines(path string, lines []string) (string, error) {
	cleanPath := strings.TrimSpace(path)
	if cleanPath == "" {
		return "", fmt.Errorf("日志路径不能为空")
	}
	content := strings.Join(lines, "\n")
	if content != "" {
		content += "\n"
	}
	if err := os.WriteFile(cleanPath, []byte(content), 0o644); err != nil {
		return "", err
	}
	return cleanPath, nil
}

func (s *AppService) LoadConfig(_ context.Context, request LoadConfigRequest) (ConfigFileState, error) {
	settings, err := loadAppSettings()
	if err != nil {
		return ConfigFileState{}, err
	}
	path := configPathFromRequest(request.Path, settings)
	cfg, err := configio.Load(path, true)
	if err != nil {
		if strings.TrimSpace(request.Path) == "" && errors.Is(err, os.ErrNotExist) {
			empty := surveycore.RuntimeConfig{}
			empty = applyAIRuntimeDefaults(empty, settings, false)
			return ConfigFileState{Path: path, Config: &empty}, nil
		}
		return ConfigFileState{}, err
	}
	hasAISettings, err := runtimeConfigFileHasAISettings(path)
	if err != nil {
		return ConfigFileState{}, err
	}
	cfg = applyAIRuntimeDefaults(cfg, settings, hasAISettings)
	return ConfigFileState{Path: path, Config: &cfg}, nil
}

func (s *AppService) SaveConfig(_ context.Context, request SaveConfigRequest) (ConfigFileState, error) {
	settings, err := loadAppSettings()
	if err != nil {
		return ConfigFileState{}, err
	}
	path := strings.TrimSpace(request.Path)
	if path == "" {
		path = defaultSavePath(request.Config, settings)
	}
	savedPath, err := configio.Save(request.Config, path)
	if err != nil {
		return ConfigFileState{}, err
	}
	if _, err := saveAppSettings(settingsWithAIRuntimeDefaults(settings, request.Config)); err != nil {
		return ConfigFileState{}, err
	}
	cfg := request.Config
	return ConfigFileState{Path: savedPath, Config: &cfg}, nil
}

func (s *AppService) PreviewReverseFill(_ context.Context, request ReverseFillPreviewRequest) (reversefill.Preview, error) {
	return reversefill.PreviewExcel(reversefill.PreviewOptions{
		Path:          request.Path,
		Format:        request.Format,
		StartRow:      request.StartRow,
		Questions:     request.Questions,
		MaxSampleRows: 20,
	})
}

func (s *AppService) ParseSurvey(ctx context.Context, request ParseSurveyRequest) (SurveyCoreState, error) {
	url := strings.TrimSpace(request.URL)
	if url == "" {
		return SurveyCoreState{}, fmt.Errorf("问卷链接不能为空")
	}
	definition, err := s.surveyClient().Parse(ctx, url)
	if err != nil {
		return SurveyCoreState{}, err
	}
	return SurveyCoreState{Definition: definition}, nil
}

func (s *AppService) BuildDefaultConfig(ctx context.Context, request ParseSurveyRequest) (SurveyCoreState, error) {
	url := strings.TrimSpace(request.URL)
	if url == "" {
		return SurveyCoreState{}, fmt.Errorf("问卷链接不能为空")
	}
	config, err := s.surveyClient().DefaultConfig(ctx, url)
	if err != nil {
		return SurveyCoreState{}, err
	}
	settings, err := loadAppSettings()
	if err != nil {
		return SurveyCoreState{}, err
	}
	*config = applyAIRuntimeDefaults(*config, settings, false)
	return SurveyCoreState{Config: config}, nil
}

func (s *AppService) RunSurvey(ctx context.Context, request RunSurveyRequest) (SurveyCoreState, error) {
	var (
		events   []surveycore.Event
		eventsMu sync.Mutex
	)
	options, err := s.proxyRuntime().executionOptions(ctx, request.Config)
	if err != nil {
		return SurveyCoreState{}, err
	}
	if settings, err := loadAppSettings(); err == nil {
		_, _ = saveAppSettings(settingsWithAIRuntimeDefaults(settings, request.Config))
	}
	result, err := s.surveyClient().RunWithExecutionOptions(ctx, &request.Config, func(event surveycore.Event) {
		eventsMu.Lock()
		events = append(events, event)
		eventsMu.Unlock()
	}, options)
	if err != nil {
		return SurveyCoreState{Result: result, Events: events}, err
	}
	return SurveyCoreState{Result: result, Events: events}, nil
}

func (s *AppService) StartRun(ctx context.Context, request RunSurveyRequest) (RunTaskState, error) {
	s.runMu.Lock()
	if s.run.Running {
		state := s.cloneRunStateLocked()
		s.runMu.Unlock()
		return state, fmt.Errorf("任务正在运行")
	}
	cfg := request.Config
	if s, err := loadAppSettings(); err == nil {
		_, _ = saveAppSettings(settingsWithAIRuntimeDefaults(s, cfg))
	}
	options, err := s.proxyRuntime().executionOptions(ctx, cfg)
	if err != nil {
		state := s.cloneRunStateLocked()
		s.runMu.Unlock()
		return state, err
	}
	settings, err := loadAppSettings()
	if err != nil {
		state := s.cloneRunStateLocked()
		s.runMu.Unlock()
		return state, err
	}
	sleepAcquired := false
	if settings.PreventSleepDuringRun {
		sleepAcquired = s.sleepBlocker().Acquire()
	}
	runCtx, cancel := context.WithCancel(context.Background())
	pause := newRunPauseController()
	options.PauseController = pause
	s.cancel = cancel
	s.pause = pause
	s.run = RunTaskState{
		Running:   true,
		StartedAt: time.Now(),
		Config:    &cfg,
		Events:    []surveycore.Event{},
	}
	state := s.cloneRunStateLocked()
	s.runMu.Unlock()

	go s.runSurveyTask(runCtx, cfg, options, settings, sleepAcquired)
	return state, nil
}

func (s *AppService) GetRunTaskState() RunTaskState {
	s.runMu.Lock()
	defer s.runMu.Unlock()
	return s.cloneRunStateLocked()
}

func (s *AppService) CancelRun(_ context.Context) (RunTaskState, error) {
	s.runMu.Lock()
	if s.cancel != nil && s.run.Running {
		s.run.Canceling = true
		if s.pause != nil {
			s.pause.Resume()
		}
		s.cancel()
	}
	state := s.cloneRunStateLocked()
	s.runMu.Unlock()
	return state, nil
}

func (s *AppService) PauseRun(_ context.Context, reason string) (RunTaskState, error) {
	s.runMu.Lock()
	if !s.run.Running {
		state := s.cloneRunStateLocked()
		s.runMu.Unlock()
		return state, fmt.Errorf("没有正在运行的任务")
	}
	s.run.Paused = true
	s.run.PauseReason = strings.TrimSpace(reason)
	if s.run.PauseReason == "" {
		s.run.PauseReason = "手动暂停"
	}
	if s.pause != nil {
		s.pause.Pause(s.run.PauseReason)
	}
	state := s.cloneRunStateLocked()
	s.runMu.Unlock()
	return state, nil
}

func (s *AppService) ResumeRun(_ context.Context) (RunTaskState, error) {
	s.runMu.Lock()
	if s.pause != nil {
		s.pause.Resume()
	}
	s.run.Paused = false
	s.run.PauseReason = ""
	state := s.cloneRunStateLocked()
	s.runMu.Unlock()
	return state, nil
}

func (s *AppService) runSurveyTask(ctx context.Context, cfg surveycore.RuntimeConfig, options surveycore.ExecutionOptions, settings AppSettings, sleepAcquired bool) {
	if sleepAcquired {
		defer s.sleepBlocker().Release()
	}
	result, err := s.surveyClient().RunWithExecutionOptions(ctx, &cfg, func(event surveycore.Event) {
		s.runMu.Lock()
		s.run.Events = append(s.run.Events, event)
		s.runMu.Unlock()
	}, options)
	s.runMu.Lock()
	defer s.runMu.Unlock()
	s.run.Running = false
	s.run.Canceling = false
	s.run.Paused = false
	s.run.PauseReason = ""
	s.run.Result = result
	s.run.EndedAt = time.Now()
	if err != nil {
		s.run.Error = err.Error()
	} else {
		s.run.Error = ""
	}
	events := append([]surveycore.Event(nil), s.run.Events...)
	endedAt := s.run.EndedAt
	s.cancel = nil
	s.pause = nil
	// 任务结束后重读设置，确保运行期间的设置变更能对本次日志和上报生效。
	finalSettings, _ := loadAppSettings()
	go func() {
		_, _ = autoSaveRunLog(finalSettings, events, endedAt)
	}()
	if finalSettings.SubmissionReportTelemetry {
		go func() {
			reportCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			s.reportSubmissionResult(reportCtx, cfg, result, err)
		}()
	}
}

func (s *AppService) reportSubmissionResult(ctx context.Context, cfg surveycore.RuntimeConfig, result *surveycore.RunResult, runErr error) {
	if s.reporter == nil {
		return
	}
	session, err := s.proxyRuntime().officialProxyClient().SessionManager().Snapshot(ctx)
	if err != nil || !session.Authenticated() {
		return
	}
	s.reporter.Report(ctx, buildSubmissionReport(session, cfg, result, runErr))
}

func (s *AppService) cloneRunStateLocked() RunTaskState {
	state := s.run
	state.Events = append([]surveycore.Event(nil), s.run.Events...)
	if s.run.Config != nil {
		cfg := *s.run.Config
		state.Config = &cfg
	}
	return state
}
