package main

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
	SettingsGroups  []SettingsGroup  `json:"settingsGroups"`
}
