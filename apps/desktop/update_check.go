package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	stableManifestURL = "https://dl.hungrym0.com/surveycontroller/win/stable/latest.json"
	latestSetupURL    = "https://dl.hungrym0.com/SurveyController_latest_setup.exe"
)

type checkUpdateRequest struct {
	CurrentVersion string `json:"currentVersion"`
}

type updateCheckState struct {
	Status        string `json:"status"`
	Message       string `json:"message"`
	LatestVersion string `json:"latestVersion,omitempty"`
	DownloadURL   string `json:"downloadUrl"`
	ReleaseNotes  string `json:"releaseNotes,omitempty"`
}

type stableReleaseManifest struct {
	Version      string `json:"version"`
	Tag          string `json:"tag"`
	InstallerURL string `json:"installer_url"`
	Notes        string `json:"notes"`
	Body         string `json:"body"`
}

func checkForUpdate(ctx context.Context, request checkUpdateRequest) (updateCheckState, error) {
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, stableManifestURL, nil)
	if err != nil {
		return updateCheckState{}, err
	}
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		return updateCheckState{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return updateCheckState{}, fmt.Errorf("更新源返回 %d", response.StatusCode)
	}
	var manifest stableReleaseManifest
	if err := json.NewDecoder(response.Body).Decode(&manifest); err != nil {
		return updateCheckState{}, err
	}
	latest := normalizeVersion(manifest.Version)
	if latest == "" {
		latest = normalizeVersion(manifest.Tag)
	}
	downloadURL := strings.TrimSpace(manifest.InstallerURL)
	if downloadURL == "" {
		downloadURL = latestSetupURL
	}
	state := updateCheckState{Status: "unknown", Message: "无法识别远端版本", LatestVersion: latest, DownloadURL: downloadURL}
	state.ReleaseNotes = strings.TrimSpace(manifest.Notes)
	if state.ReleaseNotes == "" {
		state.ReleaseNotes = strings.TrimSpace(manifest.Body)
	}
	comparison := compareVersions(latest, normalizeVersion(request.CurrentVersion))
	switch {
	case comparison > 0:
		state.Status = "outdated"
		state.Message = "发现新版本 v" + latest
	case comparison < 0:
		state.Status = "preview"
		state.Message = "当前版本高于远端版本 v" + latest
	case latest != "":
		state.Status = "latest"
		state.Message = "当前已是最新版本 v" + latest
	}
	return state, nil
}

func normalizeVersion(value string) string {
	return strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(value), "v"), "V")
}

func compareVersions(left, right string) int {
	leftParts := strings.Split(strings.Split(left, "-")[0], ".")
	rightParts := strings.Split(strings.Split(right, "-")[0], ".")
	if left == "" || right == "" {
		return 0
	}
	for index := 0; index < max(len(leftParts), len(rightParts)); index++ {
		leftPart, rightPart := 0, 0
		if index < len(leftParts) {
			leftPart, _ = strconv.Atoi(leftParts[index])
		}
		if index < len(rightParts) {
			rightPart, _ = strconv.Atoi(rightParts[index])
		}
		if leftPart < rightPart {
			return -1
		}
		if leftPart > rightPart {
			return 1
		}
	}
	return 0
}
