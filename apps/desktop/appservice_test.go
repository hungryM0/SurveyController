package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/xuri/excelize/v2"
	"surveycontroller/proxycore"
	"surveycontroller/surveycore"
)

func TestAppServiceRejectsEmptySurveyURL(t *testing.T) {
	service := NewAppService()
	_, err := service.ParseSurvey(context.Background(), ParseSurveyRequest{})
	if err == nil || !strings.Contains(err.Error(), "问卷链接不能为空") {
		t.Fatalf("err = %v", err)
	}

	_, err = service.BuildDefaultConfig(context.Background(), ParseSurveyRequest{})
	if err == nil || !strings.Contains(err.Error(), "问卷链接不能为空") {
		t.Fatalf("err = %v", err)
	}
}

func TestAppServiceProxyStatusUsesCoreTypes(t *testing.T) {
	service := NewAppService()
	status := service.GetProxyStatus()
	if status.Available != 0 || status.InUse != 0 || status.RemainingQuota != "0" {
		t.Fatalf("status = %#v", status)
	}
}

func TestAppServiceShellStateStartsFromRealEmptyState(t *testing.T) {
	service := NewAppService()
	state := service.GetShellState()
	if state.Dashboard.SurveyURL != "" || state.Dashboard.QuestionCount != 0 || state.Dashboard.ProgressCurrent != 0 {
		t.Fatalf("dashboard = %#v", state.Dashboard)
	}
	if state.Dashboard.SurveyTitle == "大学生消费观问卷" {
		t.Fatalf("shell state still contains demo survey: %#v", state.Dashboard)
	}
	for _, line := range state.LogLines {
		if strings.Contains(line, "假数据") || strings.Contains(line, "未接入") {
			t.Fatalf("shell state contains mock log line: %q", line)
		}
	}
}

func TestConfigVersionFromTextReadsInfoVersion(t *testing.T) {
	version := configVersionFromText(`
version: '3'

info:
  productName: "SurveyController"
  version: "9.8.7" # 应用版本号
`)
	if version != "9.8.7" {
		t.Fatalf("version = %q", version)
	}
}

func TestAppServiceProxyRuntimeUsesCustomAPI(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeAppJSON(t, w, map[string]any{"data": []string{"1.2.3.4:9000"}})
	}))
	defer server.Close()

	service := NewAppService()
	options, err := service.proxyRuntime().executionOptions(context.Background(), surveycore.RuntimeConfig{
		RandomIPEnabled: true,
		ProxySource:     "custom",
		CustomProxyAPI:  server.URL,
		Threads:         2,
	})
	if err != nil {
		t.Fatal(err)
	}
	if options.LeaseManager == nil {
		t.Fatal("lease manager is nil")
	}
	lease, err := options.LeaseManager.Acquire(context.Background(), "worker-1")
	if err != nil {
		t.Fatal(err)
	}
	if lease.Address != "http://1.2.3.4:9000" || lease.Source != "custom" {
		t.Fatalf("lease = %#v", lease)
	}
	status := service.GetProxyStatus()
	if status.Source != "custom" || status.InUse != 1 || status.Message != "自定义代理已连接" {
		t.Fatalf("status = %#v", status)
	}
	if _, ok := options.LeaseManager.Release("worker-1"); !ok {
		t.Fatal("lease was not released")
	}
	if status = service.GetProxyStatus(); status.InUse != 0 {
		t.Fatalf("status after release = %#v", status)
	}
}

func TestAppServiceProxyRuntimeUsesOfficialSource(t *testing.T) {
	var extractBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/trial":
			writeAppJSON(t, w, map[string]any{
				"user_id":         77,
				"remaining_quota": 5,
				"total_quota":     5,
				"used_quota":      0,
			})
		case "/extract":
			if err := json.NewDecoder(r.Body).Decode(&extractBody); err != nil {
				t.Fatalf("decode extract body: %v", err)
			}
			writeAppJSON(t, w, map[string]any{
				"provider":        "default",
				"remaining_quota": 4,
				"total_quota":     5,
				"used_quota":      1,
				"items": []map[string]any{
					{
						"host":      "1.2.3.4",
						"port":      9000,
						"account":   "u",
						"password":  "p",
						"expire_at": "2099-01-01T00:00:00+00:00",
					},
				},
			})
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	manager := proxycore.NewOfficialSessionManager(proxycore.OfficialSessionManagerOptions{
		InitialSession: proxycore.RandomIPSession{DeviceID: "desktop-test"},
	})
	service := &AppService{proxy: &proxyRuntime{officialClient: proxycore.NewOfficialClient(proxycore.OfficialClientOptions{
		TrialEndpoint:   server.URL + "/trial",
		ExtractEndpoint: server.URL + "/extract",
		SessionManager:  manager,
	})}}
	options, err := service.proxyRuntime().executionOptions(context.Background(), surveycore.RuntimeConfig{
		RandomIPEnabled: true,
		ProxySource:     "default",
		Threads:         2,
	})
	if err != nil {
		t.Fatal(err)
	}
	if options.LeaseManager == nil {
		t.Fatal("lease manager is nil")
	}
	lease, err := options.LeaseManager.Acquire(context.Background(), "worker-1")
	if err != nil {
		t.Fatal(err)
	}
	if lease.Address != "http://u:p@1.2.3.4:9000" || lease.Source != "default" {
		t.Fatalf("lease = %#v", lease)
	}
	if extractBody["user_id"] != float64(77) || extractBody["upstream"] != "default" {
		t.Fatalf("extract body = %#v", extractBody)
	}
	status := service.GetProxyStatus()
	if status.Source != "default" || status.RemainingQuota != "4" || status.TotalQuota != "5" || status.Message != "官方代理已连接" {
		t.Fatalf("status = %#v", status)
	}
}

func TestAppServiceSyncProxyStatusUsesOfficialClient(t *testing.T) {
	var trialBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/trial" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&trialBody); err != nil {
			t.Fatalf("decode trial body: %v", err)
		}
		writeAppJSON(t, w, map[string]any{
			"user_id":         88,
			"remaining_quota": 9,
			"total_quota":     10,
			"used_quota":      1,
		})
	}))
	defer server.Close()

	manager := proxycore.NewOfficialSessionManager(proxycore.OfficialSessionManagerOptions{
		InitialSession: proxycore.RandomIPSession{DeviceID: "desktop-test", UserID: 88},
	})
	service := &AppService{proxy: &proxyRuntime{officialClient: proxycore.NewOfficialClient(proxycore.OfficialClientOptions{
		TrialEndpoint:  server.URL + "/trial",
		SessionManager: manager,
	})}}
	status, err := service.SyncProxyStatus(context.Background(), "benefit")
	if err != nil {
		t.Fatal(err)
	}
	if len(trialBody) != 0 {
		t.Fatalf("trial body = %#v", trialBody)
	}
	if status.Source != "benefit" || status.RemainingQuota != "9" || status.TotalQuota != "10" || !status.QuotaKnown {
		t.Fatalf("status = %#v", status)
	}
}

func TestAppServiceRedeemProxyCardUpdatesQuota(t *testing.T) {
	var redeemBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/redeem":
			if err := json.NewDecoder(r.Body).Decode(&redeemBody); err != nil {
				t.Fatalf("decode redeem body: %v", err)
			}
			writeAppJSON(t, w, map[string]any{
				"redeemed":        true,
				"card_quota":      5,
				"remaining_quota": 8,
				"total_quota":     10,
				"used_quota":      2,
				"detail":          "ok",
			})
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	manager := proxycore.NewOfficialSessionManager(proxycore.OfficialSessionManagerOptions{
		InitialSession: proxycore.RandomIPSession{DeviceID: "desktop-test", UserID: 91, RemainingQuota: 3, TotalQuota: 10, UsedQuota: 7, QuotaKnown: true},
	})
	service := &AppService{proxy: &proxyRuntime{officialClient: proxycore.NewOfficialClient(proxycore.OfficialClientOptions{
		RedeemEndpoint: server.URL + "/redeem",
		SessionManager: manager,
	})}}

	state, err := service.RedeemProxyCard(context.Background(), RedeemProxyCardRequest{CardCode: " CARD-001 ", Source: "benefit"})
	if err != nil {
		t.Fatal(err)
	}
	if redeemBody["user_id"] != float64(91) || redeemBody["card_code"] != "CARD-001" {
		t.Fatalf("redeem body = %#v", redeemBody)
	}
	if !state.Redeemed || state.CardQuotaLabel != "5" || state.Status.RemainingQuota != "8" || state.Status.TotalQuota != "10" {
		t.Fatalf("state = %#v", state)
	}
	if state.Status.Source != "benefit" || state.Status.Message != "额度兑换成功" {
		t.Fatalf("status = %#v", state.Status)
	}
}

func TestAppServiceRedeemProxyCardRejectsBlankCardCode(t *testing.T) {
	service := NewAppService()
	state, err := service.RedeemProxyCard(context.Background(), RedeemProxyCardRequest{CardCode: " "})
	if err == nil || !strings.Contains(err.Error(), "卡密不能为空") {
		t.Fatalf("err = %v", err)
	}
	if state.Redeemed {
		t.Fatalf("state = %#v", state)
	}
}

func TestAppServiceRedeemProxyCardMapsKnownAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		writeAppJSON(t, w, map[string]any{"detail": "redeem_card_not_found"})
	}))
	defer server.Close()

	manager := proxycore.NewOfficialSessionManager(proxycore.OfficialSessionManagerOptions{
		InitialSession: proxycore.RandomIPSession{DeviceID: "desktop-test", UserID: 91},
	})
	service := &AppService{proxy: &proxyRuntime{officialClient: proxycore.NewOfficialClient(proxycore.OfficialClientOptions{
		RedeemEndpoint: server.URL,
		SessionManager: manager,
	})}}

	_, err := service.RedeemProxyCard(context.Background(), RedeemProxyCardRequest{CardCode: "CARD-404"})
	if err == nil || !strings.Contains(err.Error(), "该卡密不存在") {
		t.Fatalf("err = %v", err)
	}
}

func TestAppServiceProxyRuntimeUsesOfficialBenefitSource(t *testing.T) {
	var extractBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/trial":
			writeAppJSON(t, w, map[string]any{
				"user_id":         99,
				"remaining_quota": 6,
				"total_quota":     10,
				"used_quota":      4,
			})
		case "/extract":
			if err := json.NewDecoder(r.Body).Decode(&extractBody); err != nil {
				t.Fatalf("decode extract body: %v", err)
			}
			writeAppJSON(t, w, map[string]any{
				"provider":        "benefit",
				"remaining_quota": 5,
				"total_quota":     10,
				"used_quota":      5,
				"items": []map[string]any{
					{
						"host":      "2.2.2.2",
						"port":      9001,
						"account":   "bu",
						"password":  "bp",
						"expire_at": "2099-01-01T00:00:00+00:00",
					},
				},
			})
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	manager := proxycore.NewOfficialSessionManager(proxycore.OfficialSessionManagerOptions{
		InitialSession: proxycore.RandomIPSession{DeviceID: "desktop-test", UserID: 99, RemainingQuota: 7, TotalQuota: 10, UsedQuota: 3, QuotaKnown: true},
	})
	service := &AppService{proxy: &proxyRuntime{officialClient: proxycore.NewOfficialClient(proxycore.OfficialClientOptions{
		TrialEndpoint:   server.URL + "/trial",
		ExtractEndpoint: server.URL + "/extract",
		SessionManager:  manager,
	})}}
	options, err := service.proxyRuntime().executionOptions(context.Background(), surveycore.RuntimeConfig{
		RandomIPEnabled: true,
		ProxySource:     "benefit",
		Threads:         1,
	})
	if err != nil {
		t.Fatal(err)
	}
	lease, err := options.LeaseManager.Acquire(context.Background(), "worker-1")
	if err != nil {
		t.Fatal(err)
	}
	if lease.Address != "http://bu:bp@2.2.2.2:9001" || lease.Source != "benefit" {
		t.Fatalf("lease = %#v", lease)
	}
	if extractBody["upstream"] != "benefit" || extractBody["user_id"] != float64(99) {
		t.Fatalf("extract body = %#v", extractBody)
	}
	status := service.GetProxyStatus()
	if status.Source != "benefit" || status.RemainingQuota != "5" || status.TotalQuota != "10" {
		t.Fatalf("status = %#v", status)
	}
}

func TestAppServiceProxyRuntimeStopsWhenOfficialQuotaExhaustedAfterSync(t *testing.T) {
	extractCalled := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/trial":
			writeAppJSON(t, w, map[string]any{
				"user_id":         100,
				"remaining_quota": 0,
				"total_quota":     10,
				"used_quota":      10,
			})
		case "/extract":
			extractCalled = true
			t.Fatalf("extract should not be called")
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	manager := proxycore.NewOfficialSessionManager(proxycore.OfficialSessionManagerOptions{
		InitialSession: proxycore.RandomIPSession{DeviceID: "desktop-test", UserID: 100, RemainingQuota: 5, TotalQuota: 10, UsedQuota: 5, QuotaKnown: true},
	})
	service := &AppService{proxy: &proxyRuntime{officialClient: proxycore.NewOfficialClient(proxycore.OfficialClientOptions{
		TrialEndpoint:   server.URL + "/trial",
		ExtractEndpoint: server.URL + "/extract",
		SessionManager:  manager,
	})}}
	_, err := service.proxyRuntime().executionOptions(context.Background(), surveycore.RuntimeConfig{
		RandomIPEnabled: true,
		ProxySource:     "default",
		Threads:         1,
	})
	if err == nil || !strings.Contains(err.Error(), "额度已用完") {
		t.Fatalf("err = %v", err)
	}
	if extractCalled {
		t.Fatal("extract was called")
	}
	status := service.GetProxyStatus()
	if status.Message != "官方代理额度已用完" || status.RemainingQuota != "0" || status.TotalQuota != "10" {
		t.Fatalf("status = %#v", status)
	}
}

func TestAppServiceParsesTencentViaCoreClient(t *testing.T) {
	server := newAppTencentServer(t)
	defer server.Close()
	service := &AppService{survey: surveycore.New(surveycore.WithHTTPClient(rewriteTencentClient(server.URL)))}

	state, err := service.ParseSurvey(context.Background(), ParseSurveyRequest{URL: "https://wj.qq.com/s2/123/hashvalue/"})
	if err != nil {
		t.Fatal(err)
	}
	if state.Definition == nil || state.Definition.Provider != surveycore.ProviderQQ || len(state.Definition.Questions) != 2 {
		t.Fatalf("state = %#v", state)
	}

	configState, err := service.BuildDefaultConfig(context.Background(), ParseSurveyRequest{URL: "https://wj.qq.com/s2/123/hashvalue/"})
	if err != nil {
		t.Fatal(err)
	}
	if configState.Config == nil || configState.Config.SurveyProvider != surveycore.ProviderQQ || len(configState.Config.QuestionsInfo) != 2 {
		t.Fatalf("configState = %#v", configState)
	}
}

func TestAppServiceParsesCredamoViaCoreClient(t *testing.T) {
	server := newAppCredamoServer(t)
	defer server.Close()
	service := NewAppService()

	state, err := service.ParseSurvey(context.Background(), ParseSurveyRequest{URL: server.URL + "/s/demo_"})
	if err != nil {
		t.Fatal(err)
	}
	if state.Definition == nil || state.Definition.Provider != surveycore.ProviderCredamo || len(state.Definition.Questions) != 2 {
		t.Fatalf("state = %#v", state)
	}

	configState, err := service.BuildDefaultConfig(context.Background(), ParseSurveyRequest{URL: server.URL + "/s/demo_"})
	if err != nil {
		t.Fatal(err)
	}
	if configState.Config == nil || configState.Config.SurveyProvider != surveycore.ProviderCredamo || len(configState.Config.QuestionEntries) != 2 {
		t.Fatalf("configState = %#v", configState)
	}
}

func TestAppServiceRunSurveySubmitsTencentAndEvents(t *testing.T) {
	server := newAppTencentServer(t)
	defer server.Close()
	service := &AppService{survey: surveycore.New(surveycore.WithHTTPClient(rewriteTencentClient(server.URL)))}
	state, err := service.RunSurvey(context.Background(), RunSurveyRequest{
		Config: surveycore.RuntimeConfig{
			URL:            "https://wj.qq.com/s2/123/hashvalue/",
			SurveyProvider: surveycore.ProviderQQ,
			Target:         1,
		},
	})
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if state.Result == nil || state.Result.Success != 1 || len(state.Events) == 0 {
		t.Fatalf("state = %#v", state)
	}
}

func TestAppServiceStartRunStoresTaskState(t *testing.T) {
	server := newAppCredamoRunServer(t)
	defer server.Close()
	service := NewAppService()
	configState, err := service.BuildDefaultConfig(context.Background(), ParseSurveyRequest{URL: server.URL + "/s/demo_"})
	if err != nil {
		t.Fatal(err)
	}
	configState.Config.Target = 1

	state, err := service.StartRun(context.Background(), RunSurveyRequest{Config: *configState.Config})
	if err != nil {
		t.Fatal(err)
	}
	if !state.Running || state.StartedAt.IsZero() {
		t.Fatalf("initial state = %#v", state)
	}
	final := waitAppRun(t, service)
	if final.Running || final.Result == nil || final.Result.Success != 1 || len(final.Events) == 0 {
		t.Fatalf("final state = %#v", final)
	}
}

func TestAppServiceStartRunBlocksSleepWhenEnabled(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
	server := newAppCredamoRunServer(t)
	defer server.Close()
	service := NewAppService()
	blocker := &fakeSleepBlocker{acquireResult: true}
	service.sleep = blocker

	configState, err := service.BuildDefaultConfig(context.Background(), ParseSurveyRequest{URL: server.URL + "/s/demo_"})
	if err != nil {
		t.Fatal(err)
	}
	configState.Config.Target = 1

	if _, err := service.StartRun(context.Background(), RunSurveyRequest{Config: *configState.Config}); err != nil {
		t.Fatal(err)
	}
	waitAppRun(t, service)
	if blocker.acquireCalls != 1 || blocker.releaseCalls != 1 {
		t.Fatalf("blocker acquire=%d release=%d", blocker.acquireCalls, blocker.releaseCalls)
	}
}

func TestAppServiceStartRunSkipsSleepBlockerWhenDisabled(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
	server := newAppCredamoRunServer(t)
	defer server.Close()
	service := NewAppService()
	blocker := &fakeSleepBlocker{acquireResult: true}
	service.sleep = blocker

	settings, err := service.GetAppSettings()
	if err != nil {
		t.Fatal(err)
	}
	settings.PreventSleepDuringRun = false
	if _, err := service.SaveAppSettings(context.Background(), SaveSettingsRequest{Settings: settings}); err != nil {
		t.Fatal(err)
	}

	configState, err := service.BuildDefaultConfig(context.Background(), ParseSurveyRequest{URL: server.URL + "/s/demo_"})
	if err != nil {
		t.Fatal(err)
	}
	configState.Config.Target = 1

	if _, err := service.StartRun(context.Background(), RunSurveyRequest{Config: *configState.Config}); err != nil {
		t.Fatal(err)
	}
	waitAppRun(t, service)
	if blocker.acquireCalls != 0 || blocker.releaseCalls != 0 {
		t.Fatalf("blocker acquire=%d release=%d", blocker.acquireCalls, blocker.releaseCalls)
	}
}

func TestAppServiceStartRunReportsSubmissionWhenEnabled(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
	server := newAppCredamoRunServer(t)
	defer server.Close()
	reporter := newFakeSubmissionReporter()
	manager := proxycore.NewOfficialSessionManager(proxycore.OfficialSessionManagerOptions{
		InitialSession: proxycore.RandomIPSession{DeviceID: "device-1", UserID: 73952},
	})
	service := &AppService{
		survey:   surveycore.New(),
		proxy:    &proxyRuntime{officialClient: proxycore.NewOfficialClient(proxycore.OfficialClientOptions{SessionManager: manager})},
		sleep:    noopSleepBlocker{},
		reporter: reporter,
	}

	configState, err := service.BuildDefaultConfig(context.Background(), ParseSurveyRequest{URL: server.URL + "/s/demo_"})
	if err != nil {
		t.Fatal(err)
	}
	configState.Config.Target = 1
	configState.Config.ProxySource = "benefit"

	if _, err := service.StartRun(context.Background(), RunSurveyRequest{Config: *configState.Config}); err != nil {
		t.Fatal(err)
	}
	waitAppRun(t, service)
	report := reporter.wait(t)
	if report.UserID != 73952 || report.DeviceID != "device-1" || report.Result != "success" || report.ProxyProvider != "idiot" {
		t.Fatalf("report = %#v", report)
	}
	if report.SurveyURL != server.URL+"/s/demo_" {
		t.Fatalf("survey url = %q", report.SurveyURL)
	}
}

func TestAppServiceStartRunSkipsSubmissionReportWhenDisabled(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
	server := newAppCredamoRunServer(t)
	defer server.Close()
	reporter := newFakeSubmissionReporter()
	manager := proxycore.NewOfficialSessionManager(proxycore.OfficialSessionManagerOptions{
		InitialSession: proxycore.RandomIPSession{DeviceID: "device-1", UserID: 73952},
	})
	service := &AppService{
		survey:   surveycore.New(),
		proxy:    &proxyRuntime{officialClient: proxycore.NewOfficialClient(proxycore.OfficialClientOptions{SessionManager: manager})},
		sleep:    noopSleepBlocker{},
		reporter: reporter,
	}
	settings, err := service.GetAppSettings()
	if err != nil {
		t.Fatal(err)
	}
	settings.SubmissionReportTelemetry = false
	if _, err := service.SaveAppSettings(context.Background(), SaveSettingsRequest{Settings: settings}); err != nil {
		t.Fatal(err)
	}

	configState, err := service.BuildDefaultConfig(context.Background(), ParseSurveyRequest{URL: server.URL + "/s/demo_"})
	if err != nil {
		t.Fatal(err)
	}
	configState.Config.Target = 1

	if _, err := service.StartRun(context.Background(), RunSurveyRequest{Config: *configState.Config}); err != nil {
		t.Fatal(err)
	}
	waitAppRun(t, service)
	reporter.expectNoReport(t)
}

func TestAppServiceCancelRunMarksCanceling(t *testing.T) {
	service := NewAppService()
	state, err := service.StartRun(context.Background(), RunSurveyRequest{Config: surveycore.RuntimeConfig{
		URL:            "https://wj.qq.com/s2/123/hashvalue/",
		SurveyProvider: surveycore.ProviderQQ,
		Target:         1,
	}})
	if err != nil {
		t.Fatal(err)
	}
	if !state.Running {
		t.Fatalf("initial state = %#v", state)
	}
	state, err = service.CancelRun(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !state.Canceling && state.Running {
		t.Fatalf("cancel state = %#v", state)
	}
}

func TestAppServicePauseAndResumeRunState(t *testing.T) {
	service := &AppService{
		run:   RunTaskState{Running: true},
		pause: newRunPauseController(),
	}
	state, err := service.PauseRun(context.Background(), "风控")
	if err != nil {
		t.Fatal(err)
	}
	if !state.Paused || state.PauseReason != "风控" {
		t.Fatalf("pause state = %#v", state)
	}
	paused, reason := service.pause.Snapshot()
	if !paused || reason != "风控" {
		t.Fatalf("controller paused=%v reason=%q", paused, reason)
	}

	state, err = service.ResumeRun(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if state.Paused || state.PauseReason != "" {
		t.Fatalf("resume state = %#v", state)
	}
	paused, _ = service.pause.Snapshot()
	if paused {
		t.Fatal("controller is still paused")
	}
}

func TestAppServicePauseRunRejectsIdleState(t *testing.T) {
	service := NewAppService()
	state, err := service.PauseRun(context.Background(), "")
	if err == nil || !strings.Contains(err.Error(), "没有正在运行的任务") {
		t.Fatalf("err = %v", err)
	}
	if state.Paused {
		t.Fatalf("state = %#v", state)
	}
}

func TestAppServiceSettingsRoundTripUsesConfigHome(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
	service := NewAppService()

	settings, err := service.GetAppSettings()
	if err != nil {
		t.Fatal(err)
	}
	settings.ThemeMode = "dark"
	settings.ShowNavigationText = false
	settings.AskSaveOnClose = false
	settings.PreventSleepDuringRun = false
	settings.TaskResultNotification = false
	settings.SubmissionReportTelemetry = false
	settings.AutoCheckUpdate = false
	settings.AutoSaveLogs = false
	settings.AutosaveLogCount = 10

	saved, err := service.SaveAppSettings(context.Background(), SaveSettingsRequest{Settings: settings})
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := service.GetAppSettings()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.ThemeMode != "dark" || loaded.ShowNavigationText || saved.AutosaveLogCount != 10 {
		t.Fatalf("settings = %#v saved = %#v", loaded, saved)
	}
	if loaded.AskSaveOnClose || loaded.PreventSleepDuringRun || loaded.TaskResultNotification || loaded.SubmissionReportTelemetry || loaded.AutoCheckUpdate || loaded.AutoSaveLogs || loaded.Notifications {
		t.Fatalf("settings = %#v saved = %#v", loaded, saved)
	}
}

func TestAppServiceResetAppSettingsRestoresDefaults(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
	service := NewAppService()

	saved, err := service.SaveAppSettings(context.Background(), SaveSettingsRequest{Settings: AppSettings{
		ConfigDirectory:    "D:/custom",
		ThemeMode:          "dark",
		ShowNavigationText: false,
		MicaEnabled:        false,
		Topmost:            true,
		AskSaveOnClose:     false,
		AutoSaveLogs:       false,
		AutosaveLogCount:   10,
	}})
	if err != nil {
		t.Fatal(err)
	}
	if saved.ThemeMode != "dark" {
		t.Fatalf("saved = %#v", saved)
	}

	reset, err := service.ResetAppSettings()
	if err != nil {
		t.Fatal(err)
	}
	if reset.ThemeMode != "system" || !reset.ShowNavigationText || !reset.MicaEnabled || reset.Topmost || reset.AutosaveLogCount != 10 {
		t.Fatalf("reset = %#v", reset)
	}
	if !reset.AskSaveOnClose || !reset.PreventSleepDuringRun || !reset.TaskResultNotification || !reset.SubmissionReportTelemetry || !reset.AutoCheckUpdate || !reset.AutoSaveLogs || !reset.Notifications {
		t.Fatalf("reset = %#v", reset)
	}

	loaded, err := service.GetAppSettings()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.ThemeMode != "system" || loaded.ConfigDirectory == "D:/custom" {
		t.Fatalf("loaded = %#v", loaded)
	}
}

func TestAppServiceStartupTutorialHintShowsUntilDismissed(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
	service := NewAppService()

	hint, err := service.GetStartupTutorialHint()
	if err != nil {
		t.Fatal(err)
	}
	if !hint.ShouldShow || hint.DocURL != startupTutorialDocURL {
		t.Fatalf("hint = %#v", hint)
	}

	settings, err := service.DismissStartupTutorialHint()
	if err != nil {
		t.Fatal(err)
	}
	if !settings.StartupTutorialHintSeen {
		t.Fatalf("settings = %#v", settings)
	}

	hint, err = service.GetStartupTutorialHint()
	if err != nil {
		t.Fatal(err)
	}
	if hint.ShouldShow {
		t.Fatalf("hint after dismiss = %#v", hint)
	}
}

func TestAppServiceClaimRandomIPBonusUsesOfficialClient(t *testing.T) {
	var requestBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/bonus" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
			t.Fatalf("decode bonus body: %v", err)
		}
		writeAppJSON(t, w, map[string]any{
			"claimed":         true,
			"bonus_quota":     5,
			"remaining_quota": 6,
			"total_quota":     7,
			"used_quota":      1,
			"detail":          "ok",
		})
	}))
	defer server.Close()

	manager := proxycore.NewOfficialSessionManager(proxycore.OfficialSessionManagerOptions{
		InitialSession: proxycore.RandomIPSession{DeviceID: "desktop-test", UserID: 99},
	})
	service := &AppService{proxy: &proxyRuntime{officialClient: proxycore.NewOfficialClient(proxycore.OfficialClientOptions{
		BonusEndpoint:  server.URL + "/bonus",
		SessionManager: manager,
	})}}

	state, err := service.ClaimRandomIPBonus(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if requestBody["user_id"] != float64(99) || requestBody["bonus_code"] != randomIPBonusCode {
		t.Fatalf("bonus body = %#v", requestBody)
	}
	if !state.Claimed || state.BonusQuota != 5 || state.Detail != "ok" || !state.PlayConfetti {
		t.Fatalf("state = %#v", state)
	}
}

func TestAppServiceTestAIConnection(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if payload["model"] != "demo-model" {
			t.Fatalf("payload = %#v", payload)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{
				"message": map[string]any{"content": "连接成功"},
			}},
		})
	}))
	defer server.Close()

	state := NewAppService().TestAIConnection(context.Background(), TestAIConnectionRequest{
		Config: surveycore.RuntimeConfig{
			AIMode:        "provider",
			AIProvider:    "custom",
			AIAPIKey:      "sk-test",
			AIBaseURL:     server.URL + "/v1",
			AIAPIProtocol: "chat_completions",
			AIModel:       "demo-model",
		},
	})
	if !state.Success || !strings.Contains(state.Message, "连接成功") {
		t.Fatalf("state = %#v", state)
	}
	if requests != 1 {
		t.Fatalf("requests = %d", requests)
	}

	failed := NewAppService().TestAIConnection(context.Background(), TestAIConnectionRequest{
		Config: surveycore.RuntimeConfig{AIMode: "provider", AIProvider: "custom"},
	})
	if failed.Success || !strings.Contains(failed.Message, "API Key") {
		t.Fatalf("failed = %#v", failed)
	}
}

func TestAppServiceLoadLegacySettingsAppliesNewDefaults(t *testing.T) {
	root := t.TempDir()
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", root)
	if err := os.WriteFile(filepath.Join(root, "settings.json"), []byte(`{"themeMode":"dark","notifications":false,"autosaveLogCount":5}`), 0o644); err != nil {
		t.Fatal(err)
	}

	service := NewAppService()
	settings, err := service.GetAppSettings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.ThemeMode != "dark" || settings.AutosaveLogCount != 5 {
		t.Fatalf("settings = %#v", settings)
	}
	if settings.TaskResultNotification || settings.Notifications {
		t.Fatalf("legacy notification value was not preserved: %#v", settings)
	}
	if !settings.AskSaveOnClose || !settings.PreventSleepDuringRun || !settings.SubmissionReportTelemetry || !settings.AutoCheckUpdate || !settings.AutoSaveLogs {
		t.Fatalf("new defaults were not applied: %#v", settings)
	}
}

func TestAppServiceCloseConfirmationState(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
	service := NewAppService()
	if !service.ShouldConfirmClose() {
		t.Fatal("close should ask by default")
	}
	if service.consumeCloseConfirmed() {
		t.Fatal("close confirmation should not be pre-confirmed")
	}
	service.ConfirmClose()
	if !service.consumeCloseConfirmed() {
		t.Fatal("close confirmation was not consumed")
	}
	if service.consumeCloseConfirmed() {
		t.Fatal("close confirmation should be one-shot")
	}

	settings, err := service.GetAppSettings()
	if err != nil {
		t.Fatal(err)
	}
	settings.AskSaveOnClose = false
	if _, err := service.SaveAppSettings(context.Background(), SaveSettingsRequest{Settings: settings}); err != nil {
		t.Fatal(err)
	}
	if service.ShouldConfirmClose() {
		t.Fatal("close should not ask when disabled")
	}
}

func TestAppServiceExportLogLinesWritesFile(t *testing.T) {
	service := NewAppService()
	path := filepath.Join(t.TempDir(), "runtime.log")

	saved, err := service.ExportLogLines(path, []string{"[core] start", "[core] done"})
	if err != nil {
		t.Fatal(err)
	}
	if saved != path {
		t.Fatalf("saved = %q", saved)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "[core] start\n[core] done\n" {
		t.Fatalf("data = %q", string(data))
	}
}

func TestAutoSaveRunLogWritesLastSessionAndPrunes(t *testing.T) {
	localRoot := t.TempDir()
	t.Setenv("SURVEYCONTROLLER_LOCAL_DATA_HOME", localRoot)
	logsDir := filepath.Join(localRoot, "logs")
	if err := os.MkdirAll(logsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	oldPath := filepath.Join(logsDir, "session_20000101_000000.log")
	if err := os.WriteFile(oldPath, []byte("old\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	saved, err := autoSaveRunLog(AppSettings{AutoSaveLogs: true, AutosaveLogCount: 1}, []surveycore.Event{
		{Worker: "worker-1", Message: "start"},
		{Worker: "worker-1", Message: "done"},
	}, time.Date(2026, 6, 30, 14, 45, 0, 0, time.Local))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(filepath.Base(saved), ".log") {
		t.Fatalf("saved = %q", saved)
	}
	last, err := os.ReadFile(filepath.Join(logsDir, "last_session.log"))
	if err != nil {
		t.Fatal(err)
	}
	if string(last) != "[worker-1] start\n[worker-1] done\n" {
		t.Fatalf("last = %q", string(last))
	}
	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Fatalf("old log was not pruned: %v", err)
	}
}

func TestAutoSaveRunLogDisabledRemovesLastSession(t *testing.T) {
	localRoot := t.TempDir()
	t.Setenv("SURVEYCONTROLLER_LOCAL_DATA_HOME", localRoot)
	logsDir := filepath.Join(localRoot, "logs")
	if err := os.MkdirAll(logsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	lastPath := filepath.Join(logsDir, "last_session.log")
	if err := os.WriteFile(lastPath, []byte("old\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := autoSaveRunLog(AppSettings{AutoSaveLogs: false, AutosaveLogCount: 10}, []surveycore.Event{{Message: "ignored"}}, time.Now()); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(lastPath); !os.IsNotExist(err) {
		t.Fatalf("last_session.log was not removed: %v", err)
	}
}

func TestAppServiceConfigRoundTrip(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
	service := NewAppService()

	state, err := service.SaveConfig(context.Background(), SaveConfigRequest{
		Config: surveycore.RuntimeConfig{
			URL:                   "https://wj.qq.com/s2/123/hash/",
			SurveyTitle:           "腾讯配置",
			SurveyProvider:        surveycore.ProviderQQ,
			Target:                6,
			Threads:               2,
			RandomIPEnabled:       true,
			ReverseFillEnabled:    true,
			ReverseFillSourcePath: "D:/demo.xlsx",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if state.Path == "" || !strings.HasSuffix(filepath.Base(state.Path), ".json") {
		t.Fatalf("state = %#v", state)
	}

	loaded, err := service.LoadConfig(context.Background(), LoadConfigRequest{Path: state.Path})
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Config == nil || loaded.Config.Target != 6 || !loaded.Config.RandomIPEnabled || !loaded.Config.ReverseFillEnabled {
		t.Fatalf("loaded = %#v", loaded)
	}
}

func TestAppServiceLoadConfigAppliesAIRuntimeDefaults(t *testing.T) {
	configRoot := t.TempDir()
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", configRoot)
	settings := defaultAppSettings()
	settings.RuntimeDefaults = map[string]string{
		"ai_mode":         "provider",
		"ai_provider":     "custom",
		"ai_api_key":      "sk-local",
		"ai_base_url":     "https://ai.example/v1",
		"ai_api_protocol": "responses",
		"ai_model":        "demo-model",
	}
	if _, err := saveAppSettings(settings); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(configRoot, "no-ai.json")
	if err := os.WriteFile(path, []byte(`{"url":"https://www.wjx.cn/vm/demo.aspx","target":2}`), 0o644); err != nil {
		t.Fatal(err)
	}

	state, err := NewAppService().LoadConfig(context.Background(), LoadConfigRequest{Path: path})
	if err != nil {
		t.Fatal(err)
	}
	if state.Config == nil || state.Config.AIAPIKey != "sk-local" || state.Config.AIProvider != "custom" || state.Config.AIAPIProtocol != "responses" {
		t.Fatalf("config = %#v", state.Config)
	}
}

func TestAppServiceLoadConfigKeepsFileAISettings(t *testing.T) {
	configRoot := t.TempDir()
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", configRoot)
	settings := defaultAppSettings()
	settings.RuntimeDefaults = map[string]string{"ai_api_key": "sk-local"}
	if _, err := saveAppSettings(settings); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(configRoot, "with-ai.json")
	if err := os.WriteFile(path, []byte(`{"url":"https://www.wjx.cn/vm/demo.aspx","ai_mode":"provider","ai_provider":"deepseek","ai_api_key":"sk-file"}`), 0o644); err != nil {
		t.Fatal(err)
	}

	state, err := NewAppService().LoadConfig(context.Background(), LoadConfigRequest{Path: path})
	if err != nil {
		t.Fatal(err)
	}
	if state.Config == nil || state.Config.AIAPIKey != "sk-file" {
		t.Fatalf("config = %#v", state.Config)
	}
}

func TestAppServiceSaveConfigPersistsAIRuntimeDefaults(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
	service := NewAppService()

	_, err := service.SaveConfig(context.Background(), SaveConfigRequest{
		Config: surveycore.RuntimeConfig{
			URL:           "https://www.wjx.cn/vm/demo.aspx",
			AIMode:        "provider",
			AIProvider:    "custom",
			AIAPIKey:      "sk-save",
			AIBaseURL:     "https://ai.example/v1",
			AIAPIProtocol: "responses",
			AIModel:       "demo-model",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	settings, err := loadAppSettings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.RuntimeDefaults["ai_api_key"] != "sk-save" || settings.RuntimeDefaults["ai_provider"] != "custom" {
		t.Fatalf("runtime defaults = %#v", settings.RuntimeDefaults)
	}
}

func TestAppServiceLoadDefaultConfigMissingReturnsEmpty(t *testing.T) {
	t.Setenv("SURVEYCONTROLLER_CONFIG_HOME", t.TempDir())
	service := NewAppService()

	state, err := service.LoadConfig(context.Background(), LoadConfigRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if state.Config == nil || state.Path == "" {
		t.Fatalf("state = %#v", state)
	}
}

func TestAppServicePreviewReverseFill(t *testing.T) {
	path := filepath.Join(t.TempDir(), "reverse.xlsx")
	file := excelize.NewFile()
	sheet := file.GetSheetName(0)
	_ = file.SetSheetRow(sheet, "A1", &[]any{"1、单选题", "2、文本题"})
	_ = file.SetSheetRow(sheet, "A2", &[]any{"B", "hello"})
	if err := file.SaveAs(path); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	service := NewAppService()
	preview, err := service.PreviewReverseFill(context.Background(), ReverseFillPreviewRequest{
		Path:     path,
		Format:   "wjx_text",
		StartRow: 1,
		Questions: []surveycore.QuestionMeta{
			{Num: 1, Title: "单选题", TypeCode: "3", OptionTexts: []string{"A", "B"}},
			{Num: 2, Title: "文本题", TypeCode: "1", TextInputs: 1},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(preview.SampleRows) != 1 || len(preview.SampleRows[0].Answers) != 2 {
		t.Fatalf("preview = %#v", preview)
	}
}

func newAppTencentServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v2/respondent/surveys/123/session":
			writeAppJSON(t, w, map[string]any{"code": "OK", "data": map[string]any{}})
		case "/api/v2/respondent/surveys/123/meta":
			writeAppJSON(t, w, map[string]any{"code": "OK", "data": map[string]any{"title": "腾讯标题 - 腾讯问卷"}})
		case "/api/v2/respondent/surveys/123/questions":
			writeAppJSON(t, w, map[string]any{
				"code": "OK",
				"data": map[string]any{
					"questions": []map[string]any{
						{"id": "q1", "type": "radio", "title": "单选", "page_id": "p1", "page": 1, "options": []map[string]any{{"id": "a", "text": "A"}, {"id": "b", "text": "B"}}},
						{"id": "q2", "type": "textarea", "title": "文本", "page_id": "p1", "page": 1},
					},
				},
			})
		case "/api/v2/respondent/surveys/123/answers":
			if r.Method != http.MethodPost {
				t.Fatalf("method = %s", r.Method)
			}
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode tencent submit body: %v", err)
			}
			if _, ok := body["answer_survey"].(map[string]any); !ok {
				t.Fatalf("answer_survey = %#v", body["answer_survey"])
			}
			writeAppJSON(t, w, map[string]any{"code": "OK", "data": map[string]any{"ok": true}})
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
}

func newAppCredamoServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/survey/noauth/detail/get/demoano" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		writeAppJSON(t, w, map[string]any{
			"success": true,
			"data": map[string]any{
				"surveyTitle": "见数标题",
				"questions": []map[string]any{
					{"qstNo": "Q1", "qstTitle": "单选", "questionType": 2, "selector": 1, "questionId": "q1", "choices": []map[string]any{{"display": "A"}, {"display": "B"}}},
					{"qstNo": "Q2", "qstTitle": "文本", "questionType": 1, "questionId": "q2"},
				},
			},
		})
	}))
}

func newAppCredamoRunServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/survey/noauth/detail/get/demoano":
			writeAppJSON(t, w, map[string]any{
				"success": true,
				"data": map[string]any{
					"surveyTitle": "见数标题",
					"questions": []map[string]any{
						{"qstNo": "Q1", "qstTitle": "单选", "questionType": 2, "selector": 1, "qstId": 101, "choices": []map[string]any{{"choiceId": 1, "display": "A"}, {"choiceId": 2, "display": "B"}}},
					},
				},
			})
		case "/v1/survey/answer/noauth/init/demoano":
			writeAppJSON(t, w, map[string]any{
				"success": true,
				"data": map[string]any{
					"answerToken": "token-1",
					"timestamp":   1700000000000,
				},
			})
		case "/v1/survey/answer/noauth/save":
			writeAppJSON(t, w, map[string]any{"success": true, "data": map[string]any{"ok": true}})
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
}

func waitAppRun(t *testing.T, service *AppService) RunTaskState {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		state := service.GetRunTaskState()
		if !state.Running {
			return state
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("run did not finish")
	return RunTaskState{}
}

func rewriteTencentClient(baseURL string) *http.Client {
	return &http.Client{
		Transport: rewriteTencentTransport{baseURL: baseURL, next: http.DefaultTransport},
	}
}

type rewriteTencentTransport struct {
	baseURL string
	next    http.RoundTripper
}

func (t rewriteTencentTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL.Host == "wj.qq.com" {
		rewritten, err := http.NewRequestWithContext(req.Context(), req.Method, strings.Replace(req.URL.String(), "https://wj.qq.com", t.baseURL, 1), req.Body)
		if err != nil {
			return nil, err
		}
		rewritten.Header = req.Header.Clone()
		req = rewritten
	}
	return t.next.RoundTrip(req)
}

func writeAppJSON(t *testing.T, w http.ResponseWriter, value any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		t.Fatal(err)
	}
}

type fakeSleepBlocker struct {
	acquireResult bool
	acquireCalls  int
	releaseCalls  int
}

func (f *fakeSleepBlocker) Acquire() bool {
	f.acquireCalls++
	return f.acquireResult
}

func (f *fakeSleepBlocker) Release() bool {
	f.releaseCalls++
	return true
}

type fakeSubmissionReporter struct {
	reports chan submissionReport
}

func newFakeSubmissionReporter() *fakeSubmissionReporter {
	return &fakeSubmissionReporter{reports: make(chan submissionReport, 1)}
}

func (f *fakeSubmissionReporter) Report(_ context.Context, report submissionReport) bool {
	f.reports <- report
	return true
}

func (f *fakeSubmissionReporter) wait(t *testing.T) submissionReport {
	t.Helper()
	select {
	case report := <-f.reports:
		return report
	case <-time.After(time.Second):
		t.Fatal("submission report was not sent")
		return submissionReport{}
	}
}

func (f *fakeSubmissionReporter) expectNoReport(t *testing.T) {
	t.Helper()
	select {
	case report := <-f.reports:
		t.Fatalf("unexpected submission report: %#v", report)
	case <-time.After(100 * time.Millisecond):
		return
	}
}
